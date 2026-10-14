import type { ChamberId } from '@tqw/engine';
import type { Bounds, Rect, Vec2 } from '../../firstPerson/bounds.ts';
import type { GlideTarget, Pose } from '../../firstPerson/controller.ts';
import { SPINE_TIMING } from '../../timing.ts';
import { DOOR_GRAMMAR } from '../doorKit.ts';
import {
  CHAMBER_SLOTS,
  CORRIDOR,
  ENTRANCE_KEYS,
  HANDOVER,
  HANDOVER_PORTRAIT_TURN_DEG,
  LOBBY,
  WALK_LIMITS,
  type DoorSlot,
} from '../layout.ts';

/**
 * Where the visitor stands: the walkable ground, the hand-over, and the view of each door.
 * Everything derives from `layout.ts`, so moving a door moves its view with it.
 */

/** Vertical field of view (ADR 0001): 48 on desktop, 58 on a portrait screen. */
export const FOV = { landscape: 48, portrait: 58 } as const;

/**
 * The lobby (wide) and the corridor (narrow), overlapping a little at the inner doors so there
 * is somewhere to walk through. Wall margins are already taken off.
 */
export function corridorBounds(): Bounds {
  const lobbyHalf = LOBBY.width / 2 - CORRIDOR.wallMargin;
  const corridorHalf = CORRIDOR.width / 2 - CORRIDOR.wallMargin;
  const lobby: Rect = {
    minX: -lobbyHalf,
    maxX: lobbyHalf,
    minZ: CORRIDOR.innerDoorZ + CORRIDOR.wallMargin,
    maxZ: WALK_LIMITS.maxZ,
  };
  const hall: Rect = {
    minX: -corridorHalf,
    maxX: corridorHalf,
    minZ: WALK_LIMITS.minZ,
    maxZ: CORRIDOR.innerDoorZ + 2 * CORRIDOR.wallMargin,
  };
  return [lobby, hall];
}

/** The way through the inner doors, for glides whose straight line would cut the lobby corner. */
export const GATES: readonly Vec2[] = [{ x: 0, z: CORRIDOR.innerDoorZ + 1.5 * CORRIDOR.wallMargin }];

export const SOFT_STOP = { x: 0.3, z: CORRIDOR.softStopM } as const;

export const LANDING_POSE: Pose = {
  x: 0,
  z: ENTRANCE_KEYS[0]?.z ?? HANDOVER.z,
  yawDeg: 0,
  pitchDeg: 0,
};

export const HANDOVER_POSE: Pose = { x: HANDOVER.x, z: HANDOVER.z, yawDeg: HANDOVER.yawDeg, pitchDeg: 0 };

/**
 * Where free walking begins. Straight down the axis on a landscape screen; on a portrait screen
 * turned `HANDOVER_PORTRAIT_TURN_DEG` toward +x so the Office door is in the narrow lens. The
 * position is the same either way.
 */
export function handoverPose(portrait: boolean): Pose {
  return {
    x: HANDOVER.x,
    z: HANDOVER.z,
    yawDeg: HANDOVER.yawDeg + (portrait ? HANDOVER_PORTRAIT_TURN_DEG : 0),
    pitchDeg: 0,
  };
}

export function slotOf(id: ChamberId): DoorSlot {
  const slot = CHAMBER_SLOTS.find((s) => s.chamber === id);
  if (!slot) throw new Error(`No door slot for ${id}`);
  return slot;
}

/** +1 for a door in the right wall, -1 for the left. */
export const sideOf = (slot: DoorSlot): 1 | -1 => (slot.side === 'right' ? 1 : -1);

/**
 * The view of a door at selection: `focusDistanceM` from the wall, facing it, tilted to take
 * in the handle and plaque (the shared door grammar puts them at 1.0 m and 1.55 m).
 */
export function doorFrame(id: ChamberId): Required<GlideTarget> {
  const slot = slotOf(id);
  const side = sideOf(slot);
  const interest = (DOOR_GRAMMAR.handleCentreY + DOOR_GRAMMAR.plaqueCentreY) / 2;
  const pitch = (-Math.atan((CORRIDOR.eyeHeight - interest) / SPINE_TIMING.focusDistanceM) * 180) / Math.PI;
  return {
    x: side * (CORRIDOR.width / 2 - SPINE_TIMING.focusDistanceM),
    z: slot.z,
    yawDeg: side * 90,
    pitchDeg: pitch,
  };
}

/** The direction one walks through a door: straight into its wall. */
export function doorwayDirection(id: ChamberId): Vec2 {
  return { x: sideOf(slotOf(id)), z: 0 };
}

/** Named viewpoints for reduced motion, in corridor order: the hand-over, then each door. */
export function viewpointOrder(): readonly (ChamberId | null)[] {
  return [null, ...CHAMBER_SLOTS.flatMap((slot) => (slot.chamber ? [slot.chamber] : []))];
}
