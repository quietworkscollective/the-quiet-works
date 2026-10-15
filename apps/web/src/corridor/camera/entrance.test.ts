import { describe, expect, it } from 'vitest';
import { SPINE_TIMING } from '../../timing.ts';
import { createEntranceFollower, createEntrancePath, entranceProgress, entrancePose, WALK_IN_KEYS, walkT } from './entrance.ts';
import { handoverPose, landingPose } from './viewpoints.ts';

describe('entrance path', () => {
  it('passes exactly through every key and lands on the starting view', () => {
    for (const key of WALK_IN_KEYS) expect(entranceProgress(key.t)).toBeCloseTo(key.s, 9);
    expect(entranceProgress(0)).toBe(0);
    expect(entranceProgress(1)).toBe(1);
  });

  it('clamps outside 0..1', () => {
    expect(entranceProgress(-1)).toBe(0);
    expect(entranceProgress(2)).toBe(1);
  });

  it('only ever goes forward as progress grows, and never overshoots a key', () => {
    let last = entranceProgress(0);
    for (let i = 1; i <= 1000; i += 1) {
      const s = entranceProgress(i / 1000);
      expect(s).toBeGreaterThanOrEqual(last - 1e-9);
      last = s;
    }
    for (let k = 0; k < WALK_IN_KEYS.length - 1; k += 1) {
      const a = WALK_IN_KEYS[k]!;
      const b = WALK_IN_KEYS[k + 1]!;
      for (let i = 0; i <= 20; i += 1) {
        const s = entranceProgress(a.t + ((b.t - a.t) * i) / 20);
        expect(s).toBeGreaterThanOrEqual(a.s - 1e-9);
        expect(s).toBeLessThanOrEqual(b.s + 1e-9);
      }
    }
  });

  it('has no corner in its speed where one beat hands over to the next', () => {
    const eps = 1e-4;
    const slope = (t: number) => (entranceProgress(t + eps) - entranceProgress(t - eps)) / (2 * eps);
    for (const key of WALK_IN_KEYS.slice(1, -1)) {
      expect(Math.abs(slope(key.t - 2 * eps) - slope(key.t + 2 * eps))).toBeLessThan(0.05 / 5);
    }
  });

  it('arrives at rest: the last stretch before the hand-over is flat', () => {
    expect(entranceProgress(0.9)).toBeCloseTo(1, 9);
    expect(entranceProgress(0.95)).toBe(1);
  });

  it('honours any set of keys', () => {
    const path = createEntrancePath([
      { t: 0, s: 0 },
      { t: 0.5, s: 0.8 },
      { t: 1, s: 1 },
    ]);
    expect(path(0.5)).toBeCloseTo(0.8, 9);
    expect(path(0.25)).toBeGreaterThan(0);
    expect(path(0.25)).toBeLessThan(0.8);
  });
});

describe.each([
  ['a landscape screen', false],
  ['a portrait screen', true],
] as const)('the walk-in pose on %s', (_name, portrait) => {
  const hero = landingPose(portrait);
  const start = handoverPose(portrait);

  it('begins at the hero and ends exactly at the starting view: the hand-over is no snap', () => {
    expect(entrancePose(0, portrait)).toEqual(hero);
    expect(entrancePose(1, portrait)).toEqual(start);
    expect(entrancePose(0.9, portrait)).toEqual(start);
    expect(entrancePose(1.5, portrait)).toEqual(start);
    expect(entrancePose(-1, portrait)).toEqual(hero);
  });

  it('never moves away from the starting view as the scroll goes on: no travel past it and back', () => {
    const away = (t: number) => {
      const p = entrancePose(t, portrait);
      return Math.hypot(p.x - start.x, p.z - start.z) + Math.abs(p.yawDeg - start.yawDeg) / 60 + Math.abs(p.pitchDeg - start.pitchDeg) / 60;
    };
    let last = away(0);
    for (let i = 1; i <= 1000; i += 1) {
      const d = away(i / 1000);
      expect(d).toBeLessThanOrEqual(last + 1e-9);
      last = d;
    }
    expect(last).toBeCloseTo(0, 9);
  });

  it('stays inside the lobby the whole way and keeps every component between hero and start', () => {
    const lo = (a: number, b: number) => Math.min(a, b) - 1e-9;
    const hi = (a: number, b: number) => Math.max(a, b) + 1e-9;
    for (let i = 0; i <= 200; i += 1) {
      const p = entrancePose(i / 200, portrait);
      expect(p.z).toBeGreaterThanOrEqual(lo(hero.z, start.z));
      expect(p.z).toBeLessThanOrEqual(hi(hero.z, start.z));
      expect(p.yawDeg).toBeGreaterThanOrEqual(lo(hero.yawDeg, start.yawDeg));
      expect(p.yawDeg).toBeLessThanOrEqual(hi(hero.yawDeg, start.yawDeg));
      expect(p.pitchDeg).toBeGreaterThanOrEqual(lo(hero.pitchDeg, start.pitchDeg));
      expect(p.pitchDeg).toBeLessThanOrEqual(hi(hero.pitchDeg, start.pitchDeg));
    }
  });

  it('moves smoothly: no step of the scroll jumps the view', () => {
    // 2000 steps across the run; the camera never moves more than a few centimetres or a fraction of a degree at once.
    let last = entrancePose(0, portrait);
    for (let i = 1; i <= 2000; i += 1) {
      const p = entrancePose(i / 2000, portrait);
      expect(Math.hypot(p.x - last.x, p.z - last.z)).toBeLessThan(0.02);
      expect(Math.abs(p.yawDeg - last.yawDeg)).toBeLessThan(0.1);
      last = p;
    }
  });
});

describe('the walk-in’s clock', () => {
  it('reaches the end of the walk-in at the hand-over point of the scroll and holds', () => {
    expect(walkT(0)).toBe(0);
    expect(walkT(0.65)).toBe(1);
    expect(walkT(1)).toBe(1);
    expect(walkT(0.325)).toBeCloseTo(0.5, 9);
  });
});

describe('entrance follower', () => {
  it('makes 95% of a step within the 120 ms smoothing window and never overshoots', () => {
    const follower = createEntranceFollower(SPINE_TIMING.scrollSmoothingMs, 5);
    let t = 0;
    let at120 = 0;
    while (t < 1000) {
      const z = follower.step(1000 / 60, 4);
      t += 1000 / 60;
      expect(z).toBeLessThanOrEqual(5 + 1e-9);
      expect(z).toBeGreaterThanOrEqual(4 - 1e-9);
      if (Math.abs(t - 120) < 1000 / 120) at120 = z;
    }
    expect(5 - at120).toBeGreaterThan(0.94);
    expect(follower.z).toBe(4);
    expect(follower.settled(4)).toBe(true);
  });

  it('has no automatic travel: it holds still when the target does not move', () => {
    const follower = createEntranceFollower(SPINE_TIMING.scrollSmoothingMs, 3.5);
    for (let i = 0; i < 100; i += 1) follower.step(1000 / 60, 3.5);
    expect(follower.z).toBe(3.5);
  });

  it('reset jumps to a position', () => {
    const follower = createEntranceFollower(SPINE_TIMING.scrollSmoothingMs, 5);
    follower.reset(1);
    expect(follower.z).toBe(1);
  });
});
