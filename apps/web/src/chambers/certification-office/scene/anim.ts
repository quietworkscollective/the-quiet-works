/** Small, allocation-free animation helpers. Everything is a pure function of time. */

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

export const easeInCubic = (t: number): number => t * t * t;
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutQuad = (t: number): number => 1 - (1 - t) * (1 - t);
export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;

/** Unit step response of an underdamped spring (0 -> 1, overshoots). `t` in seconds. */
export function springResponse(t: number, zeta: number, omega: number): number {
  if (t <= 0) return 0;
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  const decay = Math.exp(-zeta * omega * t);
  return 1 - decay * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t));
}

/** Unit step response of a critically damped spring (0 -> 1, never overshoots). */
export function criticalResponse(t: number, omega: number): number {
  if (t <= 0) return 0;
  return 1 - (1 + omega * t) * Math.exp(-omega * t);
}

/** Peak overshoot fraction of an underdamped spring. */
export const overshootOf = (zeta: number): number =>
  Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta * zeta));

/** Deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable pseudo-random in [0, 1) from an integer pair; no state. */
export function hash2(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 1D value noise in [-1, 1] for shakes and tremble. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash2(i, seed) * 2 - 1;
  const b = hash2(i + 1, seed) * 2 - 1;
  return a + (b - a) * u;
}

/** Fraction of the fall duration the single rebound lasts after first contact. */
export const HEAVY_FALL_BOUNCE = 0.38;

/**
 * A heavy panel falling to its stop: an accelerating fall that makes first contact at t = 1, one
 * small rebound off the stop (to 93% of the open angle), then still. `t` is in fall durations, so
 * the rebound runs from t = 1 to 1 + HEAVY_FALL_BOUNCE. Returns 0..1 of the open angle.
 */
export function heavyFall(t: number): number {
  if (t <= 0) return 0;
  if (t < 1) return t * t;
  if (t < 1 + HEAVY_FALL_BOUNCE) return 1 - 0.07 * Math.sin((Math.PI * (t - 1)) / HEAVY_FALL_BOUNCE);
  return 1;
}
