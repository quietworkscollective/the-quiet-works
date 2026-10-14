import { VEIL_FULL, veilCoverage, type VeilKeyframes } from './veil.ts';

/** The ADR 0003 / consult 4 table, as the shell passes it (SITE_SCROLL.veil). */
const VEIL: VeilKeyframes = [
  [0, 0],
  [0.2, 0.15],
  [0.55, 0.85],
  [0.65, 1],
  [0.8, 1],
  [1, 0],
];

describe('veilCoverage', () => {
  it('is clear in the hero and clear again once the game window is reached', () => {
    expect(veilCoverage(0, VEIL)).toBe(0);
    expect(veilCoverage(1, VEIL)).toBe(0);
  });

  it('hits every keyframe of the table exactly', () => {
    for (const [progress, coverage] of VEIL) expect(veilCoverage(progress, VEIL)).toBeCloseTo(coverage, 10);
  });

  it('rises broadly between 20% and 55%, from 15% to 85% coverage', () => {
    expect(veilCoverage(0.375, VEIL)).toBeCloseTo(0.5, 5);
    expect(veilCoverage(0.2, VEIL)).toBeCloseTo(0.15, 10);
    expect(veilCoverage(0.55, VEIL)).toBeCloseTo(0.85, 10);
  });

  it('holds at 100% from 65% to 80%: the readiness seam', () => {
    for (const p of [0.65, 0.7, 0.75, 0.8]) expect(veilCoverage(p, VEIL)).toBe(1);
  });

  it('clears from 80% to 100%, linearly', () => {
    expect(veilCoverage(0.9, VEIL)).toBeCloseTo(0.5, 10);
    expect(veilCoverage(0.95, VEIL)).toBeCloseTo(0.25, 10);
  });

  it('is monotonic up to the seam and monotonic down after it', () => {
    let previous = 0;
    for (let p = 0; p <= 0.65; p += 0.005) {
      const c = veilCoverage(p, VEIL);
      expect(c).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = c;
    }
    previous = 1;
    for (let p = 0.8; p <= 1; p += 0.005) {
      const c = veilCoverage(p, VEIL);
      expect(c).toBeLessThanOrEqual(previous + 1e-12);
      previous = c;
    }
  });

  it('clamps progress outside 0..1', () => {
    expect(veilCoverage(-4, VEIL)).toBe(0);
    expect(veilCoverage(9, VEIL)).toBe(0);
  });

  it('holds the last keyframe\'s coverage past it, when the table stops short of the end', () => {
    const SHORT: VeilKeyframes = [
      [0, 0],
      [0.5, 0.4],
    ];
    expect(veilCoverage(0.5, SHORT)).toBeCloseTo(0.4, 10);
    expect(veilCoverage(0.9, SHORT)).toBeCloseTo(0.4, 10);
    expect(veilCoverage(1, SHORT)).toBeCloseTo(0.4, 10);
  });

  it('is zero with no keyframes', () => {
    expect(veilCoverage(0.5, [])).toBe(0);
  });

  it('calls the veil full only at the seam, never while it is still rising or clearing', () => {
    expect(veilCoverage(0.64, VEIL)).toBeLessThan(VEIL_FULL);
    expect(veilCoverage(0.7, VEIL)).toBeGreaterThanOrEqual(VEIL_FULL);
    expect(veilCoverage(0.81, VEIL)).toBeLessThan(VEIL_FULL);
  });
});
