import { describe, expect, it } from 'vitest';
import { SWING_EASING, WALK_EASING } from '../timing.ts';
import { cubicBezier, integrate01 } from './easing.ts';

describe('cubicBezier', () => {
  it('starts at 0 and ends at 1 for both house easings', () => {
    for (const bezier of [WALK_EASING, SWING_EASING]) {
      const ease = cubicBezier(bezier);
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
      expect(ease(-0.5)).toBe(0);
      expect(ease(1.5)).toBe(1);
    }
  });

  it('is monotonic', () => {
    for (const bezier of [WALK_EASING, SWING_EASING]) {
      const ease = cubicBezier(bezier);
      let last = 0;
      for (let i = 1; i <= 200; i += 1) {
        const v = ease(i / 200);
        expect(v).toBeGreaterThanOrEqual(last - 1e-9);
        last = v;
      }
    }
  });

  it('matches known CSS values for the walk easing, front-loaded and landing softly', () => {
    const ease = cubicBezier(WALK_EASING);
    expect(ease(0.25)).toBeCloseTo(0.5943, 3);
    expect(ease(0.5)).toBeCloseTo(0.8729, 3);
    expect(ease(0.75)).toBeCloseTo(0.9756, 3);
  });

  it('is the identity for the linear Bézier', () => {
    const linear = cubicBezier([1 / 3, 1 / 3, 2 / 3, 2 / 3]);
    for (let i = 0; i <= 10; i += 1) expect(linear(i / 10)).toBeCloseTo(i / 10, 5);
  });

  it('swing easing is slow at both ends and fast in the middle', () => {
    const ease = cubicBezier(SWING_EASING);
    expect(ease(0.1)).toBeLessThan(0.05);
    expect(ease(0.9)).toBeGreaterThan(0.95);
    expect(ease(0.5)).toBeGreaterThan(0.5);
  });
});

describe('integrate01', () => {
  it('integrates the identity to one half and the walk easing to about three quarters', () => {
    expect(integrate01((t) => t)).toBeCloseTo(0.5, 6);
    expect(integrate01(cubicBezier(WALK_EASING))).toBeCloseTo(0.7504, 3);
  });
});
