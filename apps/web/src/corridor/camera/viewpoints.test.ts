import { CHAMBERS } from '@tqw/engine';
import { describe, expect, it } from 'vitest';
import { contains } from '../../firstPerson/bounds.ts';
import { SPINE_TIMING } from '../../timing.ts';
import { CHAMBER_SLOTS, CORRIDOR, LOBBY, START_VIEW, WALK_LIMITS } from '../layout.ts';
import {
  corridorBounds,
  DOOR_VIEW_YAW_DEG,
  doorFrame,
  doorwayAdvanceM,
  doorwayDirection,
  HERO_VIEW,
  GATES,
  HANDOVER_POSE,
  handoverPose,
  LANDING_POSE,
  landingPose,
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
    for (let z = START_VIEW.desktop.z; z <= WALK_LIMITS.maxZ; z += 0.1) expect(contains(bounds, { x: 0, z })).toBe(true);
  });

  it('keeps a lobby visitor off the lobby end wall away from the opening', () => {
    expect(contains(bounds, { x: 2, z: CORRIDOR.innerDoorZ + 0.1 })).toBe(false);
    expect(contains(bounds, { x: 2, z: CORRIDOR.innerDoorZ + CORRIDOR.wallMargin })).toBe(true);
  });

  it('has a gate inside the walkable ground', () => {
    for (const gate of GATES) expect(contains(bounds, gate)).toBe(true);
  });

  it('contains both starting views, both landing views and every door view', () => {
    for (const portrait of [false, true]) {
      expect(contains(bounds, handoverPose(portrait))).toBe(true);
      expect(contains(bounds, landingPose(portrait))).toBe(true);
    }
    expect(contains(bounds, HANDOVER_POSE)).toBe(true);
    expect(contains(bounds, LANDING_POSE)).toBe(true);
    for (const slot of CHAMBER_SLOTS) if (slot.chamber) expect(contains(bounds, doorFrame(slot.chamber))).toBe(true);
  });
});

describe('door frames', () => {
  it('stands 1.4 m from the middle of the door and faces its wall at 90 degrees', () => {
    for (const slot of CHAMBER_SLOTS) {
      if (!slot.chamber) continue;
      const frame = doorFrame(slot.chamber);
      const side = slot.side === 'right' ? 1 : -1;
      const across = side * (CORRIDOR.width / 2) - frame.x;
      expect(Math.hypot(across, frame.z - slot.z), slot.chamber).toBeCloseTo(SPINE_TIMING.focusDistanceM, 9);
      expect(frame.yawDeg).toBe(side * 90);
      // Keep the live straight-on view level with the door along the corridor.
      expect(frame.z).toBeCloseTo(slot.z, 9);
      const toDoor = (Math.atan2(across, frame.z - slot.z) * 180) / Math.PI;
      expect(Math.abs(toDoor)).toBeCloseTo(DOOR_VIEW_YAW_DEG, 6);
    }
  });

  it('tilts down enough to take in both the handle and the plaque, within the pitch limit', () => {
    const frame = doorFrame('certification-office');
    const slot = CHAMBER_SLOTS.find((s) => s.chamber === 'certification-office')!;
    expect(frame.pitchDeg).toBeLessThan(-5);
    expect(frame.pitchDeg).toBeGreaterThan(-25);
    // Handle (1.0 m) and plaque (1.55 m) both inside the 48 degree lens at this pitch, along the line of sight.
    const run = Math.hypot(CORRIDOR.width / 2 - frame.x, frame.z - slot.z);
    expect(run).toBeCloseTo(SPINE_TIMING.focusDistanceM, 9);
    const angleTo = (y: number) => (Math.atan((y - CORRIDOR.eyeHeight) / run) * 180) / Math.PI;
    for (const y of [1.0, 1.55]) expect(Math.abs(angleTo(y) - frame.pitchDeg)).toBeLessThan(24);
  });

  it('walks through the wall the door is in, along the line of sight to its middle', () => {
    for (const slot of CHAMBER_SLOTS) {
      if (!slot.chamber) continue;
      const side = slot.side === 'right' ? 1 : -1;
      const frame = doorFrame(slot.chamber);
      const direction = doorwayDirection(slot.chamber);
      expect(Math.hypot(direction.x, direction.z)).toBeCloseTo(1, 9);
      expect(Math.sign(direction.x)).toBe(side);
      // The heading of the walk is the heading of the view.
      expect((Math.atan2(direction.x, -direction.z) * 180) / Math.PI).toBeCloseTo(frame.yawDeg, 6);
      // It ends in the doorway, 0.2 m past the wall's plane, where the straight-in walk ended.
      const advance = doorwayAdvanceM(slot.chamber);
      expect(frame.x + direction.x * advance).toBeCloseTo(
        side * (CORRIDOR.width / 2 + SPINE_TIMING.entryAdvanceM - SPINE_TIMING.focusDistanceM),
        9,
      );
      // At about the pace it always had: the walk is no longer than 1.8 times the straight one.
      expect(advance).toBeLessThan(1.8 * SPINE_TIMING.entryAdvanceM);
      // And it goes through the door's own centre.
      const atWall = (side * (CORRIDOR.width / 2) - frame.x) / direction.x;
      expect(frame.z + direction.z * atWall).toBeCloseTo(slot.z, 9);
    }
  });
});

describe('viewpoint order', () => {
  it('is the hand-over then the doors in corridor order, as the registry lists them', () => {
    expect(viewpointOrder()).toEqual([null, ...CHAMBERS.map((c) => c.id)]);
  });
});

describe('the starting view and the landing view', () => {
  it('is the layout\u2019s starting view on a landscape screen, and the phone\u2019s on a portrait screen', () => {
    expect(handoverPose(false)).toEqual(START_VIEW.desktop);
    expect(handoverPose(true)).toEqual(START_VIEW.portrait);
  });

  it('gives each caller its own copy: moving one does not move the layout', () => {
    const pose = handoverPose(false);
    pose.z = 99;
    expect(handoverPose(false).z).toBe(START_VIEW.desktop.z);
    const landing = landingPose(true);
    landing.x = 99;
    expect(landingPose(true).x).toBe(HERO_VIEW.portrait.x);
  });

  it('starts further back than the old hand-over, in the lobby, and faces toward the board side', () => {
    for (const portrait of [false, true]) {
      const pose = handoverPose(portrait);
      expect(pose.z).toBeGreaterThan(CORRIDOR.innerDoorZ + 3);
      expect(pose.yawDeg).toBeLessThan(0);
      expect(pose.pitchDeg).toBeLessThanOrEqual(0);
    }
  });

  it('begins the landing at least as far back as free walking begins, so the walk-in only ever comes forward', () => {
    for (const portrait of [false, true]) {
      expect(landingPose(portrait).z).toBeGreaterThanOrEqual(handoverPose(portrait).z);
    }
  });

  it('has the lit Office door inside a landscape lens at the starting view', () => {
    // On a phone the Office door is outside the picture (the board and the corridor opening take
    // it); on a desktop the 71 degree lens holds it as well.
    const slot = CHAMBER_SLOTS.find((s) => s.chamber === 'certification-office')!;
    const start = handoverPose(false);
    const bearing = (Math.atan2(CORRIDOR.width / 2 - start.x, start.z - slot.z) * 180) / Math.PI;
    const halfWidth = (Math.atan(Math.tan((24 * Math.PI) / 180) * (16 / 10)) * 180) / Math.PI;
    expect(Math.abs(bearing - start.yawDeg)).toBeLessThan(halfWidth);
  });
});
