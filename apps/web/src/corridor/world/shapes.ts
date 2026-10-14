import { BoxGeometry, CylinderGeometry, Euler, type EulerOrder, LatheGeometry, Matrix4, Quaternion, SphereGeometry, TorusGeometry, Vector2, Vector3 } from 'three';
import { addGeometry, type Bucket, type Style } from './builder.ts';
import type { Vec3 } from './math.ts';

/**
 * Round things (cylinders, tori, lathed knobs) from three.js primitives, transformed and appended
 * to a bucket. The temporary geometry is disposed straight away. All take a position and an
 * Euler rotation; the primitives' own axes are y for cylinders and lathes, z for tori.
 */

export interface Placement {
  at: Vec3;
  /** Euler XYZ rotation, radians. */
  rot?: Vec3;
  /** Euler order for `rot` (three's default, XYZ, when omitted). */
  order?: EulerOrder;
  scale?: Vec3;
}

export function matrixOf(p: Placement): Matrix4 {
  const q = new Quaternion().setFromEuler(new Euler(p.rot?.[0] ?? 0, p.rot?.[1] ?? 0, p.rot?.[2] ?? 0, p.order ?? 'XYZ'));
  return new Matrix4().compose(new Vector3(...p.at), q, new Vector3(...(p.scale ?? [1, 1, 1])));
}

/** A cylinder with its axis along y (rotate to taste). */
export function cylinder(b: Bucket, p: Placement, rTop: number, rBottom: number, height: number, segments: number, style?: Style): void {
  const g = new CylinderGeometry(rTop, rBottom, height, segments, 1, false);
  addGeometry(b, g, matrixOf(p), style, true);
  g.dispose();
}

/** A cylinder with its axis along z (a stud or a boss standing out of a flat face). */
export function stud(b: Bucket, at: Vec3, rTop: number, rBottom: number, length: number, segments: number, style?: Style): void {
  cylinder(b, { at, rot: [Math.PI / 2, 0, 0] }, rTop, rBottom, length, segments, style);
}

/** A torus in the xy plane (axis along z). */
export function torus(b: Bucket, p: Placement, radius: number, tube: number, radial: number, tubular: number, style?: Style, arc = Math.PI * 2): void {
  const g = new TorusGeometry(radius, tube, radial, tubular, arc);
  addGeometry(b, g, matrixOf(p), style, true);
  g.dispose();
}

export function sphere(b: Bucket, p: Placement, radius: number, wSeg: number, hSeg: number, style?: Style, phiLength = Math.PI * 2, thetaLength = Math.PI): void {
  const g = new SphereGeometry(radius, wSeg, hSeg, 0, phiLength, 0, thetaLength);
  addGeometry(b, g, matrixOf(p), style, true);
  g.dispose();
}

/** Revolve an (r, y) profile about y. */
export function lathe(b: Bucket, p: Placement, profile: readonly (readonly [number, number])[], segments: number, style?: Style): void {
  const g = new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), segments);
  addGeometry(b, g, matrixOf(p), style, true);
  g.dispose();
}

/** A plain box placed and rotated freely (no bevel): a spoke, a bracket, a strap. */
export function bar(b: Bucket, p: Placement, size: Vec3, style?: Style): void {
  const g = new BoxGeometry(size[0], size[1], size[2]);
  addGeometry(b, g, matrixOf(p), style, true);
  g.dispose();
}
