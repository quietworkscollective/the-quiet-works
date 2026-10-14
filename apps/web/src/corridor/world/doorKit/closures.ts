import { linear } from '../colour.ts';
import { cylinder, stud, torus } from '../shapes.ts';
import { bevelOf, span, zFace, type Ctx } from './ctx.ts';
import type { PlanPart } from './plan.ts';
import { HANDLE_IRON } from './handles.ts';
import { nth } from '../math.ts';

/**
 * Physical signs that a door will not open: a chain, a padlock, a paper seal, a barrel bolt.
 * They are fixed to the leaf (a sealed door only ever rattles) and never carry light: a sealed
 * door shows its closure and nothing else.
 */

const PAPER = linear('#9c9582');
const WAX = linear('#5A2A26');

export function buildClosure(c: Ctx, part: PlanPart): void {
  switch (part.kind) {
    case 'closure-chain':
      return chain(c);
    case 'closure-padlock':
      return padlock(c, part);
    case 'closure-seal':
      return seal(c, part);
    case 'closure-bolt':
      return bolt(c, part);
    default:
  }
}

/** Two heavy loops of chain through the pair's ring-pulls, sagging between them. */
function chain(c: Ctx): void {
  const b = nth(c.leaf, 0).iron;
  const style = { colour: HANDLE_IRON };
  const handles = c.plan.parts.filter((p) => p.kind === 'handle');
  const left = handles.reduce((a, h) => (h.centre[0] < a.centre[0] ? h : a));
  const right = handles.reduce((a, h) => (h.centre[0] > a.centre[0] ? h : a));
  const x0 = left.centre[0];
  const x1 = right.centre[0];
  // The ring hangs 0.04 below its pivot; the chain runs through the bottom of each ring.
  const yRing = left.centre[1] - 0.085;
  const loops = c.lod === 'near' ? [{ sag: 0.2, z: 0.05 }, { sag: 0.3, z: 0.062 }] : [{ sag: 0.24, z: 0.055 }];
  const pitch = 0.0215;
  for (const [li, loop] of loops.entries()) {
    const pts: [number, number][] = [];
    const n = 64;
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const y = yRing - loop.sag * (1 - Math.pow(2 * t - 1, 2));
      pts.push([x, y]);
    }
    // Walk the polyline, dropping a link every `pitch` of arc length.
    let acc = pitch / 2;
    let flat = li % 2 === 0;
    for (let i = 0; i + 1 < pts.length; i += 1) {
      const [ax, ay] = nth(pts, i);
      const [bx, by] = nth(pts, i + 1);
      const seg = Math.hypot(bx - ax, by - ay);
      acc += seg;
      while (acc >= pitch) {
        acc -= pitch;
        const t = 1 - acc / seg;
        const px = ax + (bx - ax) * t;
        const py = ay + (by - ay) * t;
        const a = Math.atan2(by - ay, bx - ax);
        const at: [number, number, number] = [px, py, zFace + loop.z];
        if (flat) torus(b, { at, rot: [0, 0, a], scale: [1.55, 1, 1] }, 0.0105, 0.0029, 5, 9, style);
        else torus(b, { at, rot: [Math.PI / 2, 0, a], order: 'ZYX', scale: [1.55, 1, 1] }, 0.0105, 0.0029, 5, 9, style);
        flat = !flat;
      }
    }
  }
}

function padlock(c: Ctx, part: PlanPart): void {
  const b = nth(c.leaf, part.leaf ?? 0);
  const [x, y] = [part.centre[0], part.centre[1]];
  const metal = { colour: c.tints.metal };
  const z = zFace + (part.leaf === undefined ? 0.07 : 0.03);
  span(b.brass, [x - 0.027, x + 0.027], [y - 0.034, y + 0.026], [z - 0.011, z + 0.011], bevelOf(c, 0.004), metal);
  torus(b.iron, { at: [x, y + 0.026, z] }, 0.0175, 0.0045, 5, 12, { colour: HANDLE_IRON }, Math.PI);
  // Keyhole: a dark slot on the face.
  span(b.iron, [x - 0.0025, x + 0.0025], [y - 0.014, y - 0.002], [z + 0.0105, z + 0.0115], 0, { colour: [0.01, 0.01, 0.01] });
}

/** A paper seal strip across the latch edge, with a wax seal at its centre. */
function seal(c: Ctx, part: PlanPart): void {
  const leaf = nth(c.plan.leaves, part.leaf ?? 0);
  const b = nth(c.leaf, part.leaf ?? 0);
  const x = leaf.x1;
  const [y, h] = [part.centre[1], part.size[1]];
  span(b.paint, [x - 0.026, x + 0.026], [y - h / 2, y + h / 2], [zFace + 0.0005, zFace + 0.0027], 0, { colour: PAPER, uv: { du: 0.3, dv: 0.1 } }, ['-z']);
  cylinder(b.paint, { at: [x, y, zFace + 0.0055], rot: [Math.PI / 2, 0, 0] }, 0.021, 0.023, 0.0058, 18, { colour: WAX });
  torus(b.paint, { at: [x, y, zFace + 0.0087] }, 0.013, 0.002, 4, 16, { colour: [WAX[0] * 0.7, WAX[1] * 0.7, WAX[2] * 0.7] });
}

/** A barrel bolt near the head of the leaf, on its latch side. */
function bolt(c: Ctx, part: PlanPart): void {
  const leaf = nth(c.plan.leaves, part.leaf ?? 0);
  const b = nth(c.leaf, part.leaf ?? 0);
  const dir = leaf.x1 > leaf.x0 ? 1 : -1;
  const y = part.centre[1];
  const xFree = leaf.x1 - dir * 0.05;
  const metal = { colour: c.tints.metal };
  const xa = xFree - dir * 0.2;
  span(b.brass, [Math.min(xa, xFree), Math.max(xa, xFree)], [y - 0.022, y + 0.022], [zFace, zFace + 0.004], bevelOf(c, 0.002), metal, ['-z']);
  const xm = (xa + xFree) / 2;
  cylinder(b.brass, { at: [xm, y, zFace + 0.0145], rot: [0, 0, Math.PI / 2] }, 0.0085, 0.0085, 0.17, 12, metal);
  for (const sx of [-0.06, 0.06]) span(b.brass, [xm + sx - 0.008, xm + sx + 0.008], [y - 0.015, y + 0.015], [zFace + 0.004, zFace + 0.0125], 0, metal);
  stud(b.brass, [xm + dir * 0.02, y + 0.012, zFace + 0.0145 + 0.0085], 0.004, 0.004, 0.02, 8, metal);
  cylinder(b.brass, { at: [xm + dir * 0.02, y + 0.022, zFace + 0.025], rot: [0, 0, 0] }, 0.011, 0.011, 0.008, 10, metal);
}
