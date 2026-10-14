import { CHAMBERS } from '@tqw/engine';
import { describe, expect, it } from 'vitest';
import { contains } from '../../firstPerson/bounds.ts';
import { SPINE_TIMING } from '../../timing.ts';
import { CHAMBER_SLOTS, CORRIDOR, HANDOVER, HANDOVER_PORTRAIT_TURN_DEG, LOBBY, WALK_LIMITS } from '../layout.ts';
import {
  corridorBounds,
  doorFrame,
  doorwayDirection,
  GATES,
  HANDOVER_POSE,
  handoverPose,
  LANDING_POSE,
  viewpointOrder,
} from './viewpoints.ts';

describe('corridor bounds', () => {
  const bounds = corridorBounds();

  it('is ±(width/2 - wall margin) in the corridor and wider in the lobby', () => {
    expect(contains(bounds, { x: 1.25, z: -5 })).toBe(true);
    expect(contains(bounds, { x: 1.26, z: -5 })).toBe(false);
    expect(contains(bounds, { x: 2.15, z: 4 })).toBe(true);
    expect(contains(bounds, { x: 2.16, z: 4 })).toBe(false);
    expect(CORRIDOR.width / 2 - CORRIDOR.wallMargin).toBe(1.25);
    expect(LOBBY.width / 2 - CORRIDOR.wallMargin).toBe(2.15);
  });

  it('runs along z from WALK_LIMITS.minZ to WALK_LIMITS.maxZ', () => {
    expect(contains(bounds, { x: 0, z: WALK_LIMITS.minZ })).toBe(true);
    expect(contains(bounds, { x: 0, z: WALK_LIMITS.minZ - 0.01 })).toBe(false);
    expect(contains(bounds, { x: 0, z: WALK_LIMITS.maxZ })).toBe(true);
    expect(contains(bounds, { x: 0, z: WALK_LIMITS.maxZ + 0.01 })).toBe(false);
  });

  it('lets the visitor walk back past the inner doors into the lobby', () => {
    for (let z = HANDOVER.z; z <= WALK_LIMITS.maxZ; z += 0.1) expect(contains(bounds, { x: 0, z })).toBe(true);
  });

  it('keeps a lobby visitor off the lobby end wall away from the opening', () => {
    expect(contains(bounds, { x: 2, z: CORRIDOR.innerDoorZ + 0.1 })).toBe(false);
    expect(contains(bounds, { x: 2, z: CORRIDOR.innerDoorZ + CORRIDOR.wallMargin })).toBe(true);
  });

  it('has a gate inside the walkable ground', () => {
    for (const gate of GATES) expect(contains(bounds, gate)).toBe(true);
  });

  it('contains the hand-over, the landing view and every door view', () => {
    expect(contains(bounds, HANDOVER_POSE)).toBe(true);
    expect(contains(bounds, LANDING_POSE)).toBe(true);
    for (const slot of CHAMBER_SLOTS) if (slot.chamber) expect(contains(bounds, doorFrame(slot.chamber))).toBe(true);
  });
});

describe('door frames', () => {
  it('stands 1.4 m from the wall, at the door, facing it', () => {
    for (const slot of CHAMBER_SLOTS) {
      if (!slot.chamber) continue;
      const frame = doorFrame(slot.chamber);
      const side = slot.side === 'right' ? 1 : -1;
      expect(frame.z).toBe(slot.z);
      expect(side * (CORRIDOR.width / 2) - frame.x).toBeCloseTo(side * SPINE_TIMING.focusDistanceM, 9);
      expect(frame.yawDeg).toBe(side * 90);
    }
  });

  it('tilts down enough to take in both the handle and the plaque, within the pitch limit', () => {
    const frame = doorFrame('certification-office');
    expect(frame.pitchDeg).toBeLessThan(-8);
    expect(frame.pitchDeg).toBeGreaterThan(-25);
    // Handle (1.0 m) and plaque (1.55 m) both inside the 48 degree lens at this pitch.
    const angleTo = (y: number) => (Math.atan((y - CORRIDOR.eyeHeight) / SPINE_TIMING.focusDistanceM) * 180) / Math.PI;
    for (const y of [1.0, 1.55]) expect(Math.abs(angleTo(y) - frame.pitchDeg)).toBeLessThan(24);
  });

  it('walks through the wall the door is in', () => {
    expect(doorwayDirection('certification-office')).toEqual({ x: 1, z: 0 });
    expect(doorwayDirection('apartment')).toEqual({ x: -1, z: 0 });
  });
});

describe('viewpoint order', () => {
  it('is the hand-over then the doors in corridor order, as the registry lists them', () => {
    expect(viewpointOrder()).toEqual([null, ...CHAMBERS.map((c) => c.id)]);
  });
});

describe('hand-over pose', () => {
  it('is the layout hand-over on a landscape screen', () => {
    expect(handoverPose(false)).toEqual({ x: HANDOVER.x, z: HANDOVER.z, yawDeg: HANDOVER.yawDeg, pitchDeg: 0 });
  });

  it('is turned HANDOVER_PORTRAIT_TURN_DEG toward +x on a portrait screen, in the same place', () => {
    const portrait = handoverPose(true);
    expect(portrait.yawDeg).toBe(HANDOVER.yawDeg + HANDOVER_PORTRAIT_TURN_DEG);
    expect(portrait.x).toBe(HANDOVER.x);
    expect(portrait.z).toBe(HANDOVER.z);
    expect(portrait.pitchDeg).toBe(0);
  });

  it('puts the Office door inside a portrait lens at the turned view, which the plain view does not', () => {
    // The Office door is 19 degrees right of the axis from the hand-over; a 58 degree portrait lens
    // on a 412 x 839 screen is about 28 degrees wide.
    const slot = CHAMBER_SLOTS.find((s) => s.chamber === 'certification-office')!;
    const bearing = (Math.atan2(CORRIDOR.width / 2 - HANDOVER.x, HANDOVER.z - slot.z) * 180) / Math.PI;
    const halfWidth = (Math.atan(Math.tan((29 * Math.PI) / 180) * (412 / 839)) * 180) / Math.PI;
    expect(Math.abs(bearing - handoverPose(false).yawDeg)).toBeGreaterThan(halfWidth);
    expect(Math.abs(bearing - handoverPose(true).yawDeg)).toBeLessThan(halfWidth);
  });
});
