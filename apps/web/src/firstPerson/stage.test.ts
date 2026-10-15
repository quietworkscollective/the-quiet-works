import { describe, expect, it } from 'vitest';
import { DEFAULT_SOFT_EDGE_DEG, edgeScale, horizontalFovDeg, MAX_VISIBLE_HALF_ARC_DEG, wrapDeg, yawLimitDeg, yawRelative } from './stage.ts';

describe('the horizontal field of view', () => {
  it('is what a vertical field of view and an aspect make: 70.9 degrees at 48 degrees on 16:10', () => {
    expect(horizontalFovDeg(48, 1.6)).toBeCloseTo(70.9, 1);
  });

  it('is wider on a wider screen and narrower on a taller one', () => {
    expect(horizontalFovDeg(48, 16 / 9)).toBeGreaterThan(horizontalFovDeg(48, 1.6));
    expect(horizontalFovDeg(58, 412 / 839)).toBeLessThan(horizontalFovDeg(58, 1));
  });
});

describe('the yaw limit (ADR 0007): visibleHalfArc - horizontalFov / 2', () => {
  const stage = { visibleHalfArcDeg: 90 };

  it('is about 54.5 degrees on a 16:10 desktop screen', () => {
    expect(yawLimitDeg(stage, horizontalFovDeg(48, 1.6))).toBeCloseTo(54.55, 1);
  });

  it('is about 51.6 degrees at 16:9', () => {
    expect(yawLimitDeg(stage, horizontalFovDeg(48, 16 / 9))).toBeCloseTo(51.6, 1);
  });

  it('is about 75 degrees on a portrait phone (58 degree lens, 390 x 844)', () => {
    const limit = yawLimitDeg(stage, horizontalFovDeg(58, 390 / 844));
    expect(limit).toBeGreaterThan(74);
    expect(limit).toBeLessThan(77);
  });

  it('keeps the picture’s edge inside the half-arc: limit + hfov / 2 is the half-arc, for any lens', () => {
    for (const [vfov, aspect] of [
      [48, 1.6],
      [48, 16 / 9],
      [48, 21 / 9],
      [58, 0.46],
      [58, 0.75],
      [30, 1],
    ] as const) {
      const hfov = horizontalFovDeg(vfov, aspect);
      expect(yawLimitDeg(stage, hfov) + hfov / 2).toBeCloseTo(90, 9);
    }
  });

  it('is derived from the half-arc the stage declares, never more than 90 degrees', () => {
    expect(yawLimitDeg({ visibleHalfArcDeg: 60 }, 40)).toBe(40);
    expect(yawLimitDeg({ visibleHalfArcDeg: 120 }, 40)).toBe(MAX_VISIBLE_HALF_ARC_DEG - 20);
  });

  it('is zero for a lens wider than the arc it must stay inside', () => {
    expect(yawLimitDeg({ visibleHalfArcDeg: 90 }, 200)).toBe(0);
  });
});

describe('the soft edge', () => {
  const limit = 54.5;

  it('is 20 degrees by default', () => {
    expect(DEFAULT_SOFT_EDGE_DEG).toBe(20);
  });

  it('lets a turn through in full until the last 20 degrees', () => {
    for (const yaw of [0, 10, 20, 34.4]) expect(edgeScale(yaw, 1, limit, 20)).toBe(1);
    for (const yaw of [0, -10, -34.4]) expect(edgeScale(yaw, -1, limit, 20)).toBe(1);
  });

  it('falls smoothly to nothing at the limit: a smoothstep, no corner at either end', () => {
    const at = (room: number) => edgeScale(limit - room, 1, limit, 20);
    expect(at(20)).toBe(1);
    expect(at(10)).toBeCloseTo(0.5, 9);
    expect(at(0)).toBe(0);
    let last = 1;
    for (let room = 20; room >= 0; room -= 0.5) {
      const v = at(room);
      expect(v).toBeLessThanOrEqual(last + 1e-12);
      last = v;
    }
    // No corner: the slope at both ends of the zone is zero.
    expect(at(19.9)).toBeGreaterThan(0.9999);
    expect(at(0.1)).toBeLessThan(0.0001);
  });

  it('is the same toward either side', () => {
    for (const yaw of [40, 45, 50, 54]) expect(edgeScale(-yaw, -1, limit, 20)).toBeCloseTo(edgeScale(yaw, 1, limit, 20), 12);
  });

  it('never slows a turn away from the nearer limit, however close to it', () => {
    expect(edgeScale(54.4, -1, limit, 20)).toBe(1);
    expect(edgeScale(-54.4, 1, limit, 20)).toBe(1);
  });

  it('allows nothing beyond the limit, toward it', () => {
    expect(edgeScale(60, 1, limit, 20)).toBe(0);
    expect(edgeScale(-60, -1, limit, 20)).toBe(0);
    // And leaves a way back at once.
    expect(edgeScale(60, -1, limit, 20)).toBe(1);
  });

  it('does not slow a turn that is not a turn', () => {
    expect(edgeScale(54, 0, limit, 20)).toBe(1);
  });

  it('is a hard stop only if the stage asks for no soft edge', () => {
    expect(edgeScale(54, 1, limit, 0)).toBe(1);
    expect(edgeScale(54.6, 1, limit, 0)).toBe(0);
  });
});

describe('angles relative to the forward axis', () => {
  it('wraps to (-180, 180]', () => {
    expect(wrapDeg(190)).toBe(-170);
    expect(wrapDeg(-190)).toBe(170);
    expect(wrapDeg(180)).toBe(180);
    expect(wrapDeg(-180)).toBe(180);
    expect(wrapDeg(720 + 10)).toBe(10);
  });

  it('measures from the stage’s forward yaw, however many turns have been counted', () => {
    expect(yawRelative({ forwardYawDeg: 0 }, 370)).toBe(10);
    expect(yawRelative({ forwardYawDeg: 90 }, 100)).toBe(10);
    expect(yawRelative({ forwardYawDeg: 90 }, 80)).toBe(-10);
    expect(yawRelative({ forwardYawDeg: 170 }, -170)).toBe(20);
  });
});
