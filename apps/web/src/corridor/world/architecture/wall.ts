import { box, Bucket, quad, strip, type FaceName, type Style } from '../builder.ts';
import { nth, add, scale, type Vec3 } from '../math.ts';

/**
 * A wall as a coordinate frame: `s` runs along the wall, `y` is height and `depth` is how far
 * out of the plane into the room. Everything on a wall (plaster, panelling, skirting, cornice) is
 * written in these terms, so one set of builders serves both corridor sides, the lobby sides,
 * the lobby's end wall and its back wall.
 */
export interface WallFrame {
  /** Unit axis pointing into the room. */
  normal: Vec3;
  /** Unit axis along the wall, the direction of increasing `s`. */
  along: Vec3;
  /** The point on the wall plane at s = 0, y = 0. */
  origin: Vec3;
}

export function at(f: WallFrame, depth: number, y: number, s: number): Vec3 {
  return add(add(f.origin, scale(f.normal, depth)), add(scale(f.along, s), [0, y, 0]));
}

const axisOf = (v: Vec3): 0 | 1 | 2 => (v[0] !== 0 ? 0 : v[1] !== 0 ? 1 : 2);

/** A box in wall terms: s0..s1 along, y0..y1 up, d0..d1 out of the wall. */
export function wallBox(
  b: Bucket,
  f: WallFrame,
  s: readonly [number, number],
  y: readonly [number, number],
  d: readonly [number, number],
  bevel: number,
  style?: Style,
): void {
  const a = at(f, d[0], y[0], s[0]);
  const c = at(f, d[1], y[1], s[1]);
  const centre: Vec3 = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
  const size: Vec3 = [Math.abs(c[0] - a[0]), Math.abs(c[1] - a[1]), Math.abs(c[2] - a[2])];
  const skip: FaceName[] = [];
  if (d[0] === 0) {
    const n = axisOf(f.normal);
    skip.push(`${f.normal[n] > 0 ? '-' : '+'}${'xyz'[n]}` as FaceName);
  }
  if (y[0] === 0) skip.push('-y');
  box(b, centre, size, bevel, style, skip);
}

/** A flat rectangle on the wall plane (or `depth` out of it) facing into the room. */
export function wallQuad(
  b: Bucket,
  f: WallFrame,
  depth: number,
  s: readonly [number, number],
  y: readonly [number, number],
  style?: Style,
): void {
  quad(b, at(f, depth, y[0], s[0]), at(f, depth, y[0], s[1]), at(f, depth, y[1], s[1]), at(f, depth, y[1], s[0]), style, f.normal);
}

/** A grid on the wall plane with the given breakpoints, so baked shading has vertices to vary on. */
export function wallGrid(
  b: Bucket,
  f: WallFrame,
  depth: number,
  ss: readonly number[],
  ys: readonly number[],
  style?: Style,
  /** Cells whose centre falls inside any of these rectangles are left open (a window through the wall). */
  holes: readonly WallHole[] = [],
): void {
  for (let i = 0; i + 1 < ss.length; i += 1) {
    for (let j = 0; j + 1 < ys.length; j += 1) {
      const cs = (nth(ss, i) + nth(ss, i + 1)) / 2;
      const cy = (nth(ys, j) + nth(ys, j + 1)) / 2;
      if (holes.some((h) => cs > h.s[0] && cs < h.s[1] && cy > h.y[0] && cy < h.y[1])) continue;
      wallQuad(b, f, depth, [nth(ss, i), nth(ss, i + 1)], [nth(ys, j), nth(ys, j + 1)], style);
    }
  }
}

/** A rectangular opening through a wall, in wall terms: s along it, y up. */
export interface WallHole {
  s: readonly [number, number];
  y: readonly [number, number];
}

export interface CorniceProfile {
  /** How far the cornice projects from the wall at the ceiling. */
  projection: number;
  /** Height of the cove, from where it leaves the wall to the ceiling. */
  height: number;
}

/**
 * A plaster cove cornice along a wall run: a concave quarter-ellipse tangent to the wall at the
 * bottom and to the ceiling at the top, with a small bead where it leaves the wall. This is the
 * "deep cornice" of the brief; the projection is the contract's 0.16 m in the corridor.
 */
export function cornice(
  b: Bucket,
  f: WallFrame,
  s: readonly [number, number],
  ceiling: number,
  profile: CorniceProfile,
  style?: Style,
  segments = 12,
): void {
  const y0 = ceiling - profile.height;
  const polyline: Vec3[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = (i / segments) * (Math.PI / 2);
    polyline.push(at(f, profile.projection * (1 - Math.cos(t)), y0 + profile.height * Math.sin(t), s[0]));
  }
  const sweep = scale(f.along, s[1] - s[0]);
  const mid = (s[0] + s[1]) / 2;
  strip(b, polyline, sweep, style, at(f, 1.2, y0 - 0.5, mid));
  // The bead that finishes the cove's lower edge.
  wallBox(b, f, s, [y0 - 0.026, y0 + 0.012], [0, 0.026], 0.004, style);
}
