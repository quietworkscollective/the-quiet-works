import { tri } from '../builder.ts';
import { linear, mixRgb, mulRgb, type Rgb } from '../colour.ts';
import { cellUv } from '../marksLayout.ts';
import type { Vec2 } from '../math.ts';
import { nth } from '../math.ts';
import { cylinder, stud } from '../shapes.ts';
import { cellDecalOnLeaf, decalOnLeaf } from './decals.ts';
import { bevelOf, span, zFace, type Ctx } from './ctx.ts';
import { cylinderLatch } from './locks.ts';
import { surfaceUnder } from './motifs.ts';
import { HANDLE_IRON } from './handles.ts';

/**
 * One signature detail per authored door: the thing that is this door's alone (ADR 0004 gives the
 * world lane licence to go beyond the table). Each is small, explained by an ordinary cause, and
 * inside the shared envelope: plaques, typography and thresholds stay shared. They are listed in
 * the report so a reviewer can accept or strike each.
 *
 *   Certification Office   the ghost of the larger plaque that hung here before the move
 *   Apartment              a hairline split in the lower panel, held by two butterfly keys
 *   Tomorrow Engine        a leather-wrapped grip on the handwheel (handles.ts), where a spoke was replaced
 *   Great Atrium           brass kick plates, polished at the toe
 *   blank 0L               the ghost of a brass 4 (the Apartment's number is on another door)
 *   blank 0R               a brass cylinder night-latch above the knob
 *   blank 1L               a bolted steel patch over a letterbox slot, rust running from one rivet
 *   blank 2R               the filled outlines of a lock plate and bell-pull, sanded flush
 *   blank 3R               a segmental fanlight over the pair (fanlight.ts)
 *   blank 4R               strap hinges and a stout bar pull
 *   blank 5L               a flattened biscuit tin nailed over a hole in the lower panel
 *   blank 7L               a brass fleuron at the centre of every oval
 *   blank 7R               a brass finger plate behind the lever
 */

const RUST: Rgb = linear('#6E3B22');

function handleOf(c: Ctx): readonly [number, number] {
  const ch = c.plan.character;
  const lock = ch?.locks[0];
  const h = c.plan.parts.find((p) => p.kind === 'handle' && (p.leaf ?? 0) === (lock?.leaf ?? 0)) ?? c.plan.parts.find((p) => p.kind === 'handle');
  return h ? [h.centre[0], h.centre[1]] : [0, 1];
}

/** The ghost of a larger plaque: a darker, unfaded rectangle round the present one, with its screw holes. */
function oldPlaqueGhost(c: Ctx): void {
  const b = nth(c.leaf, 0).marks;
  const centre: readonly [number, number] = [0, 1.55];
  const size: readonly [number, number] = [0.37, 0.15];
  const z = surfaceUnder(c, [centre[0] - size[0] / 2, centre[0] + size[0] / 2], [centre[1] - size[1] / 2, centre[1] + size[1] / 2]) + 0.0011;
  cellDecalOnLeaf(b, 'patch', centre, [size[0] * 1.25, size[1] * 1.4], z, mulRgb(c.tints.primary, 0.78));
  for (const sx of [-1, 1] as const) for (const sy of [-1, 1] as const) {
    cellDecalOnLeaf(b, 'solid', [centre[0] + sx * (size[0] / 2 - 0.012), centre[1] + sy * (size[1] / 2 - 0.012)], [0.007, 0.007], z + 0.0004, [0.01, 0.01, 0.01]);
  }
}

/** A hairline crack in the lower panel with two bow-tie keys of darker timber let across it. */
function butterflyKeys(c: Ctx): void {
  const b = nth(c.leaf, 0).marks;
  const x = -c.spec.width * 0.2;
  const y0 = 0.3;
  const y1 = 0.78;
  const z = surfaceUnder(c, [x - 0.05, x + 0.05], [y0, y1]) + 0.0012;
  decalOnLeaf(b, cellUv('crack'), [x, (y0 + y1) / 2], [0.07, y1 - y0], z, [1, 1, 1]);
  const key = mulRgb(linear('#3A2A1E'), 1.3);
  const su = cellUv('solid');
  const solid: Vec2 = [(su[0] + su[2]) / 2, (su[1] + su[3]) / 2];
  for (const t of [0.3, 0.7]) {
    const cy = y0 + (y1 - y0) * t;
    const w = 0.034;
    const h = 0.022;
    // A bow-tie: two triangles meeting at the crack.
    const zz = z + 0.0006;
    const style = { colour: key };
    tri(b, [x - w, cy + h, zz], [x, cy, zz], [x - w, cy - h, zz], style, [0, 0, 1], [solid, solid, solid]);
    tri(b, [x + w, cy + h, zz], [x + w, cy - h, zz], [x, cy, zz], style, [0, 0, 1], [solid, solid, solid]);
    cellDecalOnLeaf(b, 'solid', [x, cy], [0.006, 0.014], zz + 0.0003, [0.9, 0.9, 0.9]);
  }
}

/** Brass kick plates across the foot of each leaf: screwed on, bright along the top, scuffed at the toe. */
function brassKickPlates(c: Ctx): void {
  const metal = { colour: c.tints.metal };
  c.plan.leaves.forEach((leaf, i) => {
    const b = nth(c.leaf, i);
    const x0 = Math.min(leaf.x0, leaf.x1) + 0.035;
    const x1 = Math.max(leaf.x0, leaf.x1) - 0.035;
    span(b.brass, [x0, x1], [0.035, 0.265], [zFace - 0.0005, zFace + 0.004], bevelOf(c, 0.0015), metal);
    c.relief.push({ x: [x0, x1], y: [0.035, 0.265], z: zFace + 0.004 });
    // The top edge, polished by cleaners' cloths, a lighter line.
    span(b.brass, [x0, x1], [0.258, 0.265], [zFace + 0.0035, zFace + 0.0047], 0, { colour: mulRgb(c.tints.metal, 1.7) });
    for (const sx of [x0 + 0.02, x1 - 0.02, (x0 + x1) / 2]) for (const sy of [0.05, 0.25]) stud(b.brass, [sx, sy, zFace + 0.0045], 0.0045, 0.0045, 0.0022, 6, metal);
  });
}

/** The ghost of a brass 4 whose number was taken to the Apartment's door: cleaner paint, two screw holes. */
function ghostNumber(c: Ctx): void {
  const b = nth(c.leaf, 0).marks;
  const centre: readonly [number, number] = [0, 1.55];
  const size: readonly [number, number] = [0.095, 0.098];
  const z = surfaceUnder(c, [centre[0] - 0.05, centre[0] + 0.05], [centre[1] - 0.05, centre[1] + 0.05]) + 0.0011;
  decalOnLeaf(b, cellUv('ghost4'), centre, size, z, mixRgb(c.tints.primary, [0.9, 0.78, 0.7], 0.32));
}

/** A steel plate bolted over the slot of a letterbox that was sealed, with rust running from a bolt. */
function patchPlate(c: Ctx): void {
  const b = nth(c.leaf, 0);
  const cx = c.spec.width * 0.12;
  const cy = 1.18;
  const w = 0.24;
  const h = 0.3;
  const front = surfaceUnder(c, [cx - w / 2, cx + w / 2], [cy - h / 2, cy + h / 2]);
  const plate = { colour: mulRgb(c.tints.primary, 1.0) };
  span(b.paint, [cx - w / 2, cx + w / 2], [cy - h / 2, cy + h / 2], [front - 0.002, front + 0.006], bevelOf(c, 0.002), plate);
  c.relief.push({ x: [cx - w / 2, cx + w / 2], y: [cy - h / 2, cy + h / 2], z: front + 0.006 });
  const bolt = { colour: mulRgb(HANDLE_IRON, 1.5) };
  const pts: [number, number][] = [];
  for (const sx of [-1, 1] as const) for (const sy of [-1, 0, 1] as const) pts.push([cx + sx * (w / 2 - 0.022), cy + sy * (h / 2 - 0.022)]);
  for (const [px, py] of pts) stud(b.iron, [px, py, front + 0.0075], 0.0085, 0.0085, 0.004, 8, bolt);
  const [bx, by] = nth(pts, 4);
  cellDecalOnLeaf(b.marks, 'drip', [bx, by - 0.2], [0.05, 0.42], front + 0.0095, RUST);
}

/** The outlines of fittings that were taken away, filled and sanded: the paint remembers where they were. */
function filledOutlines(c: Ctx): void {
  const b = nth(c.leaf, 0).marks;
  const [hx, hy] = handleOf(c);
  const tint = mulRgb(c.tints.primary, 0.78);
  const spots: [number, number, number, number][] = [
    [hx, hy + 0.3, 0.17, 0.13],
    [hx - Math.sign(hx || 1) * 0.22, 1.72, 0.13, 0.1],
  ];
  for (const [x, y, w, h] of spots) {
    const z = surfaceUnder(c, [x - w / 2, x + w / 2], [y - h / 2, y + h / 2]) + 0.0011;
    cellDecalOnLeaf(b, 'filled', [x, y], [w, h], z, tint);
  }
}

/** Three strap hinges and a stout bar pull: a narrow steel door that has been made to take weight. */
function strapHingesAndPull(c: Ctx): void {
  const leaf = nth(c.plan.leaves, 0);
  const b = nth(c.leaf, 0);
  const iron = { colour: mulRgb(HANDLE_IRON, 1.2) };
  const dir = leaf.x1 > leaf.x0 ? 1 : -1;
  const hinge = leaf.x0;
  for (const y of [0.3, 1.15, 2.0]) {
    const len = Math.abs(leaf.width) * 0.42;
    span(b.iron, [Math.min(hinge, hinge + dir * len), Math.max(hinge, hinge + dir * len)], [y - 0.028, y + 0.028], [zFace, zFace + 0.008], bevelOf(c, 0.002), iron);
    cylinder(b.iron, { at: [hinge, y, zFace + 0.008] }, 0.021, 0.021, 0.07, 12, iron);
    for (const t of [0.35, 0.7]) stud(b.iron, [hinge + dir * len * t, y, zFace + 0.0105], 0.0085, 0.0085, 0.005, 8, iron);
  }
  const [hx, hy] = handleOf(c);
  const metal = { colour: c.tints.metal };
  cylinder(b.brass, { at: [hx, hy, zFace + 0.05] }, 0.0155, 0.0155, 0.36, 14, metal);
  for (const sy of [-0.15, 0.15]) {
    stud(b.brass, [hx, hy + sy, zFace + 0.024], 0.012, 0.012, 0.04, 10, metal);
    stud(b.brass, [hx, hy + sy, zFace + 0.004], 0.026, 0.026, 0.008, 16, metal);
  }
}

/** A flattened biscuit tin nailed over a hole in the lower panel, its printed band faded to a stripe. */
function biscuitTin(c: Ctx): void {
  const b = nth(c.leaf, 0);
  const cx = -c.spec.width * 0.12;
  const cy = 0.5;
  const w = 0.3;
  const h = 0.2;
  const front = surfaceUnder(c, [cx - w / 2, cx + w / 2], [cy - h / 2, cy + h / 2]);
  const tin = { colour: c.tints.secondary };
  span(b.paint, [cx - w / 2, cx + w / 2], [cy - h / 2, cy + h / 2], [front - 0.001, front + 0.0035], bevelOf(c, 0.0015), tin);
  c.relief.push({ x: [cx - w / 2, cx + w / 2], y: [cy - h / 2, cy + h / 2], z: front + 0.0035 });
  // A raised rim where the lid's edge was, and a band of faded red print.
  span(b.paint, [cx - w / 2 + 0.012, cx + w / 2 - 0.012], [cy + h / 2 - 0.05, cy + h / 2 - 0.035], [front + 0.0035, front + 0.0042], 0, { colour: mulRgb(RUST, 1.7) });
  const nail = { colour: mulRgb(HANDLE_IRON, 1.6) };
  for (const sx of [-1, 0, 1] as const) for (const sy of [-1, 1] as const) {
    stud(b.iron, [cx + sx * (w / 2 - 0.015), cy + sy * (h / 2 - 0.014), front + 0.0044], 0.0042, 0.0034, 0.0022, 6, nail);
  }
}

/** A brass fleuron at the centre of each oval: a boss with a ring, turned from a single piece. */
function fleurons(c: Ctx): void {
  const metal = { colour: c.tints.metal };
  for (const o of c.ovals) {
    const leafIndex = c.plan.leaves.findIndex((l) => o.cx >= Math.min(l.x0, l.x1) && o.cx <= Math.max(l.x0, l.x1));
    const b = nth(c.leaf, Math.max(0, leafIndex));
    const z = surfaceUnder(c, [o.cx - 0.03, o.cx + 0.03], [o.cy - 0.03, o.cy + 0.03]);
    stud(b.brass, [o.cx, o.cy, z + 0.004], 0.036, 0.036, 0.008, 20, metal);
    stud(b.brass, [o.cx, o.cy, z + 0.009], 0.016, 0.016, 0.006, 14, metal);
    for (let k = 0; k < 6; k += 1) {
      const a = (k / 6) * Math.PI * 2;
      stud(b.brass, [o.cx + Math.cos(a) * 0.052, o.cy + Math.sin(a) * 0.052, z + 0.004], 0.0085, 0.0085, 0.006, 8, metal);
    }
  }
}

/** A brass finger plate behind the lever, bright where fingers have been. */
function fingerPlate(c: Ctx): void {
  const [hx, hy] = handleOf(c);
  const b = nth(c.leaf, 0);
  const metal = { colour: c.tints.metal };
  span(b.brass, [hx - 0.032, hx + 0.032], [hy - 0.13, hy + 0.13], [zFace - 0.0005, zFace + 0.003], bevelOf(c, 0.0015), metal);
  for (const sy of [-0.11, 0.11]) stud(b.brass, [hx, hy + sy, zFace + 0.0035], 0.0036, 0.0036, 0.002, 6, metal);
}

/** Build the signature the door's look names. */
export function buildSignature(c: Ctx): void {
  if (c.lod !== 'near') return;
  switch (c.look.signature) {
    case 'old-plaque-ghost':
      return oldPlaqueGhost(c);
    case 'butterfly-keys':
      return butterflyKeys(c);
    case 'brass-kick-plates':
      return brassKickPlates(c);
    case 'ghost-number':
      return ghostNumber(c);
    case 'cylinder-latch': {
      const [hx, hy] = handleOf(c);
      return cylinderLatch(c, 0, hx, hy + 0.17);
    }
    case 'patch-plate':
      return patchPlate(c);
    case 'filled-outlines':
      return filledOutlines(c);
    case 'stout-pull':
      return strapHingesAndPull(c);
    case 'biscuit-tin':
      return biscuitTin(c);
    case 'fleurons':
      return fleurons(c);
    case 'finger-plate':
      return fingerPlate(c);
    default:
      // The leather grip is part of the handwheel (handles.ts), the fanlight part of the transom.
      return undefined;
  }
}

