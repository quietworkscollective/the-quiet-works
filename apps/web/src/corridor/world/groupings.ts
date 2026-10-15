import { Bucket, quad, type Style } from './builder.ts';
import { ART, ART_ATLAS, quadUvs, uvRect, type PlaqueLayout, type Rect } from './artLayout.ts';
import type { Buckets } from './buckets.ts';
import { sideFrame } from './architecture/corridor.ts';
import { at, wallBox, type WallFrame } from './architecture/wall.ts';
import { linear, mulRgb, type Rgb } from './colour.ts';
import { BRASS_TINT } from './palette.ts';
import { cylinder, sphere, stud } from './shapes.ts';
import type { Vec2, Vec3 } from './math.ts';
import { ANNEX, bayCentreZ, CORRIDOR } from '../layout.ts';
import { END_Z, STAGE } from './stage.ts';
import { placements } from './openings.ts';

/**
 * Institutional accumulation: a composed grouping every two bays, with quiet walls between.
 * A building section in a black frame, a glazed directory, a key cabinet, obsolete conduit with
 * its junction box, a patch where something was removed and plastered over. Decoration here
 * means the things an institution collects, not ornament. Every grouping hangs from the wall at
 * a pier between doors and clear of the sconces.
 */

type Side = 'left' | 'right';

const BLACK = linear('#17191a');
const CREAM: Rgb = linear('#d6cdb4');

/** A rectangle on a wall, centred at (s, y), listed bottom-left, bottom-right, top-right, top-left as the visitor sees it. */
function corners(side: Side, f: WallFrame, depth: number, s: number, y: number, w: number, h: number): [Vec3, Vec3, Vec3, Vec3] {
  const r = side === 'left' ? -1 : 1;
  return [at(f, depth, y - h / 2, s - (r * w) / 2), at(f, depth, y - h / 2, s + (r * w) / 2), at(f, depth, y + h / 2, s + (r * w) / 2), at(f, depth, y + h / 2, s - (r * w) / 2)];
}

/** A flat panel on a wall, with explicit UVs. */
function panel(b: Buckets, key: 'art' | 'pane' | 'plaster' | 'paint' | 'decal' | 'glass' | 'plaque', side: Side, f: WallFrame, depth: number, s: number, y: number, w: number, h: number, uv?: readonly [Vec2, Vec2, Vec2, Vec2], style?: Style): void {
  const [a, c, d, e] = corners(side, f, depth, s, y, w, h);
  quad(b[key], a, c, d, e, style, f.normal, uv);
}

/** Alpha-faded contact shadow cast down the wall from the bottom edge of an object. */
function wallShadow(b: Buckets, side: Side, f: WallFrame, s: number, yBottom: number, w: number, drop: number): void {
  const [a, c] = [at(f, 0.004, yBottom, s - ((side === 'left' ? -1 : 1) * w) / 2), at(f, 0.004, yBottom, s + ((side === 'left' ? -1 : 1) * w) / 2)];
  const d = at(f, 0.004, yBottom - drop, s + ((side === 'left' ? -1 : 1) * w) / 2);
  const e = at(f, 0.004, yBottom - drop, s - ((side === 'left' ? -1 : 1) * w) / 2);
  quad(b.decal, a, c, d, e, undefined, f.normal, [[0, 0], [1, 0], [1, 1], [0, 1]]);
}

const atlasUv = (r: Rect) => quadUvs(uvRect(r, ART_ATLAS.width, ART_ATLAS.height));

/**
 * A framed print: black enamel frame, a cream mount, the drawing, glass with a faint sheen, a
 * brass hook and two wires. `w` x `h` is the drawing's area; the mount and frame add to it.
 */
export function framedPrint(b: Buckets, side: Side, s: number, y: number, w: number, h: number, art: Rect, near = true): void {
  const f = sideFrame(side);
  const mount = 0.055;
  const bar = 0.032;
  const ow = w + 2 * mount;
  const oh = h + 2 * mount;
  const black = { colour: BLACK };
  const d: readonly [number, number] = [0, 0.03];
  const r = side === 'left' ? -1 : 1;
  const s0 = s - ow / 2 - bar;
  const s1 = s + ow / 2 + bar;
  wallBox(b.paint, f, [s0, s1], [y - oh / 2 - bar, y - oh / 2], d, near ? 0.003 : 0, black);
  wallBox(b.paint, f, [s0, s1], [y + oh / 2, y + oh / 2 + bar], d, near ? 0.003 : 0, black);
  wallBox(b.paint, f, [s0, s0 + bar], [y - oh / 2, y + oh / 2], d, near ? 0.003 : 0, black);
  wallBox(b.paint, f, [s1 - bar, s1], [y - oh / 2, y + oh / 2], d, near ? 0.003 : 0, black);
  panel(b, 'paint', side, f, 0.012, s, y, ow, oh, undefined, { colour: CREAM });
  panel(b, 'art', side, f, 0.0125, s, y, w, h, atlasUv(art));
  if (!near) return;
  panel(b, 'pane', side, f, 0.0285, s, y, ow, oh, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  // The hook above and the two wires up to it.
  const hook = at(f, 0.03, y + oh / 2 + bar + 0.32, s);
  sphere(b.brass, { at: [hook[0], hook[1], hook[2]] }, 0.008, 8, 5, { colour: BRASS_TINT });
  for (const sign of [-1, 1]) {
    const a = at(f, 0.02, y + oh / 2 + bar, s + sign * (ow / 2 - 0.05));
    const top = at(f, 0.03, y + oh / 2 + bar + 0.32, s);
    const mid: Vec3 = [(a[0] + top[0]) / 2, (a[1] + top[1]) / 2, (a[2] + top[2]) / 2];
    const len = Math.hypot(top[1] - a[1], top[2] - a[2]);
    const angle = Math.atan2(top[2] - a[2], top[1] - a[1]);
    cylinder(b.brass, { at: mid, rot: [angle, 0, 0] }, 0.0012, 0.0012, len, 4, { colour: mulRgb(BRASS_TINT, 0.7) });
  }
  // A small brass title plate under the frame.
  wallBox(b.brass, f, [s - r * 0.0 - 0.07, s + 0.07], [y - oh / 2 - bar - 0.045, y - oh / 2 - bar - 0.022], [0, 0.012], 0.0015, { colour: BRASS_TINT });
  wallShadow(b, side, f, s, y - oh / 2 - bar - 0.0, ow + 0.1, 0.16);
}

/** The shared enamel wayfinding sign above the Annex door. */
export function buildAnnexSign(b: Buckets, plaques: PlaqueLayout): Bucket {
  const side: Side = 'left';
  const s = bayCentreZ(ANNEX.bay);
  const y = ANNEX.sign.y;
  const f = sideFrame(side);
  const halfW = 0.49;
  const halfH = 0.145;
  wallBox(b.enamel, f, [s - halfW, s + halfW], [y - halfH, y + halfH], [0, 0.045], 0.008, { colour: linear('#743E49') });
  wallBox(b.brass, f, [s - 0.445, s + 0.445], [y - 0.105, y + 0.105], [0.045, 0.049], 0.002, { colour: BRASS_TINT });
  const face = new Bucket();
  const [a, c, d, e] = corners(side, f, 0.055, s, y, 0.86, 0.19);
  quad(face, a, c, d, e, { colour: [1, 1, 1] }, f.normal, quadUvs(plaques.uv('ANNEX')));
  for (const ds of [-0.43, 0.43]) {
    for (const dy of [-0.095, 0.095]) {
      const screw = at(f, 0.054, y + dy, s + ds);
      sphere(b.brass, { at: [screw[0], screw[1], screw[2]] }, 0.009, 10, 5, { colour: BRASS_TINT });
    }
  }
  return face;
}

/** A glazed directory case: black enamel box, the lettered board behind a hinged glass door, a lock. */
export function directoryCase(b: Buckets, side: Side, s: number, y: number, near = true): void {
  const f = sideFrame(side);
  const w = 0.5;
  const h = 0.64;
  const black = { colour: BLACK };
  const bar = 0.03;
  const d: readonly [number, number] = [0, 0.065];
  wallBox(b.paint, f, [s - w / 2 - bar, s + w / 2 + bar], [y - h / 2 - bar, y - h / 2], d, near ? 0.003 : 0, black);
  wallBox(b.paint, f, [s - w / 2 - bar, s + w / 2 + bar], [y + h / 2, y + h / 2 + bar], d, near ? 0.003 : 0, black);
  wallBox(b.paint, f, [s - w / 2 - bar, s - w / 2], [y - h / 2, y + h / 2], d, near ? 0.003 : 0, black);
  wallBox(b.paint, f, [s + w / 2, s + w / 2 + bar], [y - h / 2, y + h / 2], d, near ? 0.003 : 0, black);
  panel(b, 'art', side, f, 0.02, s, y, w, h, atlasUv(ART.directory));
  if (!near) return;
  panel(b, 'pane', side, f, 0.0625, s, y, w, h, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  // The lock on the right edge, two hinges on the left.
  const metal = { colour: BRASS_TINT };
  const r = side === 'left' ? -1 : 1;
  const lock = at(f, 0.066, y, s + r * (w / 2 + bar / 2));
  sphere(b.brass, { at: [lock[0], lock[1], lock[2]], rot: [0, 0, side === 'left' ? -Math.PI / 2 : Math.PI / 2], scale: [1, 1, 1] }, 0.011, 10, 5, metal, Math.PI * 2, Math.PI / 2);
  for (const dy of [-0.2, 0.2]) {
    const hinge = at(f, 0.063, y + dy, s - r * (w / 2 + bar / 2));
    cylinder(b.brass, { at: [hinge[0], hinge[1], hinge[2]] }, 0.0065, 0.0065, 0.07, 8, metal);
  }
  wallShadow(b, side, f, s, y - h / 2 - bar, w + 0.12, 0.18);
}

/** A small key cabinet: oak, a glazed door and two rows of brass hooks, a few with keys on them. */
export function keyCabinet(b: Buckets, side: Side, s: number, y: number): void {
  const f = sideFrame(side);
  const w = 0.36;
  const h = 0.46;
  const oak = { colour: [1.3, 1.15, 1] as const };
  const bar = 0.025;
  const d: readonly [number, number] = [0, 0.085];
  wallBox(b.oak, f, [s - w / 2 - bar, s + w / 2 + bar], [y - h / 2 - bar, y - h / 2], d, 0.003, oak);
  wallBox(b.oak, f, [s - w / 2 - bar, s + w / 2 + bar], [y + h / 2, y + h / 2 + bar], d, 0.003, oak);
  wallBox(b.oak, f, [s - w / 2 - bar, s - w / 2], [y - h / 2, y + h / 2], d, 0.003, oak);
  wallBox(b.oak, f, [s + w / 2, s + w / 2 + bar], [y - h / 2, y + h / 2], d, 0.003, oak);
  // The back board and the hooks.
  panel(b, 'paint', side, f, 0.012, s, y, w, h, undefined, { colour: mulRgb(linear('#2a2f2c'), 1.4) });
  const r = side === 'left' ? -1 : 1;
  const metal = { colour: BRASS_TINT };
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      const p = at(f, 0.026, y + 0.14 - row * 0.1, s + r * (-0.135 + col * 0.0675));
      cylinder(b.brass, { at: [p[0], p[1], p[2]], rot: [0, 0, Math.PI / 2] }, 0.0028, 0.0028, 0.03, 6, metal);
      if ((row * 5 + col) % 3 !== 1) {
        // A key on a card tag: a dark bow and a bar, hanging.
        const k = at(f, 0.034, y + 0.14 - row * 0.1 - 0.03, s + r * (-0.135 + col * 0.0675));
        stud(b.iron, [k[0], k[1], k[2]], 0.0095, 0.0095, 0.004, 8, { colour: [1, 1, 1] });
      }
    }
  }
  panel(b, 'pane', side, f, 0.0855, s, y, w, h, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  wallShadow(b, side, f, s, y - h / 2 - bar, w + 0.1, 0.14);
}

/** Obsolete conduit: a vertical run from the cornice down to a capped box, held by saddle clips. */
export function conduitRun(b: Buckets, side: Side, s: number, yTop: number, yBottom: number): void {
  const f = sideFrame(side);
  const tint = { colour: mulRgb(linear('#77776B'), 1.2) };
  const p = at(f, 0.014, (yTop + yBottom) / 2, s);
  cylinder(b.paint, { at: [p[0], p[1], p[2]] }, 0.0115, 0.0115, yTop - yBottom, 10, tint);
  // Saddle clips every 0.45 m.
  for (let y = yBottom + 0.2; y < yTop; y += 0.45) {
    const c = at(f, 0.0105, y, s);
    cylinder(b.brass, { at: [c[0], c[1], c[2]], rot: [0, 0, 0] }, 0.0155, 0.0155, 0.022, 10, { colour: mulRgb(BRASS_TINT, 0.8) });
  }
  // A junction box part-way down and a capped stub below it, where it once fed something.
  wallBox(b.iron, f, [s - 0.05, s + 0.05], [yBottom + 0.5, yBottom + 0.6], [0, 0.05], 0.003, { colour: [1, 1, 1] });
  for (const sx of [-0.036, 0.036]) {
    const screw = at(f, 0.0515, yBottom + 0.55, s + sx);
    stud(b.brass, [screw[0], screw[1], screw[2]], 0.0042, 0.0042, 0.003, 6, { colour: BRASS_TINT });
  }
  const cap = at(f, 0.026, yBottom + 0.02, s);
  cylinder(b.brass, { at: [cap[0], cap[1], cap[2]] }, 0.014, 0.014, 0.034, 10, { colour: mulRgb(BRASS_TINT, 0.7) });
}

/**
 * A repair: new plaster over a chase or a removed fitting, a little paler and warmer than the
 * old, its edge a thin ridge of filler. Slightly proud of the wall.
 */
export function plasterPatch(b: Buckets, side: Side, s: number, y: number, w: number, h: number): void {
  const f = sideFrame(side);
  const tone = { colour: [1.1, 1.05, 0.95] as const, uv: { du: 0.6, dv: 0.2 } };
  panel(b, 'plaster', side, f, 0.0035, s, y, w, h, undefined, tone);
  const ridge = 0.004;
  const edge = { colour: [0.86, 0.84, 0.78] as const };
  wallBox(b.plaster, f, [s - w / 2, s + w / 2], [y + h / 2 - ridge, y + h / 2], [0.0035, 0.0065], 0, edge);
  wallBox(b.plaster, f, [s - w / 2, s + w / 2], [y - h / 2, y - h / 2 + ridge], [0.0035, 0.0065], 0, edge);
  wallBox(b.plaster, f, [s - w / 2, s - w / 2 + ridge], [y - h / 2 + ridge, y + h / 2 - ridge], [0.0035, 0.0065], 0, edge);
  wallBox(b.plaster, f, [s + w / 2 - ridge, s + w / 2], [y - h / 2 + ridge, y + h / 2 - ridge], [0.0035, 0.0065], 0, edge);
}

/**
 * Prints added for the walkable corridor's long piers: where each hangs (world z), its drawing's size,
 * and which drawing. Listed so a test can keep them clear of the props lane's anchors.
 */
export const PIER_PRINTS = [
  { side: 'right', s: -5.7, y: 1.7, w: 0.3, h: 0.38, art: 'plan' },
  { side: 'left', s: -16.85, y: 1.72, w: 0.42, h: 0.3, art: 'plan' },
  { side: 'right', s: -16.7, y: 1.74, w: 0.56, h: 0.36, art: 'section' },
] as const;

/** The authored groupings, by pier. The far corridor repeats framed prints at a coarser detail. */
export function buildGroupings(b: Buckets): void {
  // Bays 0-1, left: a building section over a radiator, between the second door and the Apartment.
  framedPrint(b, 'left', -6.25, 1.78, 0.78, 0.49, ART.section);
  // Bays 2-3, right: the directory and the key cabinet, on the pier between two blank doors.
  directoryCase(b, 'right', -10.0, 1.62);
  keyCabinet(b, 'right', -9.05, 1.52);
  // Bays 3-4, left: a pair of smaller prints between the Apartment and the Tomorrow Engine.
  framedPrint(b, 'left', -11.35, 1.72, 0.3, 0.4, ART.plan);
  framedPrint(b, 'left', -12.0 + 0.1, 1.72, 0.42, 0.26, ART.section);
  // Bays 4-5, left: obsolete conduit and the patch beside it, past the Tomorrow Engine.
  conduitRun(b, 'left', -15.35, CORRIDOR_TOP, 1.15);
  plasterPatch(b, 'left', -16.05, 1.7, 0.5, 0.8);
  // Piers that would otherwise run bare (founder feedback: no long bare walls): a small plan beside
  // the Office, a print beside the patch, a section over the right-hand radiator.
  for (const p of PIER_PRINTS) framedPrint(b, p.side, p.s, p.y, p.w, p.h, p.art === 'plan' ? ART.plan : ART.section);
  // The far corridor: a framed print on the pier at every other bay boundary, alternating sides,
  // on the wall that has no sconce there (sconces sit on the opposite wall, 3.6 m apart).
  for (let k = 0; -24.2 - 14.4 * k > END_Z + 1; k += 1) {
    framedPrint(b, 'right', -24.2 - 14.4 * k, 1.74, 0.62, 0.4, ART.section, false);
    framedPrint(b, 'left', -27.8 - 14.4 * k, 1.74, 0.5, 0.4, ART.plan, false);
  }
  // And wherever a far bay has no door on a side, a print at the bay's centre, so no stretch of the
  // receding wall is left long and bare (founder feedback: no long bare walls).
  for (const slot of farPrintSlots()) {
    const art = (slot.bay + (slot.side === 'left' ? 0 : 1)) % 2 === 0 ? ART.section : ART.plan;
    framedPrint(b, slot.side, slot.z, 1.74, art === ART.section ? 0.56 : 0.44, 0.4, art, false);
  }
}

/**
 * The far bays beyond the walkable Annex with no door on a side each get a print at their centre.
 * "No door" means no placement at all, authored or repeated: `blankDoorAt` alone says "no repeated
 * door" even for a bay that has an authored one, which hung a print over the double doors at bay 7.
 */
export function farPrintSlots(): { bay: number; side: Side; z: number }[] {
  const lastBay = STAGE.bays - 1;
  const doors = placements();
  const out: { bay: number; side: Side; z: number }[] = [];
  for (let bay = CORRIDOR.walkableBays; bay <= lastBay; bay += 1) {
    for (const side of ['left', 'right'] as const) {
      const z = bayCentreZ(bay);
      if (!doors.some((d) => d.side === side && Math.abs(d.z - z) < CORRIDOR.bay / 2)) out.push({ bay, side, z });
    }
  }
  return out;
}

const CORRIDOR_TOP = 3.45;
