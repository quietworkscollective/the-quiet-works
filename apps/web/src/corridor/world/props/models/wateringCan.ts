import { quad } from '../../builder.ts';
import { IVORY, linear, METAL, mulRgb } from '../colours.ts';
import { hash2, add, cross, normalize, scale, type Vec3 } from '../../math.ts';
import { placeModel } from '../modelKit.ts';
import type { PropModel } from '../model.ts';
import { both, ramp, rad, Z, type PoseSet } from '../motion.ts';
import type { Assembly } from '../parts.ts';

/**
 * The watering can (care): a galvanised can beside a small pot of snake plant on its saucer, at the
 * foot of the lobby's left wall. Choosing it tips the can toward the pot, a drop swells at the rose,
 * falls into the saucer, and the can is set upright again. One drop, once: a small consequence of
 * care, not a chore. The drop is hidden in the pot at rest.
 *
 * The can is the asset library's scanned `watering-can` (its spout points along the model's +z, so
 * it is turned a quarter to point at the pot), with its ivory grip a sleeve on the strap handle.
 * Where that model did not load, the can is built procedurally with its rose at the same place, so
 * the drop falls from the same point either way.
 */

const Z0 = 0.15;
const POT_X = 0.335;
/** The scanned can: its origin, and the quarter turn that points its spout (+z) along the wall to the pot (+x). */
const CAN_AT: Vec3 = [-0.03, 0, Z0];
/** The can tips about its front bottom edge, where the spout leaves the body. */
const PIVOT: Vec3 = [0.01, 0, Z0];
/** The procedural can's spout: it ends where the scanned can's rose is (about 0.19 m out, 0.17 m up). */
const SPOUT = { from: [-0.08, 0.05, Z0] as Vec3, to: [0.157, 0.152, Z0] as Vec3 };
const SPOUT_DIR = normalize([SPOUT.to[0] - SPOUT.from[0], SPOUT.to[1] - SPOUT.from[1], 0]);
/** The centre of the rose's face, where the water leaves. */
const ROSE_FACE = add(SPOUT.to, scale(SPOUT_DIR, 0.032));
export const CAN_TILT = rad(-24);
/** The can is lifted this far as it tips, so the rose is clear of the saucer and the drop has a fall to show. */
export const CAN_LIFT = 0.07;
const SAUCER_TOP = 0.0175;
/** Where the drop waits, buried in the pot, until it is called for. */
const DROP_REST: Vec3 = [POT_X, 0.09, Z0];
const DROP_RADIUS = 0.0052;
/** The pot and its saucer, for the drop to fall between: clear of the pot's wall, onto the saucer. */
export const POT = { x: POT_X, rim: 0.0735, saucer: 0.11 } as const;

const GALVANISED = linear('#C4CACB');
const CLAY = linear('#8B6048');
const SOIL = linear('#2C2018');

/** The rose's face after the can has tipped by `angle` and been lifted by `lift`. */
export function roseFace(angle: number, lift = 0): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = ROSE_FACE[0] - PIVOT[0];
  const dy = ROSE_FACE[1] - PIVOT[1];
  return [PIVOT[0] + dx * c - dy * s, PIVOT[1] + dx * s + dy * c + lift, ROSE_FACE[2]];
}

/** Where the drop is, and how big, for an action. Hidden (scale 0) outside its short life. */
export function dropAt(t: number): { position: Vec3; scale: number } {
  const tip = roseFace(CAN_TILT, CAN_LIFT);
  // It swells at the rose once the can is tipped, falls like a drop (distance as the square of
  // time), lands, and is gone in a breath: all on the way up, before the action holds.
  const swell = ramp(t, 0.5, 0.6);
  const fall = Math.min(1, Math.max(0, (t - 0.6) / 0.22));
  const y = tip[1] - 0.012 - (tip[1] - 0.012 - (SAUCER_TOP + DROP_RADIUS)) * fall * fall;
  const gone = 1 - ramp(t, 0.82, 0.9);
  const scaleNow = swell * gone;
  return { position: [tip[0], y, tip[2]], scale: scaleNow };
}

function blade(a: Assembly, base: Vec3, azimuth: number, tilt: number, length: number, width: number, bend: number): void {
  const stations = 4;
  const side: Vec3 = [-Math.sin(azimuth), 0, Math.cos(azimuth)];
  const centres: Vec3[] = [];
  const halfWidths: number[] = [];
  let p = base;
  for (let i = 0; i <= stations; i += 1) {
    const s = i / stations;
    const th = tilt + bend * s;
    centres.push(p);
    halfWidths.push((width / 2) * (1 - s ** 2.2) * (0.6 + 0.4 * Math.sin(Math.min(1, s * 3) * (Math.PI / 2))));
    const d: Vec3 = [Math.sin(th) * Math.cos(azimuth), Math.cos(th), Math.sin(th) * Math.sin(azimuth)];
    p = add(p, scale(d, length / stations));
  }
  const margin = linear('#8FA146');
  const core = linear('#2D4A2E');
  a.raw('matte', undefined, (b) => {
    for (let i = 0; i < stations; i += 1) {
      const c0 = centres[i] as Vec3;
      const c1 = centres[i + 1] as Vec3;
      const w0 = halfWidths[i] as number;
      const w1 = halfWidths[i + 1] as number;
      const lateral = (c: Vec3, w: number, f: number): Vec3 => add(c, scale(side, w * f));
      const fronts = normalize(cross(side, [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]]));
      const columns: [number, number, ReturnType<typeof mulRgb>][] = [
        [-1, -0.45, margin],
        [-0.45, 0.45, mulRgb(core, 0.9 + 0.2 * hash2(i, 7))],
        [0.45, 1, margin],
      ];
      for (const [f0, f1, colour] of columns) {
        const style = { colour };
        quad(b, lateral(c0, w0, f0), lateral(c0, w0, f1), lateral(c1, w1, f1), lateral(c1, w1, f0), style, fronts);
        quad(b, lateral(c0, w0, f1), lateral(c0, w0, f0), lateral(c1, w1, f0), lateral(c1, w1, f1), style, scale(fronts, -1));
      }
    }
  });
}

export const wateringCan: PropModel = {
  id: 'watering-can',

  parts: () => [
    { name: 'can', pivot: PIVOT },
    { name: 'drop', pivot: DROP_REST },
  ],

  build(a, _placement, kit) {
    const can = a.part('can');
    const drop = a.part('drop');
    const scanned = kit?.get('watering-can');

    a.on(can, () => {
      if (scanned) {
        placeModel(a, scanned, { at: CAN_AT, yaw: Math.PI / 2 });
        // The grip: an ivory sleeve round the strap handle at the far end of its ring (model z = -0.226,
        // height 0.08), where the hand closes.
        a.ivory(() => {
          a.cyl('enamel', { at: [CAN_AT[0] - 0.226, 0.08, Z0] }, 0.0125, 0.0125, 0.05, 12, IVORY);
        });
        return;
      }
      proceduralCan(a);
    });

    // The pot: terracotta with a heavy rim, soil in it, a saucer under it.
    pot(a);

    // The drop: water-bright, hidden in the pot until it is called for.
    a.on(drop, () => {
      a.sphere('enamel', { at: DROP_REST, scale: [0.8, 1.3, 0.8] }, DROP_RADIUS, 8, 6, linear('#C6E4EA'));
    });
  },

  pose(motion, _ambient, _reduced, phase) {
    const set: PoseSet = {};
    const t = motion.action;
    // The can is lifted a little and tips, and stays tipped until the action is released.
    const tilt = ramp(t, 0.0, 0.5);
    if (tilt !== 0) set['can'] = both([0, CAN_LIFT * tilt, 0], Z, CAN_TILT * tilt);
    // The drop falls on the way up only: it never climbs back to the rose.
    const d = dropAt(t);
    // Before and after its short life the drop is at rest, buried in the pot.
    if (d.scale > 0 && phase === 'rising') set['drop'] = { move: [d.position[0] - DROP_REST[0], d.position[1] - DROP_REST[1], d.position[2] - DROP_REST[2]], scale: d.scale };
    return set;
  },
};

/** The galvanised can, built from primitives: the version used where the scanned model is not there. */
function proceduralCan(a: Assembly): void {
  const cx = -0.165;
  // Body: a slightly tapered drum with a rolled rim and a seam of darker zinc.
  a.cyl('steel', { at: [cx, 0.095, Z0] }, 0.066, 0.075, 0.19, 18, GALVANISED);
  a.torus('steel', { at: [cx, 0.19, Z0], rot: [Math.PI / 2, 0, 0] }, 0.066, 0.0042, 5, 18, mulRgb(GALVANISED, 1.1));
  a.torus('steel', { at: [cx, 0.003, Z0], rot: [Math.PI / 2, 0, 0] }, 0.0752, 0.0032, 4, 18, mulRgb(GALVANISED, 0.85));
  a.cyl('matte', { at: [cx, 0.1895, Z0] }, 0.0585, 0.0585, 0.0008, 16, linear('#101113'));
  a.cyl('steel', { at: [cx, 0.095, Z0] }, 0.0662, 0.0752, 0.012, 18, mulRgb(GALVANISED, 0.7));
  // The spout: a long tapering tube from low on the body up to the rose.
  a.rod('steel', SPOUT.from, SPOUT.to, 0.0125, 10, GALVANISED, undefined, 0.0078);
  // The rose: a brass dome on the spout's end, pierced with small dark holes.
  const rz = -Math.asin(SPOUT_DIR[0]);
  a.sphere('brass', { at: add(SPOUT.to, scale(SPOUT_DIR, 0.006)), rot: [0, 0, rz], scale: [1.15, 0.6, 1.15] }, 0.026, 12, 5, METAL.polished, undefined, Math.PI * 2, Math.PI / 2);
  for (let k = 0; k < 6; k += 1) {
    const ang = k === 0 ? 0 : ((k - 1) / 5) * Math.PI * 2;
    const rr = k === 0 ? 0 : 0.016;
    const local: Vec3 = [Math.cos(ang) * rr, 0, Math.sin(ang) * rr];
    // Rotate the face's local (x, z) into the spout's frame: x' along the perpendicular in the xy plane.
    const perp: Vec3 = [SPOUT_DIR[1], -SPOUT_DIR[0], 0];
    const p = add(add(ROSE_FACE, scale(perp, local[0])), [0, 0, local[2]]);
    a.cyl('matte', { at: add(p, scale(SPOUT_DIR, -0.002)), rot: [0, 0, rz] }, 0.0023, 0.0023, 0.004, 5, linear('#0E0F10'));
  }
  // The top handle: an arched strap of steel over the opening, front to back.
  a.torus('steel', { at: [cx, 0.19, Z0], rot: [0, 0, 0] }, 0.071, 0.0052, 4, 14, GALVANISED, Math.PI);
  // The rear handle: a loop down the back of the body.
  a.torus('steel', { at: [cx - 0.083, 0.115, Z0], rot: [0, 0, Math.PI / 2] }, 0.049, 0.0052, 4, 12, GALVANISED, Math.PI);
  // The ivory grip on the top handle: where the hand closes.
  a.ivory(() => {
    a.cyl('enamel', { at: [cx, 0.261, Z0], rot: [0, 0, Math.PI / 2] }, 0.0085, 0.0085, 0.056, 10, IVORY);
  });
}

/** The pot of snake plant on its saucer: terracotta with a heavy rim, soil in it, seven spears. */
function pot(a: Assembly): void {
  a.lathe(
    'matte',
    { at: [POT_X, 0.0175, Z0] },
    [[0, 0], [0.047, 0], [0.05, 0.004], [0.058, 0.09], [0.062, 0.118], [0.0725, 0.121], [0.0735, 0.136], [0.0705, 0.139], [0.0595, 0.129], [0.0, 0.129]],
    16,
    (p) => mulRgb(CLAY, 0.88 + 0.22 * hash2(Math.floor(p[0] * 120), Math.floor(p[1] * 120))),
  );
  a.cyl('matte', { at: [POT_X, 0.1565 + 0.0175 - 0.0035, Z0] }, 0.0595, 0.0595, 0.002, 14, SOIL);
  a.lathe('matte', { at: [POT_X, 0, Z0] }, [[0, 0], [0.078, 0], [0.104, 0.011], [0.11, 0.0175], [0.107, 0.018], [0.08, 0.0075], [0, 0.0065]], 18, mulRgb(CLAY, 0.95));

  const baseY = 0.1565 + 0.0175 - 0.0015;
  for (let k = 0; k < 7; k += 1) {
    const az = (k / 7) * Math.PI * 2 + 0.5;
    const offs = 0.016 + 0.01 * hash2(k, 3);
    const base: Vec3 = [POT_X + Math.cos(az) * offs, baseY, Z0 + Math.sin(az) * offs];
    blade(a, base, az, 0.07 + 0.2 * hash2(k, 5), 0.2 + 0.2 * hash2(k, 9), 0.034, 0.12 + 0.1 * hash2(k, 11));
  }
}
