import { hash2, noise1, type Vec3 } from './math.ts';

/**
 * Baked contact shading. The corridor has no shadow maps and no ambient occlusion pass; instead
 * the vertices of large surfaces are darkened where they meet another surface (floor against
 * wall, wall against ceiling), by an analytic function of the room's planes. Surfaces are built
 * with breakpoints near those junctions so the gradient has vertices to live on.
 */

export interface RoomBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Optional end planes (the lobby has them; the corridor runs on). */
  z0?: number;
  z1?: number;
}

export interface CornerShadeOptions {
  /** Darkening at the junction itself, 0..1. */
  strength: number;
  /** Falloff distance in metres. */
  radius: number;
}

/**
 * A multiplier in (0, 1] for a point `p` with normal `n` inside the box. Each plane darkens the
 * surfaces that meet it (those not parallel to it) by exp(-distance / radius).
 */
export function cornerShade(box: RoomBox, options: CornerShadeOptions = { strength: 0.5, radius: 0.38 }) {
  const planes: { d: (p: Vec3) => number; n: Vec3 }[] = [
    { d: (p) => p[0] - box.x0, n: [1, 0, 0] },
    { d: (p) => box.x1 - p[0], n: [-1, 0, 0] },
    { d: (p) => p[1] - box.y0, n: [0, 1, 0] },
    { d: (p) => box.y1 - p[1], n: [0, -1, 0] },
  ];
  const { z0, z1 } = box;
  if (z0 !== undefined) planes.push({ d: (p) => p[2] - z0, n: [0, 0, 1] });
  if (z1 !== undefined) planes.push({ d: (p) => z1 - p[2], n: [0, 0, -1] });
  return (p: Vec3, n: Vec3): number => {
    let k = 1;
    for (const plane of planes) {
      const parallel = Math.abs(n[0] * plane.n[0] + n[1] * plane.n[1] + n[2] * plane.n[2]);
      const w = 1 - parallel;
      if (w < 0.02) continue;
      const d = Math.max(0, plane.d(p));
      k *= 1 - options.strength * w * Math.exp(-d / options.radius);
    }
    return k;
  };
}

/**
 * Slow tonal drift along the corridor, so no two bays are quite the same paint: a smooth noise in
 * metres, never more than a few percent either way. Deterministic.
 */
export function bayTone(z: number, seed = 1): number {
  return 1 + 0.035 * noise1(z / 3.1, seed) + 0.02 * noise1(z / 0.9 + 17, seed + 5);
}

/** A stable per-bay UV offset in metres, so one plaster texture does not repeat bay after bay. */
export function bayOffset(index: number, axis: 0 | 1, tile: number): number {
  return hash2(index, 31 + axis * 7) * tile;
}
