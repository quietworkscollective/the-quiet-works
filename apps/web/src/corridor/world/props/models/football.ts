import { atlasUvRect } from '../atlasLayout.ts';
import { BALL_MAP, PATCH_DIRECTION, STITCHED_EDGE } from '../ballPattern.ts';
import { IVORY, linear, METAL, wood } from '../colours.ts';
import { add, cross, dot, normalize, scale, type Vec3 } from '../../math.ts';
import type { PropModel } from '../model.ts';
import { both, plateau, ramp, turned, Y, type PoseSet } from '../motion.ts';
import type { Assembly } from '../parts.ts';

/**
 * The football (play, sustained by repair): a leather ball in an iron cradle on the plaster, with
 * a bicycle puncture patch on one panel and a seam stitched by hand on another. Turning it takes
 * it once round, slowly, so the stitching comes into view; it ends where it began. The ball's skin
 * is a texel-exact map in the props' atlas (see ballPattern.ts); its mesh is a plain UV sphere.
 */

const RADIUS = 0.11;
const RING = { r: 0.088, tube: 0.0065, z: 0.07 };
const BALL_Z = RING.z + Math.sqrt(RADIUS * RADIUS - RING.r * RING.r);
const SEGMENTS = { around: 24, down: 14 };

const RUBBER = linear('#171718');
const CREAM = linear('#E8E0C6');

/** A sphere of the ball's skin: UVs into the atlas' equirectangular map, normals outward. */
function skin(a: Assembly, centre: Vec3): void {
  const [u0, v0, u1, v1] = atlasUvRect('ball');
  const pad = (BALL_MAP.margin / (BALL_MAP.width + 2 * BALL_MAP.margin)) * (u1 - u0);
  const uLeft = u0 + pad;
  const uRight = u1 - pad;
  a.raw('print', undefined, (b) => {
    const grid: number[][] = [];
    for (let i = 0; i <= SEGMENTS.down; i += 1) {
      const row: number[] = [];
      const theta = (i / SEGMENTS.down) * Math.PI;
      for (let j = 0; j <= SEGMENTS.around; j += 1) {
        const phi = (j / SEGMENTS.around) * Math.PI * 2;
        const n: Vec3 = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
        row.push(b.vertex([centre[0] + n[0] * RADIUS, centre[1] + n[1] * RADIUS, centre[2] + n[2] * RADIUS], n, [uLeft + (j / SEGMENTS.around) * (uRight - uLeft), v1 - (i / SEGMENTS.down) * (v1 - v0)], [1, 1, 1]));
      }
      grid.push(row);
    }
    for (let i = 0; i < SEGMENTS.down; i += 1) {
      for (let j = 0; j < SEGMENTS.around; j += 1) {
        const p = grid[i];
        const q = grid[i + 1];
        const aa = p?.[j];
        const bb = p?.[j + 1];
        const cc = q?.[j];
        const dd = q?.[j + 1];
        if (aa === undefined || bb === undefined || cc === undefined || dd === undefined) continue;
        b.idx.push(aa, bb, cc, cc, bb, dd);
      }
    }
  });
}

/** An Euler rotation that turns a cylinder's y axis onto `dir`. */
function aim(dir: Vec3): Vec3 {
  // Three's XYZ order applies z first: a turn about z tips the axis in the xy plane, then x swings it to `dir`.
  return [Math.atan2(dir[2], dir[1]), 0, -Math.asin(dir[0])];
}

function ball(a: Assembly, centre: Vec3): void {
  skin(a, centre);
  const at = (dir: Vec3, k: number): Vec3 => [centre[0] + dir[0] * RADIUS * k, centre[1] + dir[1] * RADIUS * k, centre[2] + dir[2] * RADIUS * k];

  // The patch itself, a thin disc proud of the leather.
  a.cyl('matte', { at: at(PATCH_DIRECTION, 1.0), rot: aim(PATCH_DIRECTION) }, 0.0163, 0.0168, 0.0016, 18, RUBBER);

  // Stitches across a pentagon's edge: cross-stitches in cream thread, evenly spaced along the seam.
  const { from, to } = STITCHED_EDGE;
  const total = Math.acos(Math.max(-1, Math.min(1, dot(from, to))));
  const axis = normalize(cross(from, to));
  const stitches = 11;
  for (let i = 0; i < stitches; i += 1) {
    const angle = total * ((i + 0.5) / stitches);
    // Rodrigues: `from` turned by `angle` about `axis`, which is perpendicular to it.
    const p = add(scale(from, Math.cos(angle)), scale(cross(axis, from), Math.sin(angle)));
    const tangent = normalize(cross(axis, p));
    const across = normalize(cross(p, tangent));
    const half = 0.0078 / RADIUS;
    const along = 0.007 / RADIUS;
    const corner = (s: number, t: number): Vec3 => normalize(add(add(p, scale(across, s * half)), scale(tangent, t * along)));
    a.rod('matte', at(corner(1, 1), 1.004), at(corner(-1, -1), 1.004), 0.0006, 3, CREAM);
    a.rod('matte', at(corner(1, -1), 1.004), at(corner(-1, 1), 1.004), 0.0006, 3, CREAM);
  }
  // The valve: a rubber nipple low on the ball.
  const valve = normalize([0.1, -0.7, 0.7]);
  a.cyl('matte', { at: at(valve, 1.002), rot: aim(valve) }, 0.0036, 0.0045, 0.005, 8, RUBBER);
}

export const football: PropModel = {
  id: 'football',

  parts: (placement) => [{ name: 'ball', pivot: [0, placement.height, BALL_Z] }],

  build(a, placement) {
    const H = placement.height;
    const spin = a.part('ball');
    // The cradle: an oak boss on the plaster, three iron stays out to a ring.
    a.cyl('wood', { at: [0, H, 0.008], rot: [Math.PI / 2, 0, 0] }, 0.118, 0.118, 0.016, 24, wood('#4F3624'));
    a.cyl('wood', { at: [0, H, 0.0185], rot: [Math.PI / 2, 0, 0] }, 0.1, 0.1, 0.006, 24, wood('#5F432E'));
    for (let k = 0; k < 3; k += 1) {
      const ang = Math.PI / 2 + (k * Math.PI * 2) / 3;
      const x = Math.cos(ang) * (RING.r - 0.002);
      const y = Math.sin(ang) * (RING.r - 0.002);
      a.rod('steel', [Math.cos(ang) * 0.07, H + Math.sin(ang) * 0.07, 0.02], [x, H + y, RING.z], 0.0055, 6, METAL.iron);
      a.cyl('brass', { at: [Math.cos(ang) * 0.07, H + Math.sin(ang) * 0.07, 0.0225], rot: [Math.PI / 2, 0, 0] }, 0.0065, 0.0065, 0.004, 8, METAL.brass);
    }
    a.torus('steel', { at: [0, H, RING.z] }, RING.r, RING.tube, 6, 28, METAL.iron);
    // An ivory tab on a leather thong from the foot of the ring: what a hand takes hold of.
    a.rod('matte', [0, H - RING.r - 0.004, RING.z + 0.002], [0, H - RING.r - 0.03, RING.z + 0.004], 0.0016, 5, linear('#5A3E26'));
    a.ivory(() => {
      a.box('enamel', [0, H - RING.r - 0.046, RING.z + 0.005], [0.017, 0.032, 0.005], 0.0016, IVORY);
    });
    a.on(spin, () => ball(a, [0, H, BALL_Z]));
  },

  pose(motion, _ambient, reduced, phase) {
    const set: PoseSet = {};
    const t = motion.action;
    // Reduced motion: the ball is turned an eighth and left there until the action ends.
    if (reduced) {
      if (t !== 0) set['ball'] = turned(Y, (Math.PI / 4) * t);
      return set;
    }
    // Once round on the way up, ending where it began; on the way down it is simply at rest.
    if (phase === 'falling') return set;
    const turn = ramp(t, 0.04, 0.96) * Math.PI * 2;
    const ease = plateau(t, 0.0, 0.14, 0.86, 1.0);
    if (turn !== 0 || ease !== 0) set['ball'] = both([0, 0, 0.012 * ease], Y, turn);
    return set;
  },
};
