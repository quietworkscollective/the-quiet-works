import { describe, expect, it } from 'vitest';
import { SITE_SCROLL } from '../../timing.ts';
import { AMBIENT_FRAME_MS, AMBIENT_PIVOT_M, ambientDrift, driftWeight } from './ambient.ts';

const PERIOD_MS = SITE_SCROLL.ambient.periodS * 1000;

describe('ambient drift', () => {
  it('is a single sideways sinusoid of 4 cm over 40 s, beginning at rest at the authored pose', () => {
    expect(ambientDrift(0).x).toBe(0);
    expect(ambientDrift(0).yawDeg).toBeCloseTo(0, 12);
    expect(ambientDrift(PERIOD_MS / 4).x).toBeCloseTo(SITE_SCROLL.ambient.lateralM, 12);
    expect(ambientDrift(PERIOD_MS / 2).x).toBeCloseTo(0, 12);
    expect(ambientDrift((3 * PERIOD_MS) / 4).x).toBeCloseTo(-SITE_SCROLL.ambient.lateralM, 12);
    expect(ambientDrift(PERIOD_MS).x).toBeCloseTo(0, 12);
    expect(ambientDrift(PERIOD_MS + PERIOD_MS / 4).x).toBeCloseTo(SITE_SCROLL.ambient.lateralM, 12);
    for (let ms = 0; ms <= PERIOD_MS; ms += 250) {
      expect(ambientDrift(ms).x).toBeCloseTo(0.04 * Math.sin((2 * Math.PI * ms) / PERIOD_MS), 12);
    }
  });

  it('never exceeds the stated amplitude', () => {
    let peak = 0;
    for (let ms = 0; ms <= 3 * PERIOD_MS; ms += 100) peak = Math.max(peak, Math.abs(ambientDrift(ms).x));
    expect(peak).toBeLessThanOrEqual(0.04 + 1e-12);
    expect(peak).toBeGreaterThan(0.0399);
  });

  it('corrects the yaw to keep a point ahead framed: against the slide, and within 0.3 degrees', () => {
    let peak = 0;
    for (let ms = 0; ms <= PERIOD_MS; ms += 100) {
      const { x, yawDeg } = ambientDrift(ms);
      peak = Math.max(peak, Math.abs(yawDeg));
      expect(Math.abs(yawDeg)).toBeLessThanOrEqual(SITE_SCROLL.ambient.yawDeg);
      expect(yawDeg).toBeCloseTo((-Math.atan(x / AMBIENT_PIVOT_M) * 180) / Math.PI, 12);
      if (Math.abs(x) > 0.001) expect(Math.sign(yawDeg)).toBe(-Math.sign(x));
    }
    expect(peak).toBeGreaterThan(0.25);
  });

  it('clamps the yaw to the configured limit whatever the geometry', () => {
    const wide = { lateralM: 2, periodS: 40, yawDeg: 0.3 };
    for (let ms = 0; ms <= PERIOD_MS; ms += 500) {
      expect(Math.abs(ambientDrift(ms, wide).yawDeg)).toBeLessThanOrEqual(0.3);
    }
  });

  it('is drawn at 15 frames a second, not every display frame', () => {
    expect(AMBIENT_FRAME_MS).toBeCloseTo(1000 / 15, 9);
    // At that cadence the arc moves under half a millimetre a frame.
    const step = Math.abs(ambientDrift(AMBIENT_FRAME_MS).x - ambientDrift(0).x);
    expect(step).toBeLessThan(0.0005);
  });
});

describe('drift weight', () => {
  it('is all of the drift at the first frame and none from 10% of the scroll on', () => {
    expect(driftWeight(0)).toBe(1);
    expect(driftWeight(-0.5)).toBe(1);
    expect(driftWeight(SITE_SCROLL.driftBlendOut)).toBe(0);
    for (const p of [0.1, 0.2, 0.65, 1]) expect(driftWeight(p)).toBe(0);
  });

  it('blends down monotonically and without corners, half way at half the blend', () => {
    expect(driftWeight(SITE_SCROLL.driftBlendOut / 2)).toBeCloseTo(0.5, 12);
    let last = 1;
    for (let i = 0; i <= 1000; i += 1) {
      const w = driftWeight((i / 1000) * 0.12);
      expect(w).toBeLessThanOrEqual(last + 1e-12);
      last = w;
    }
    const eps = 1e-6;
    expect((driftWeight(0) - driftWeight(eps)) / eps).toBeLessThan(1e-3);
    expect((driftWeight(0.1 - eps) - driftWeight(0.1)) / eps).toBeLessThan(1e-3);
  });
});
