import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Curve,
  LatheGeometry,
  SphereGeometry,
  SplineCurve,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Procedural geometry builders. Callers own (and dispose) what they create. */

export { RoundedBoxGeometry };

/** A box translated into place, ready for merging. */
export function boxAt(w: number, h: number, d: number, x: number, y: number, z: number): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

export function roundedBoxAt(
  w: number,
  h: number,
  d: number,
  radius: number,
  x: number,
  y: number,
  z: number,
  segments = 3,
): BufferGeometry {
  const g = new RoundedBoxGeometry(w, h, d, segments, radius);
  g.translate(x, y, z);
  return g;
}

export function cylinderAt(
  rTop: number,
  rBottom: number,
  h: number,
  x: number,
  y: number,
  z: number,
  segments = 24,
): BufferGeometry {
  const g = new CylinderGeometry(rTop, rBottom, h, segments);
  g.translate(x, y, z);
  return g;
}

/** A cylinder lying along x or z instead of y. */
export function cylinderAlong(
  axis: 'x' | 'z',
  rTop: number,
  rBottom: number,
  h: number,
  x: number,
  y: number,
  z: number,
  segments = 24,
): BufferGeometry {
  const g = new CylinderGeometry(rTop, rBottom, h, segments);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

export function sphereAt(r: number, x: number, y: number, z: number, segments = 16): BufferGeometry {
  const g = new SphereGeometry(r, segments, Math.max(8, segments / 2));
  g.translate(x, y, z);
  return g;
}

/**
 * Merge and free the parts. Parts are normalised to non-indexed (RoundedBoxGeometry is not
 * indexed, the primitives are) so any mix can be merged; position, normal and uv are kept.
 */
export function merge(parts: BufferGeometry[], keep: readonly string[] = []): BufferGeometry {
  const flat = parts.map((part) => {
    const g = part.index ? part.toNonIndexed() : part.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv' && !keep.includes(name)) g.deleteAttribute(name);
    }
    return g;
  });
  const merged = mergeGeometries(flat, false);
  for (const part of parts) part.dispose();
  for (const g of flat) g.dispose();
  if (!merged) throw new Error('geometry merge failed: mismatched attributes');
  return merged;
}

/** Revolve an (r, y) profile through a smooth Catmull-Rom curve. */
export function smoothLathe(
  control: ReadonlyArray<readonly [number, number]>,
  samples: number,
  segments: number,
): LatheGeometry {
  const curve = new SplineCurve(control.map(([r, y]) => new Vector2(r, y)));
  const points = curve.getPoints(samples - 1).map((p) => new Vector2(Math.max(0, p.x), p.y));
  return new LatheGeometry(points, segments);
}

/**
 * The rubber-stamp handle: a flared seat, a slim neck that swells slightly, and a mushroom knob.
 * Origin at the base; rises ~0.128 m.
 */
export function createHandleGeometry(): LatheGeometry {
  return smoothLathe(
    [
      [0.0005, 0.0],
      [0.0125, 0.0],
      [0.0125, 0.016],
      [0.0112, 0.032],
      [0.0118, 0.048],
      [0.0138, 0.061],
      [0.0188, 0.072],
      [0.0275, 0.082],
      [0.0325, 0.096],
      [0.0318, 0.108],
      [0.0258, 0.119],
      [0.0152, 0.1255],
      [0.005, 0.1277],
      [0, 0.128],
    ],
    48,
    48,
  );
}

/** Brass ferrule at the base of the handle. */
export function createFerruleGeometry(): LatheGeometry {
  return smoothLathe(
    [
      [0.0105, 0.0],
      [0.0172, 0.0],
      [0.0178, 0.002],
      [0.0168, 0.012],
      [0.0148, 0.0175],
      [0.0132, 0.0195],
    ],
    14,
    32,
  );
}

class HelixCurve extends Curve<Vector3> {
  constructor(
    private readonly radius: number,
    private readonly length: number,
    private readonly turns: number,
  ) {
    super();
  }
  override getPoint(t: number, target = new Vector3()): Vector3 {
    const a = t * this.turns * Math.PI * 2;
    return target.set(Math.cos(a) * this.radius, t * this.length, Math.sin(a) * this.radius);
  }
}

/**
 * A helical return spring of rest length `length`. Each vertex carries `aT`, the height of its
 * ring's centre line, so a vertex shader can compress the pitch without squashing the wire.
 */
export function createSpringGeometry(
  length: number,
  turns = 9,
  coilRadius = 0.011,
  wireRadius = 0.0018,
): TubeGeometry {
  const tubular = turns * 16;
  const radial = 6;
  const geometry = new TubeGeometry(new HelixCurve(coilRadius, length, turns), tubular, wireRadius, radial, false);
  const count = (tubular + 1) * (radial + 1);
  const aT = new Float32Array(count);
  for (let i = 0; i <= tubular; i += 1) {
    for (let j = 0; j <= radial; j += 1) aT[i * (radial + 1) + j] = (i / tubular) * length;
  }
  geometry.setAttribute('aT', new BufferAttribute(aT, 1));
  return geometry;
}

/** Brass dome bell, rim at y = 0. */
export function createBellGeometry(): LatheGeometry {
  return smoothLathe(
    [
      [0.0005, 0.0],
      [0.0525, 0.0],
      [0.0525, 0.0035],
      [0.0478, 0.008],
      [0.0435, 0.0165],
      [0.0365, 0.0275],
      [0.0265, 0.0365],
      [0.0145, 0.0425],
      [0.0055, 0.0462],
      [0.0005, 0.0468],
    ],
    28,
    40,
  );
}

/** Conical lamp shade, open at both ends, local +y is the narrow end. Rim radius 0.115 at y = -0.17. */
export function createShadeGeometry(): LatheGeometry {
  return smoothLathe(
    [
      [0.034, 0.012],
      [0.036, 0.0],
      [0.052, -0.04],
      [0.078, -0.1],
      [0.107, -0.158],
      [0.1155, -0.172],
    ],
    20,
    48,
  );
}

/** Weighted iron lamp base. */
export function createLampBaseGeometry(): LatheGeometry {
  return smoothLathe(
    [
      [0.0005, 0.0],
      [0.098, 0.0],
      [0.1, 0.006],
      [0.094, 0.02],
      [0.074, 0.03],
      [0.032, 0.038],
      [0.02, 0.05],
      [0.017, 0.064],
      [0.0005, 0.066],
    ],
    24,
    40,
  );
}

/** Small rounded-end cylinder along +y with its base at the origin. */
export function rod(r: number, length: number, segments = 14): BufferGeometry {
  const g = new CylinderGeometry(r, r, length, segments);
  g.translate(0, length / 2, 0);
  return g;
}
