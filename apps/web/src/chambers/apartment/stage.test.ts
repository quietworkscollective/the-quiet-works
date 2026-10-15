import { describe, expect, it } from 'vitest';
import {
  APARTMENT_STAGE,
  STATIONS,
  applyTurn,
  limitsForViewport,
  turnGain,
  withinWalkableStage,
} from './stage.ts';

describe('The Apartment stage', () => {
  it('derives the yaw limit from the ninety-degree visible half-arc and the current viewport', () => {
    const desktop = limitsForViewport(1440, 900);
    const portrait = limitsForViewport(412, 915);
    expect(APARTMENT_STAGE.visibleHalfArcDeg).toBe(90);
    expect(APARTMENT_STAGE.visibleHalfArcDeg).toBeLessThanOrEqual(90);
    expect(desktop.yawLimitDeg + desktop.horizontalFovDeg / 2).toBeCloseTo(90, 6);
    expect(portrait.yawLimitDeg + portrait.horizontalFovDeg / 2).toBeCloseTo(90, 6);
    expect(desktop.yawLimitDeg).toBeGreaterThan(50);
    expect(desktop.yawLimitDeg).toBeLessThan(60);
    expect(portrait.yawLimitDeg).toBeGreaterThan(65);
    expect(portrait.yawLimitDeg).toBeLessThan(80);
  });

  it('eases outward turns through the last twenty degrees and never snaps beyond the stage', () => {
    const limit = limitsForViewport(1440, 900).yawLimitDeg;
    expect(turnGain(limit, limit)).toBe(0);
    expect(turnGain(limit - 20, limit)).toBe(1);
    expect(turnGain(limit - 10, limit)).toBeGreaterThan(0);
    expect(turnGain(limit - 10, limit)).toBeLessThan(1);
    expect(applyTurn(limit - 1, 25, limit)).toBeLessThanOrEqual(limit);
    expect(applyTurn(-limit + 1, -25, limit)).toBeGreaterThanOrEqual(-limit);
  });

  it('keeps every station inside its unique walkable apartment footprint', () => {
    expect(APARTMENT_STAGE.width).toBe(6.2);
    expect(APARTMENT_STAGE.depth).toBe(5.4);
    expect(APARTMENT_STAGE.height).toBe(2.65);
    expect(APARTMENT_STAGE.walkable.length).toBeGreaterThanOrEqual(4);
    for (const station of STATIONS) {
      expect(withinWalkableStage(station.x, station.z), station.id).toBe(true);
    }
    expect(withinWalkableStage(-3.2, 2)).toBe(false);
    expect(withinWalkableStage(3.2, 2)).toBe(false);
  });
});
