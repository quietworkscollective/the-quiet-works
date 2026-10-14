import { describe, expect, it } from 'vitest';
import { SPINE_TIMING } from '../../timing.ts';
import { ENTRANCE_KEYS, HANDOVER, HANDOVER_PORTRAIT_TURN_DEG } from '../layout.ts';
import { createEntranceFollower, createEntrancePath, entranceYaw, entranceZ, SETTLE_BEAT_FROM } from './entrance.ts';
import { WALK_EASING } from '../../timing.ts';
import { cubicBezier } from '../../firstPerson/easing.ts';

describe('entrance path', () => {
  it('passes exactly through every key and lands on the hand-over', () => {
    for (const key of ENTRANCE_KEYS) expect(entranceZ(key.t)).toBeCloseTo(key.z, 9);
    expect(entranceZ(1)).toBe(HANDOVER.z);
    expect(entranceZ(0)).toBe(ENTRANCE_KEYS[0]!.z);
  });

  it('clamps outside 0..1', () => {
    expect(entranceZ(-1)).toBe(ENTRANCE_KEYS[0]!.z);
    expect(entranceZ(2)).toBe(HANDOVER.z);
  });

  it('only ever walks forward as progress grows, and never overshoots a key', () => {
    let last = entranceZ(0);
    for (let i = 1; i <= 1000; i += 1) {
      const z = entranceZ(i / 1000);
      expect(z).toBeLessThanOrEqual(last + 1e-9);
      last = z;
    }
    for (let k = 0; k < ENTRANCE_KEYS.length - 1; k += 1) {
      const a = ENTRANCE_KEYS[k]!;
      const b = ENTRANCE_KEYS[k + 1]!;
      for (let i = 0; i <= 20; i += 1) {
        const z = entranceZ(a.t + ((b.t - a.t) * i) / 20);
        expect(z).toBeLessThanOrEqual(a.z + 1e-9);
        expect(z).toBeGreaterThanOrEqual(b.z - 1e-9);
      }
    }
  });

  it('has no corner in its speed where one beat hands over to the next', () => {
    const eps = 1e-4;
    const slope = (t: number) => (entranceZ(t + eps) - entranceZ(t - eps)) / (2 * eps);
    for (const key of ENTRANCE_KEYS.slice(1, -1)) {
      expect(Math.abs(slope(key.t - 2 * eps) - slope(key.t + 2 * eps))).toBeLessThan(0.05);
    }
  });

  it('arrives at rest: the last stretch before the hand-over is flat', () => {
    expect(entranceZ(0.9)).toBeCloseTo(HANDOVER.z, 9);
    expect(entranceZ(0.95)).toBe(HANDOVER.z);
  });

  it('honours any set of keys', () => {
    const path = createEntrancePath([
      { t: 0, z: 10 },
      { t: 0.5, z: 2 },
      { t: 1, z: 0 },
    ]);
    expect(path(0.5)).toBeCloseTo(2, 9);
    expect(path(0.25)).toBeLessThan(10);
    expect(path(0.25)).toBeGreaterThan(2);
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

describe('portrait entrance yaw', () => {
  const turn = HANDOVER_PORTRAIT_TURN_DEG;

  it('turns only over the last tenth of the walk-in: 0 until progress 0.90, the full turn at 1', () => {
    expect(SETTLE_BEAT_FROM).toBeCloseTo(0.9, 12);
    for (const t of [0, 0.25, 0.5, 0.75, 0.9]) expect(entranceYaw(t, turn)).toBe(0);
    expect(entranceYaw(1, turn)).toBe(turn);
    expect(entranceYaw(1.2, turn)).toBe(turn);
    expect(entranceYaw(-1, turn)).toBe(0);
  });

  it('eases with the walk easing: quick to leave, soft to arrive', () => {
    const ease = cubicBezier(WALK_EASING);
    for (const t of [0.91, 0.93, 0.95, 0.97, 0.99]) {
      expect(entranceYaw(t, turn)).toBeCloseTo(turn * ease((t - 0.9) / 0.1), 9);
    }
    expect(entranceYaw(0.95, turn)).toBeGreaterThan(turn / 2);
  });

  it('only turns toward +x and never past the limit, however the progress moves', () => {
    let last = 0;
    for (let i = 0; i <= 1000; i += 1) {
      const yaw = entranceYaw(i / 1000, turn);
      expect(yaw).toBeGreaterThanOrEqual(last - 1e-12);
      expect(yaw).toBeLessThanOrEqual(turn);
      last = yaw;
    }
  });

  it('is zero for a landscape screen (no turn requested)', () => {
    for (let i = 0; i <= 20; i += 1) expect(entranceYaw(i / 20, 0)).toBe(0);
  });
});
