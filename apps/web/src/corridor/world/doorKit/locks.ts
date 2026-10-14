import { mulRgb } from '../colour.ts';
import { nth } from '../math.ts';
import { bar, cylinder, stud, torus } from '../shapes.ts';
import { buildClosure } from './closures.ts';
import { bevelOf, span, zFace, type Ctx } from './ctx.ts';
import type { LockPart } from './character.ts';
import { HANDLE_IRON } from './handles.ts';
import type { PlanPart } from './plan.ts';

/**
 * The locks a door's character names beyond its handle: a rim lock, a thumb latch, a barrel bolt,
 * a hasp and padlock. Each is a different mechanism, a different silhouette on the leaf, so two
 * doors never share a lock. A lock that the spec already builds (the handle, a chain's padlock,
 * the Apartment's bolt) is not built twice: the plan marks it `handle` or `closure`.
 */

const JAPAN = { colour: [0.02, 0.02, 0.022] as const };

/**
 * A rim lock: a black japanned case screwed to the face of the lock rail, a brass keyhole plate
 * in its lower corner, and a brass edge on the case where hands and keys wear it bright.
 */
function rimLock(c: Ctx, p: LockPart): void {
  const b = nth(c.leaf, p.leaf);
  const [x, y] = p.centre;
  const metal = { colour: c.tints.metal };
  const w = 0.165;
  const h = 0.105;
  const z0 = zFace;
  span(b.iron, [x - w / 2, x + w / 2], [y - h / 2, y + h / 2], [z0, z0 + 0.038], bevelOf(c, 0.005), JAPAN);
  c.relief.push({ x: [x - w / 2, x + w / 2], y: [y - h / 2, y + h / 2], z: z0 + 0.038 });
  // A brass cover plate on the case's face, with two screws and a keyhole.
  span(b.brass, [x - w / 2 + 0.012, x + w / 2 - 0.012], [y - h / 2 + 0.01, y + h / 2 - 0.01], [z0 + 0.038, z0 + 0.0415], bevelOf(c, 0.0015), metal);
  const kx = x - p.dir * 0.045;
  stud(b.brass, [kx, y - 0.004, z0 + 0.0425], 0.016, 0.016, 0.004, 16, metal);
  span(b.iron, [kx - 0.0025, kx + 0.0025], [y - 0.02, y - 0.002], [z0 + 0.0445, z0 + 0.0452], 0, { colour: [0.01, 0.01, 0.01] });
  for (const sx of [-1, 1] as const) for (const sy of [-1, 1] as const) {
    stud(b.brass, [x + sx * (w / 2 - 0.02), y + sy * (h / 2 - 0.016), z0 + 0.0425], 0.0034, 0.0034, 0.0022, 6, metal);
  }
  // The lock's keep on the frame side: a small steel box on the leaf's free edge.
  const leaf = nth(c.plan.leaves, p.leaf);
  const edge = leaf.x1;
  span(b.iron, [Math.min(edge, edge - p.dir * 0.03), Math.max(edge, edge - p.dir * 0.03)], [y - 0.04, y + 0.04], [z0, z0 + 0.012], bevelOf(c, 0.002), { colour: HANDLE_IRON });
}

/**
 * A Suffolk thumb latch: a long iron back plate, a thumb press at the top that lifts the latch
 * bar behind the leaf, and the pull bar the hand takes. Hand-forged, so its edges are not square.
 */
function thumbLatch(c: Ctx, p: LockPart): void {
  const b = nth(c.leaf, p.leaf);
  const [x, y] = p.centre;
  const iron = { colour: HANDLE_IRON };
  const z0 = zFace;
  span(b.iron, [x - 0.022, x + 0.022], [y - 0.1, y + 0.1], [z0, z0 + 0.007], bevelOf(c, 0.002), iron);
  // Rounded plate ends: bosses at top and bottom.
  stud(b.iron, [x, y + 0.1, z0 + 0.0035], 0.0235, 0.0235, 0.007, 14, iron);
  stud(b.iron, [x, y - 0.1, z0 + 0.0035], 0.0235, 0.0235, 0.007, 14, iron);
  // The thumb press: a short tongue with a pad, angled up from the plate.
  bar(b.iron, { at: [x, y + 0.075, z0 + 0.016], rot: [0.5, 0, 0] }, [0.018, 0.07, 0.008], iron);
  stud(b.iron, [x, y + 0.108, z0 + 0.03], 0.016, 0.016, 0.006, 12, iron);
  // The latch bar across the leaf, a flat strap with a hook end, and its two staples.
  const leaf = nth(c.plan.leaves, p.leaf);
  const toward = leaf.x1 > leaf.x0 ? 1 : -1;
  const bx0 = x;
  const bx1 = x + toward * 0.17;
  span(b.iron, [Math.min(bx0, bx1), Math.max(bx0, bx1)], [y - 0.012, y + 0.012], [z0 + 0.007, z0 + 0.013], bevelOf(c, 0.001), iron);
  for (const sx of [bx0 + toward * 0.03, bx1 - toward * 0.02]) stud(b.iron, [sx, y, z0 + 0.016], 0.007, 0.007, 0.008, 8, iron);
  // Rivets through the plate.
  for (const sy of [-0.1, 0.1]) stud(b.iron, [x, y + sy, z0 + 0.0085], 0.005, 0.0042, 0.003, 8, { colour: mulRgb(HANDLE_IRON, 1.4) });
}

/**
 * A hasp and staple with a padlock through them: a hinged strap on the leaf, a staple on the
 * frame side, and the lock hanging from it. Used where a door has a second, stouter lock.
 */
function haspAndPadlock(c: Ctx, p: LockPart): void {
  const b = nth(c.leaf, p.leaf);
  const [x, y] = p.centre;
  const iron = { colour: HANDLE_IRON };
  const z0 = zFace;
  span(b.iron, [x - 0.026, x + 0.026], [y - 0.06, y + 0.11], [z0, z0 + 0.006], bevelOf(c, 0.002), iron);
  stud(b.iron, [x, y + 0.11, z0 + 0.003], 0.026, 0.026, 0.006, 14, iron);
  // The staple: a small loop the strap's eye passes over.
  torus(b.iron, { at: [x, y - 0.05, z0 + 0.012], rot: [Math.PI / 2, 0, 0] }, 0.012, 0.004, 5, 10, iron, Math.PI);
  for (const sy of [0.1, 0.0]) stud(b.iron, [x, y + sy, z0 + 0.0075], 0.005, 0.0042, 0.003, 8, { colour: mulRgb(HANDLE_IRON, 1.4) });
  buildClosure(c, { kind: 'closure-padlock', centre: [x, y - 0.03, z0], size: [0.06, 0.08], leaf: p.leaf } as PlanPart);
}

/** A barrel bolt, drawn with the closure builder at the position the lock plan chose. */
function slidingBolt(c: Ctx, p: LockPart): void {
  buildClosure(c, { kind: 'closure-bolt', centre: [p.centre[0], p.centre[1], zFace], size: [0.2, 0.05], leaf: p.leaf } as PlanPart);
}

/** A brass cylinder night-latch: a round case with a key ring and a small snib. */
export function cylinderLatch(c: Ctx, leaf: number, x: number, y: number): void {
  const b = nth(c.leaf, leaf);
  const metal = { colour: c.tints.metal };
  stud(b.brass, [x, y, zFace + 0.014], 0.026, 0.026, 0.028, 22, metal);
  torus(b.brass, { at: [x, y, zFace + 0.029] }, 0.0215, 0.0035, 5, 22, metal);
  stud(b.iron, [x, y - 0.004, zFace + 0.0305], 0.0042, 0.0042, 0.003, 8, { colour: [0.01, 0.01, 0.01] });
  cylinder(b.brass, { at: [x + 0.033, y, zFace + 0.013], rot: [0, 0, Math.PI / 2] }, 0.0045, 0.0045, 0.016, 8, metal);
}

export function buildLocks(c: Ctx): void {
  const ch = c.plan.character;
  if (!ch) return;
  for (const p of ch.locks) {
    switch (p.build) {
      case 'rim-lock':
        rimLock(c, p);
        break;
      case 'thumb-latch':
        thumbLatch(c, p);
        break;
      case 'sliding-bolt':
        slidingBolt(c, p);
        break;
      case 'padlock':
        haspAndPadlock(c, p);
        break;
      default:
        break;
    }
  }
}
