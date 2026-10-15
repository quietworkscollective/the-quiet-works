import { describe, expect, it } from 'vitest';
import {
  EXCHANGE_STAGE,
  applyStageYaw,
  containsStagePoint,
  horizontalFov,
  limitStagePose,
  stageYawLimit,
  stationYawLimit,
  turnScaleAtLimit,
} from './stage.ts';

describe('The Exchange stage', () => {
  it('derives the yaw limit from the visible half-arc and current horizontal field of view', () => {
    expect(stageYawLimit(72)).toBeCloseTo(39);
    expect(stageYawLimit(29)).toBeCloseTo(60.5);
    expect(stageYawLimit(horizontalFov(64, 16 / 10))).toBeGreaterThan(0);
  });

  it('uses a tighter arc at the desk so downward views stay framed by the floor stage', () => {
    const desk = EXCHANGE_STAGE.stations.find(station => station.id === 'desk');
    if (!desk) throw new Error('Desk station is missing');
    expect(stationYawLimit(desk, 92)).toBeCloseTo(9);
    expect(stationYawLimit(desk, 36)).toBeCloseTo(37);
  });

  it('eases outward turns to zero through the final twenty degrees', () => {
    expect(turnScaleAtLimit(55, 55)).toBe(0);
    expect(turnScaleAtLimit(35, 55)).toBe(1);
    expect(turnScaleAtLimit(45, 55)).toBeGreaterThan(0);
    expect(turnScaleAtLimit(45, 55)).toBeLessThan(1);
  });

  it('clamps every authored turn inside the derived arc without a snap past the edge', () => {
    const limit = stageYawLimit(72);
    expect(applyStageYaw(0, 10, limit)).toBe(10);
    expect(applyStageYaw(limit - 1, 20, limit)).toBeLessThanOrEqual(limit);
    expect(applyStageYaw(-limit + 1, -20, limit)).toBeGreaterThanOrEqual(-limit);
    expect(applyStageYaw(limit, 90, limit)).toBe(limit);
    expect(applyStageYaw(limit, -12, limit)).toBe(limit - 12);
    expect(applyStageYaw(-limit, 12, limit)).toBe(-limit + 12);
  });

  it('reclamps the camera pose when a lens change narrows a station arc', () => {
    const station = EXCHANGE_STAGE.stations[0];
    const portraitFov = horizontalFov(76, 412 / 915);
    const landscapeFov = horizontalFov(48, 900 / 412);
    const portraitPose = limitStagePose({ x: station.x, z: station.z, yawDeg: 40, pitchDeg: station.pitchDeg }, portraitFov, station.visibleHalfArcDeg);
    const landscapePose = limitStagePose(portraitPose, landscapeFov, station.visibleHalfArcDeg);
    expect(Math.abs(portraitPose.yawDeg)).toBeGreaterThan(Math.abs(landscapePose.yawDeg));
    expect(landscapePose.yawDeg).toBeCloseTo(stationYawLimit(station, landscapeFov));
  });

  it('keeps all authored stations inside the walkable stage polygon', () => {
    for (const station of EXCHANGE_STAGE.stations) {
      expect(containsStagePoint(EXCHANGE_STAGE.walkable, station.x, station.z), station.id).toBe(true);
    }
  });

  it('declares the unique 4.2 by 9 by 12.6 metre stage and a half-arc no wider than ninety degrees', () => {
    expect(EXCHANGE_STAGE.width).toBe(4.2);
    expect(EXCHANGE_STAGE.depth).toBe(9);
    expect(EXCHANGE_STAGE.height).toBe(12.6);
    expect(EXCHANGE_STAGE.visibleHalfArcDeg).toBe(75);
    expect(EXCHANGE_STAGE.stations.every(station => (('visibleHalfArcDeg' in station ? station.visibleHalfArcDeg : undefined) ?? EXCHANGE_STAGE.visibleHalfArcDeg) <= 90)).toBe(true);
  });
});
