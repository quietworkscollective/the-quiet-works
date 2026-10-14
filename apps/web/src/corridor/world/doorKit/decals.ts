import { quad, type Bucket } from '../builder.ts';
import type { Rgb } from '../colour.ts';
import { cellUv, type MarkCell } from '../marksLayout.ts';
import type { UvRect } from '../artLayout.ts';
import type { Vec2, Vec3 } from '../math.ts';

/**
 * A decal is a quad that samples the marks atlas, tinted by vertex colour and laid a hair above
 * the surface it marks. Everything applied to a door (chips, scuffs, stencils, residue, dust)
 * is one of these, so the whole corridor's marks are a single draw call.
 */

/** Corners of a w x h rectangle about (cx, cy), turned by `rotDeg`, listed bottom-left first. */
function corners(cx: number, cy: number, w: number, h: number, rotDeg: number): [Vec2, Vec2, Vec2, Vec2] {
  const a = (rotDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const at = (x: number, y: number): Vec2 => [cx + x * c - y * s, cy + x * s + y * c];
  return [at(-w / 2, -h / 2), at(w / 2, -h / 2), at(w / 2, h / 2), at(-w / 2, h / 2)];
}

export interface DecalOptions {
  /** Mirror the mask left to right: the same chip can be used twice without looking repeated. */
  flip?: boolean;
  rotDeg?: number;
}

/** A decal on a vertical face (door-local: x across, y up) at depth z, facing +z. */
export function decalOnLeaf(b: Bucket, uv: UvRect, centre: readonly [number, number], size: readonly [number, number], z: number, colour: Rgb, options: DecalOptions = {}): void {
  const [p0, p1, p2, p3] = corners(centre[0], centre[1], size[0], size[1], options.rotDeg ?? 0);
  const u0 = options.flip ? uv[2] : uv[0];
  const u1 = options.flip ? uv[0] : uv[2];
  quad(b, [p0[0], p0[1], z], [p1[0], p1[1], z], [p2[0], p2[1], z], [p3[0], p3[1], z], { colour }, [0, 0, 1], [[u0, uv[1]], [u1, uv[1]], [u1, uv[3]], [u0, uv[3]]]);
}

export function cellDecalOnLeaf(b: Bucket, cell: MarkCell, centre: readonly [number, number], size: readonly [number, number], z: number, colour: Rgb, options: DecalOptions = {}): void {
  decalOnLeaf(b, cellUv(cell), centre, size, z, colour, options);
}

/** A decal on a horizontal face (a ledge): x across, z out of the wall, at height y, facing +y. */
export function decalOnLedge(b: Bucket, uv: UvRect, x: readonly [number, number], z: readonly [number, number], y: number, colour: Rgb): void {
  const up: Vec3 = [0, 1, 0];
  quad(b, [x[0], y, z[1]], [x[1], y, z[1]], [x[1], y, z[0]], [x[0], y, z[0]], { colour }, up, [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]]);
}

/** A leaf's face in door-local metres, for keeping decals on it. */
export interface LeafBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Move a decal's centre so the rectangle it covers (turned by `rotDeg`) stays on the leaf. A mark
 * that hung over the edge would float in front of the frame or the wall; one that cannot fit is
 * simply centred.
 */
export function keepOnLeaf(centre: readonly [number, number], size: readonly [number, number], rotDeg: number, box: LeafBox): [number, number] {
  const a = (rotDeg * Math.PI) / 180;
  const hw = (Math.abs(size[0] * Math.cos(a)) + Math.abs(size[1] * Math.sin(a))) / 2;
  const hh = (Math.abs(size[0] * Math.sin(a)) + Math.abs(size[1] * Math.cos(a))) / 2;
  const fit = (c: number, half: number, lo: number, hi: number): number => (hi - lo < 2 * half ? (lo + hi) / 2 : Math.min(hi - half, Math.max(lo + half, c)));
  return [fit(centre[0], hw, box.x0, box.x1), fit(centre[1], hh, box.y0, box.y1)];
}
