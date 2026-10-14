import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { applyPose, floorPoint, lensFor, lookScale, wrapYaw } from './three.ts';

const forwardOf = (camera: PerspectiveCamera): Vector3 => camera.getWorldDirection(new Vector3());

describe('applyPose', () => {
  it('looks down -z at yaw 0, at the eye height, with no roll', () => {
    const camera = new PerspectiveCamera();
    applyPose(camera, { x: 0.5, z: -4, yawDeg: 0, pitchDeg: 0 }, 1.62);
    expect(camera.position.toArray()).toEqual([0.5, 1.62, -4]);
    const f = forwardOf(camera);
    expect(f.x).toBeCloseTo(0, 9);
    expect(f.y).toBeCloseTo(0, 9);
    expect(f.z).toBeCloseTo(-1, 9);
    expect(camera.rotation.z).toBe(0);
  });

  it('turns right as yaw grows: +90 faces +x, -90 faces -x', () => {
    const camera = new PerspectiveCamera();
    applyPose(camera, { x: 0, z: 0, yawDeg: 90, pitchDeg: 0 }, 1.62);
    expect(forwardOf(camera).x).toBeCloseTo(1, 9);
    applyPose(camera, { x: 0, z: 0, yawDeg: -90, pitchDeg: 0 }, 1.62);
    expect(forwardOf(camera).x).toBeCloseTo(-1, 9);
    applyPose(camera, { x: 0, z: 0, yawDeg: 180, pitchDeg: 0 }, 1.62);
    expect(forwardOf(camera).z).toBeCloseTo(1, 9);
  });

  it('looks up for positive pitch and keeps the horizon level at any yaw', () => {
    const camera = new PerspectiveCamera();
    applyPose(camera, { x: 0, z: 0, yawDeg: 40, pitchDeg: 20 }, 1.62);
    expect(forwardOf(camera).y).toBeCloseTo(Math.sin((20 * Math.PI) / 180), 9);
    const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    expect(right.y).toBeCloseTo(0, 9);
  });
});

describe('lensFor', () => {
  it('uses the wide lens on a portrait screen', () => {
    expect(lensFor(1440, 900, { landscape: 48, portrait: 58 })).toBe(48);
    expect(lensFor(412, 915, { landscape: 48, portrait: 58 })).toBe(58);
  });
});

describe('lookScale', () => {
  it('lets a drag across the picture span the field of view, so the world follows the pointer', () => {
    const { yaw, pitch } = lookScale(1440, 900, 48);
    expect(pitch * 900).toBeCloseTo(48, 9);
    const horizontal = (2 * Math.atan(Math.tan((24 * Math.PI) / 180) * (1440 / 900)) * 180) / Math.PI;
    expect(yaw * 1440).toBeCloseTo(horizontal, 9);
  });
});

describe('floorPoint', () => {
  const camera = new PerspectiveCamera(48, 1440 / 900, 0.05, 90);
  applyPose(camera, { x: 0, z: 0, yawDeg: 0, pitchDeg: 0 }, 1.62);

  it('finds the floor at the bottom of the picture 1.62 / tan(24 degrees) ahead', () => {
    const p = floorPoint(camera, 720, 900, 1440, 900);
    expect(p).not.toBeNull();
    expect(p!.x).toBeCloseTo(0, 6);
    expect(p!.z).toBeCloseTo(-1.62 / Math.tan((24 * Math.PI) / 180), 6);
  });

  it('is null at and above the horizon', () => {
    expect(floorPoint(camera, 720, 450, 1440, 900)).toBeNull();
    expect(floorPoint(camera, 720, 100, 1440, 900)).toBeNull();
  });

  it('is to the right for a point right of centre', () => {
    const p = floorPoint(camera, 1200, 800, 1440, 900);
    expect(p!.x).toBeGreaterThan(0);
  });
});

describe('wrapYaw', () => {
  it('wraps to (-180, 180]', () => {
    expect(wrapYaw(0)).toBe(0);
    expect(wrapYaw(370)).toBe(10);
    expect(wrapYaw(-190)).toBe(170);
    expect(wrapYaw(180)).toBe(180);
    expect(wrapYaw(-180)).toBe(180);
  });
});
