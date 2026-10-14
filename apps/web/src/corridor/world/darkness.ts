import type { Vec3 } from './math.ts';

/**
 * Darkness as a designed thing, not one black. Founder feedback: a long, symmetrical, still
 * corridor running into black is the archetypal horror image, and the first full view read as
 * creepy. So the darkness is kept to where a room keeps it, and the corridor stays warm and lit
 * all the way down:
 *
 *  1. the lit route: the floor down the middle, each sconce's pool on the wall beside it and the
 *     doors in those pools, at full value, repeating at a steady rhythm to the vanishing point;
 *  2. dim recesses: the piers between pools, the upper walls, the ceiling and its ribs, which
 *     fall away toward the dark above the lamps. This module bakes that into the vertex colours,
 *     so it costs no shader and no draw call. The recesses are dim, never black, and warm: the
 *     fill and the fog are amber-brown, so a shadow reads as brown;
 *  3. deep recesses only: the ceiling and the upper wall are the darkest places. Nothing in the
 *     walkable corridor, and nothing along its line of sight, is allowed to fall to black.
 *
 * A light haze layer from the look lane goes on top of these; it needs the bands to differ.
 *
 * The multiplier is applied to the surface's colour, so it dims every light that reaches it
 * (the fill and the lamps alike): a pier is dim whatever the lamps' tails add to it.
 */

/** A wall light's position in plan, metres. */
export interface Pool {
  x: number;
  z: number;
}

export interface DarknessOptions {
  /** Pools of light on the walls: the nearest one sets how lit a point is. */
  pools: readonly Pool[];
  /** Plan distance over which a pool falls to about a third of its centre, metres. */
  radius: number;
  /** The value a point far from every pool keeps, 0..1. */
  floor: number;
  /** Height where walls start to fall into the dark, and the room's height. */
  fallFrom: number;
  height: number;
  /** The value reached at the ceiling, 0..1. */
  ceilingValue: number;
}

const smooth = (t: number): number => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

/** The pool term alone: 1 at a light, `floor` far from every light. */
export function poolValue(x: number, z: number, o: DarknessOptions): number {
  let best = 0;
  for (const p of o.pools) {
    const d = Math.hypot(x - p.x, z - p.z) / o.radius;
    best = Math.max(best, Math.exp(-d * d));
  }
  return o.floor + (1 - o.floor) * best;
}

/** The height term alone: 1 up to `fallFrom`, easing to `ceilingValue` at the ceiling. */
export function heightValue(y: number, o: DarknessOptions): number {
  return 1 - (1 - o.ceilingValue) * smooth((y - o.fallFrom) / Math.max(0.01, o.height - o.fallFrom));
}

/**
 * A baked multiplier in (0, 1] for a point of plaster, ceiling or cornice: the pool term times
 * the height term. Floors and the oak below the dado rail are not given it (the floor is the lit
 * route; the dado is already dark).
 */
export function darkness(o: DarknessOptions): (p: Vec3) => number {
  return (p) => poolValue(p[0], p[2], o) * heightValue(p[1], o);
}
