import { quad, type Bucket } from '../builder.ts';
import { linear, type Rgb } from '../colour.ts';
import { foliageUv, type FoliageCell } from '../foliageLayout.ts';
import { mulberry32, type Vec2, type Vec3 } from '../math.ts';
import { bar, lathe, stud } from '../shapes.ts';
import type { Ctx } from './ctx.ts';
import { FRAME } from './frame.ts';

/**
 * Plants beside doors (ADR 0004): at most two in the corridor, nothing standing more than 150 mm
 * out of the wall. The Great Atrium's carries a trained climber on wire guides from a half-round
 * pot; the Apartment's, a fern in a wall pocket by the door, as a tenant would keep. Leaves are
 * cut-out cards from the foliage atlas in one bucket; stems and wires are thin bars.
 */

/** The farthest any part of a plant may stand out of the wall plane. */
export const PLANT_PROJECTION = 0.15;

const POT = linear('#6B4A38');
const STEM = linear('#3A2C1C');
const WIRE = linear('#6A5A3A');

/** One leaf card standing on a stem, leaning out of the wall by `tilt` and turned by `roll`. */
export function leafCard(b: Bucket, base: Vec3, size: readonly [number, number], roll: number, tiltWanted: number, cell: FoliageCell, colour: Rgb): void {
  const [w, h] = size;
  // However it is asked to lean, a leaf never reaches past the plant's projection limit.
  const z0 = Math.max(0.008, base[2]);
  const tilt = Math.min(tiltWanted, Math.asin(Math.min(1, Math.max(0, (PLANT_PROJECTION - 0.004 - z0) / h))));
  base = [base[0], base[1], z0];
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const at = (x: number, y: number): Vec3 => {
    const rx = x * cr - y * sr;
    const ry = x * sr + y * cr;
    return [base[0] + rx, base[1] + ry * ct, base[2] + ry * st];
  };
  const uv = foliageUv(cell);
  const uvs: readonly [Vec2, Vec2, Vec2, Vec2] = [
    [uv[0], uv[1]],
    [uv[2], uv[1]],
    [uv[2], uv[3]],
    [uv[0], uv[3]],
  ];
  quad(b, at(-w / 2, 0), at(w / 2, 0), at(w / 2, h), at(-w / 2, h), { colour }, [0, 0, 1], uvs);
}

/**
 * A leaf card growing from `base` along the unit direction `out`, `size[1]` long and `size[0]`
 * wide, its flat side facing up (or toward `lean` when given): for plants that spread in the room
 * rather than climbing a wall.
 */
export function leafAlong(b: Bucket, base: Vec3, out: Vec3, size: readonly [number, number], cell: FoliageCell, colour: Rgb, twist = 0): void {
  const [w, h] = size;
  const len = Math.hypot(out[0], out[1], out[2]) || 1;
  const o: Vec3 = [out[0] / len, out[1] / len, out[2] / len];
  // The card's width runs across the direction of growth, horizontal, then twisted about it.
  let side: Vec3 = [-o[2], 0, o[0]];
  const sl = Math.hypot(side[0], side[1], side[2]);
  side = sl < 1e-6 ? [1, 0, 0] : [side[0] / sl, 0, side[2] / sl];
  const up: Vec3 = [o[1] * side[2] - o[2] * side[1], o[2] * side[0] - o[0] * side[2], o[0] * side[1] - o[1] * side[0]];
  const ct = Math.cos(twist);
  const st = Math.sin(twist);
  const sx: Vec3 = [side[0] * ct + up[0] * st, side[1] * ct + up[1] * st, side[2] * ct + up[2] * st];
  const at = (a: number, t: number): Vec3 => [base[0] + sx[0] * a + o[0] * t, base[1] + sx[1] * a + o[1] * t, base[2] + sx[2] * a + o[2] * t];
  const uv = foliageUv(cell);
  const uvs: readonly [Vec2, Vec2, Vec2, Vec2] = [
    [uv[0], uv[1]],
    [uv[2], uv[1]],
    [uv[2], uv[3]],
    [uv[0], uv[3]],
  ];
  quad(b, at(-w / 2, 0), at(w / 2, 0), at(w / 2, h), at(-w / 2, h), { colour }, [up[0], up[1], up[2]], uvs);
}

/** A leaf colour: a deep green with a spread of light and a little yellow in the young ones. */
export function green(rng: () => number, bright: number): Rgb {
  const t = rng();
  return [0.035 + t * 0.05 * bright, 0.13 + t * 0.12 * bright, 0.05 + t * 0.035 * bright];
}

/** A stem from `from` to `to`, as short straight pieces with a little wander, in the paint bucket. */
export function stem(b: Bucket, from: Vec3, to: Vec3, thick: number, rng: () => number, wander: number, againstWall = true): Vec3[] {
  const pts: Vec3[] = [from];
  const n = Math.max(3, Math.round(Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.12));
  for (let i = 1; i <= n; i += 1) {
    const t = i / n;
    const p: Vec3 = [
      from[0] + (to[0] - from[0]) * t + (i === n ? 0 : (rng() - 0.5) * wander),
      from[1] + (to[1] - from[1]) * t,
      (() => {
        const z = from[2] + (to[2] - from[2]) * t + (i === n ? 0 : (rng() - 0.5) * wander * 0.4);
        // A climber's stem stays within the plant's reach of the wall; a free-standing plant's does not.
        return againstWall ? Math.min(PLANT_PROJECTION - 0.04, Math.max(0.012, z)) : z;
      })(),
    ];
    const a = pts[pts.length - 1] as Vec3;
    const len = Math.hypot(p[0] - a[0], p[1] - a[1], p[2] - a[2]);
    const ang = Math.atan2(p[1] - a[1], p[0] - a[0]);
    bar(b, { at: [(a[0] + p[0]) / 2, (a[1] + p[1]) / 2, (a[2] + p[2]) / 2], rot: [0, 0, ang] }, [len, thick, thick], { colour: STEM });
    pts.push(p);
  }
  return pts;
}

/** A half-round glazed pot standing against the wall: a lathed body, soil, and a lip. */
function halfPot(c: Ctx, x: number, y: number, radius: number, height: number): void {
  const b = c.fixed.paint;
  const profile: [number, number][] = [
    [0.001, 0],
    [radius * 0.7, 0],
    [radius * 0.82, height * 0.15],
    [radius * 0.95, height * 0.7],
    [radius, height * 0.94],
    [radius * 1.04, height],
    [radius * 0.96, height],
    [radius * 0.9, height * 0.94],
  ];
  lathe(b, { at: [x, y, 0] }, profile, c.lod === 'near' ? 22 : 10, { colour: POT });
  // Soil: a dark disc just under the lip.
  stud(c.fixed.rubber, [x, y + height * 0.9, 0], radius * 0.88, radius * 0.88, 0.01, 18, { colour: [0.45, 0.4, 0.36] });
}

/** The Atrium's trained climber: three stems up two brass wires beside the frame, with ivy-like leaves. */
function trainedClimber(c: Ctx, side: 1 | -1): void {
  const rng = mulberry32(c.seed ^ 0x1f123bb5);
  const hw = c.plan.hole.width / 2;
  const x0 = side * (hw + FRAME.architrave + 0.3);
  const top = Math.min(2.85, c.plan.hole.height - 0.1);
  halfPot(c, x0, 0, 0.14, 0.3);
  // Two brass wires up the wall, with eyes every half metre holding them off it.
  const wires = [x0 - 0.07, x0 + 0.07];
  for (const wx of wires) {
    bar(c.fixed.brass, { at: [wx, top / 2 + 0.2, 0.026] }, [0.0035, top - 0.4, 0.0035], { colour: WIRE });
    for (let y = 0.5; y < top; y += 0.5) stud(c.fixed.brass, [wx, y, 0.013], 0.006, 0.006, 0.026, 8, { colour: WIRE });
  }
  const leaves = c.lod === 'near' ? 1 : 0.35;
  const stems: Vec3[][] = [];
  for (let k = 0; k < 3; k += 1) {
    const sx = x0 + (k - 1) * 0.06;
    const tx = x0 + (k - 1) * 0.1 + (rng() - 0.5) * 0.06;
    stems.push(stem(c.fixed.paint, [sx, 0.3, 0.03], [tx, top - k * 0.22, 0.045], 0.0065, rng, 0.03));
  }
  const cells: FoliageCell[] = ['ivy', 'ivy', 'oval'];
  for (const pts of stems) {
    for (let i = 1; i < pts.length; i += 1) {
      const p = pts[i] as Vec3;
      const pieces = Math.max(1, Math.round(2 * leaves));
      for (let j = 0; j < pieces; j += 1) {
        const size = 0.052 + rng() * 0.035;
        const along = (rng() - 0.5) * 0.12;
        const base: Vec3 = [p[0] + (rng() - 0.5) * 0.05, p[1] + along, Math.min(PLANT_PROJECTION - 0.03, p[2] + 0.004 + rng() * 0.03)];
        leafCard(c.fixed.foliage, base, [size * 0.95, size], (rng() - 0.5) * 3.2, 0.08 + rng() * 0.5, cells[Math.floor(rng() * cells.length)] as FoliageCell, green(rng, 1 + p[1] * 0.12));
      }
    }
  }
}

/** A fern in a wall pocket at hand height: a plaster-brown half cone and nine arching fronds. */
function wallFern(c: Ctx, side: 1 | -1): void {
  const rng = mulberry32(c.seed ^ 0x2b7a31c9);
  const hw = c.plan.hole.width / 2;
  const x0 = side * (hw + FRAME.architrave + 0.24);
  const y0 = 0.95;
  const profile: [number, number][] = [
    [0.001, 0],
    [0.045, 0],
    [0.095, 0.09],
    [0.125, 0.16],
    [0.13, 0.18],
    [0.115, 0.18],
  ];
  lathe(c.fixed.paint, { at: [x0, y0, 0] }, profile, c.lod === 'near' ? 20 : 9, { colour: POT });
  // A bracket under it, and a hook into the wall.
  bar(c.fixed.iron, { at: [x0, y0 - 0.015, 0.05] }, [0.014, 0.014, 0.1], { colour: [0.06, 0.06, 0.065] });
  const fronds = c.lod === 'near' ? 11 : 5;
  for (let k = 0; k < fronds; k += 1) {
    const a = ((k + 0.5) / fronds) * Math.PI * 0.95 + Math.PI * 0.025;
    // Fronds fan out in the plane of the wall and arch only a little away from it.
    const dx = Math.cos(a) * 0.17;
    const len = 0.2 + rng() * 0.1;
    leafCard(c.fixed.foliage, [x0 + dx * 0.25, y0 + 0.17, 0.04 + rng() * 0.03], [len * 0.5, len], a - Math.PI / 2 + (rng() - 0.5) * 0.15, 0.08 + rng() * 0.3, 'frond', green(rng, 1.2));
  }
}

/** The plants a door has: its trained climber, and a pot by it if its look gives it one. */
export function buildFoliage(c: Ctx): void {
  const ch = c.plan.character;
  if (!ch || c.lod !== 'near') return;
  if (ch.foliage === 'trained' || ch.foliage === 'potted') trainedClimber(c, 1);
  if (ch.pot === 'fern') wallFern(c, 1);
}
