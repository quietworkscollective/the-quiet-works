import { describe, expect, it } from 'vitest';
import { PITCH_LIMIT_DEG, STATIONS, TURN_EASE_DEG, clampPitch, limitsForViewport, stageAdapter, turnGain, withinWalkableStage } from './stage.ts';

describe('Outline Room stage limits', () => {
  it('derives a narrower horizontal view for desktop and a wider turn for portrait', () => {
    const desktop = limitsForViewport(1440, 900);
    const portrait = limitsForViewport(393, 852);
    expect(desktop.horizontalFovDeg).toBeGreaterThan(70);
    expect(desktop.yawLimitDeg).toBeGreaterThan(50);
    expect(desktop.yawLimitDeg).toBeLessThan(55);
    expect(portrait.horizontalFovDeg).toBeGreaterThan(25);
    expect(portrait.yawLimitDeg).toBeGreaterThan(66.5);
    expect(portrait.yawLimitDeg).toBeLessThan(67.5);
    expect(desktop.yawLimitDeg + desktop.horizontalFovDeg / 2).toBeCloseTo(90, 6);
    expect(portrait.yawLimitDeg + portrait.horizontalFovDeg / 2).toBeCloseTo(90, 6);
  });

  it('eases every turn input to zero over the final twenty degrees without exceeding the limit', () => {
    const limit = limitsForViewport(1440, 900).yawLimitDeg;
    expect(turnGain(0, limit)).toBe(1);
    expect(turnGain(limit - TURN_EASE_DEG, limit)).toBe(1);
    expect(turnGain(limit - TURN_EASE_DEG / 2, limit)).toBeGreaterThan(0);
    expect(turnGain(limit, limit)).toBe(0);
    expect(turnGain(limit + 10, limit)).toBe(0);
  });

  it('clamps pitch to the authored vertical stage range', () => {
    expect(stageAdapter.clampPitch(-PITCH_LIMIT_DEG - 5)).toBe(-PITCH_LIMIT_DEG);
    expect(clampPitch(0)).toBe(0);
    expect(stageAdapter.clampPitch(PITCH_LIMIT_DEG + 5)).toBe(PITCH_LIMIT_DEG);
  });

  it('gives the threshold a modest oblique view and keeps the workbench in portrait framing', () => {
    const arrival = STATIONS.find((station) => station.id === 'arrival')!;
    expect(arrival.headingDeg).toBe(180);
    expect(arrival.pitchDeg).toBeGreaterThanOrEqual(-PITCH_LIMIT_DEG);
    expect(arrival.pitchDeg).toBeLessThan(-5);
    const portrait = stageAdapter.stationPosition(arrival, 393, 852);
    expect(portrait).toEqual({ x: 0.15, z: 0.3 });
    expect(withinWalkableStage(portrait.x, portrait.z)).toBe(true);
    expect(stageAdapter.stationPosition(arrival, 1440, 900)).toEqual({ x: 0, z: 0.3 });
  });

  it('keeps movement inside the authored walkable polygon and away from the apparatus', () => {
    expect(withinWalkableStage(0, 1.2)).toBe(true);
    expect(withinWalkableStage(2.25, 3.6)).toBe(true);
    expect(withinWalkableStage(0, 3.6)).toBe(false);
    expect(withinWalkableStage(3.2, 3.6)).toBe(false);
    expect(withinWalkableStage(0, 7)).toBe(false);
  });

  it('places every station inside the stage and refuses a step through the workbench', () => {
    for (const station of STATIONS) expect(withinWalkableStage(station.x, station.z), station.id).toBe(true);
    expect(stageAdapter.walk({ x: 0, z: 2.9 }, 180, 1)).toEqual({ x: 0, z: 2.9 });
    expect(stageAdapter.walk({ x: 0, z: 2.45 }, 0, 1).z).toBeCloseTo(2.23, 6);
  });

  it('keeps the rear inspection forward-facing from a clear side station', () => {
    const inspection = STATIONS.find((station) => station.id === 'rear')!;
    expect(inspection.x).toBeGreaterThan(1.5);
    expect(inspection.headingDeg).toBe(135);
    expect(withinWalkableStage(inspection.x, inspection.z)).toBe(true);
  });
});
