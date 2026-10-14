/** A CSS `cubic-bezier(x1, y1, x2, y2)` timing function, as the four control numbers. */
export type Bezier = readonly [number, number, number, number];

export type EasingFn = (t: number) => number;

/**
 * The CSS timing function for a cubic Bézier through (0,0) and (1,1). Newton's method with a
 * bisection fallback, as browsers solve it, so values here match what a CSS transition with
 * the same numbers would produce.
 */
export function cubicBezier([x1, y1, x2, y2]: Bezier): EasingFn {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number): number => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number): number => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number): number => (3 * ax * s + 2 * bx) * s + cx;

  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let s = t;
    for (let i = 0; i < 8; i += 1) {
      const error = sampleX(s) - t;
      if (Math.abs(error) < 1e-7) return sampleY(s);
      const slope = slopeX(s);
      if (Math.abs(slope) < 1e-6) break;
      s -= error / slope;
    }
    let lo = 0;
    let hi = 1;
    s = t;
    while (lo < hi) {
      const x = sampleX(s);
      if (Math.abs(x - t) < 1e-7) break;
      if (t > x) lo = s;
      else hi = s;
      const next = (hi - lo) / 2 + lo;
      if (next === s) break;
      s = next;
    }
    return sampleY(s);
  };
}

/** ∫₀¹ f, by the midpoint rule. Used once at start-up to size braking distances exactly. */
export function integrate01(f: EasingFn, steps = 2048): number {
  let sum = 0;
  for (let i = 0; i < steps; i += 1) sum += f((i + 0.5) / steps);
  return sum / steps;
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Hermite smoothstep on [0, 1]: zero slope at both ends. */
export const smoothstep01 = (t: number): number => {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
};
