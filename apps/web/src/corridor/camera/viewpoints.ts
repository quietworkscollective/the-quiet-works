import type { ChamberId } from '@tqw/engine';
import type { Bounds, Rect, Vec2 } from '../../firstPerson/bounds.ts';
import type { GlideTarget, Pose } from '../../firstPerson/controller.ts';
import type { Polygon } from '../../firstPerson/polygon.ts';
import { SPINE_TIMING } from '../../timing.ts';
import { DOOR_GRAMMAR } from '../doorKit.ts';
import { CHAMBER_SLOTS, CORRIDOR, LOBBY, START_VIEW, WALK_LIMITS, type DoorSlot } from '../layout.ts';

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

/** The first landing frame, kept with the camera poses so layout.ts remains a shared contract. */
export const HERO_VIEW = {
  desktop: { x: 0, z: 9.8, yawDeg: 0, pitchDeg: 0 },
  portrait: { x: 0, z: 9.8, yawDeg: 0, pitchDeg: 0 },
} as const;

/**
 * The walkable outline: the lobby, corridor and opening between them as one polygon. `corridorBounds()`
 * is the identical ground as rectangles, for the code that wants rectangles; a test holds the two together.
 */
export function corridorWalkable(): Polygon {
  const lobbyHalf = LOBBY.width / 2 - CORRIDOR.wallMargin;
  const corridorHalf = CORRIDOR.width / 2 - CORRIDOR.wallMargin;
  const mouthZ = CORRIDOR.innerDoorZ + CORRIDOR.wallMargin;
  return [
    { x: -lobbyHalf, z: WALK_LIMITS.maxZ },
    { x: lobbyHalf, z: WALK_LIMITS.maxZ },
    { x: lobbyHalf, z: mouthZ },
    { x: corridorHalf, z: mouthZ },
    { x: corridorHalf, z: WALK_LIMITS.minZ },
    { x: -corridorHalf, z: WALK_LIMITS.minZ },
    { x: -corridorHalf, z: mouthZ },
    { x: -lobbyHalf, z: mouthZ },
  ];
}

/** The way through the inner doors, for glides whose straight line would cut the lobby corner. */
export const GATES: readonly Vec2[] = [{ x: 0, z: CORRIDOR.innerDoorZ + 1.5 * CORRIDOR.wallMargin }];

export const SOFT_STOP = { x: 0.3, z: CORRIDOR.softStopM } as const;

/**
 * The first frame of the landing, and where free walking begins (ADR 0004: the starting view).
 * Both come from `layout.ts` and differ by screen: a portrait phone is back at the end of the
 * lobby and straighter, because its picture is narrow and the board and corridor must both fit.
 * The position is chosen from the screen's shape each frame, so turning the device is followed.
 */
export function landingPose(portrait: boolean): Pose {
  return { ...(portrait ? HERO_VIEW.portrait : HERO_VIEW.desktop) };
}

export function handoverPose(portrait: boolean): Pose {
  return { ...(portrait ? START_VIEW.portrait : START_VIEW.desktop) };
}

/** The landscape poses, for places that have no screen to ask (the initial camera, tests). */
export const LANDING_POSE: Pose = landingPose(false);
export const HANDOVER_POSE: Pose = handoverPose(false);

export function slotOf(id: ChamberId): DoorSlot {
  const slot = CHAMBER_SLOTS.find((s) => s.chamber === id);
  if (!slot) throw new Error(`No door slot for ${id}`);
  return slot;
}

/** +1 for a door in the right wall, -1 for the left. */
export const sideOf = (slot: DoorSlot): 1 | -1 => (slot.side === 'right' ? 1 : -1);

/**
 * A selected door keeps the live corridor framing: 1.4 m away and square to its wall.
 * Free look and the approved starting poses are independent of this focused view.
 */
export const DOOR_VIEW_YAW_DEG = 90;

const RAD = Math.PI / 180;

/**
 * The view of a door at selection: `focusDistanceM` from the middle of the door (so the handle and
 * plaque fill the picture as they always have), standing so the door is
 * `DOOR_VIEW_YAW_DEG` off the axis, tilted to take in the handle and plaque (the shared door grammar
 * puts them at 1.0 m and 1.55 m). The line of sight runs to the middle of the door, so the walk
 * through it (see `doorwayDirection`) continues the line the visitor is looking along.
 */
export function doorFrame(id: ChamberId): Required<GlideTarget> {
  const slot = slotOf(id);
  const side = sideOf(slot);
  const interest = (DOOR_GRAMMAR.handleCentreY + DOOR_GRAMMAR.plaqueCentreY) / 2;
  const distance = SPINE_TIMING.focusDistanceM;
  const pitch = -Math.atan((CORRIDOR.eyeHeight - interest) / distance) / RAD;
  return {
    x: side * (CORRIDOR.width / 2 - distance * Math.sin(DOOR_VIEW_YAW_DEG * RAD)),
    z: slot.z + distance * Math.cos(DOOR_VIEW_YAW_DEG * RAD),
    yawDeg: side * DOOR_VIEW_YAW_DEG,
    pitchDeg: pitch,
  };
}

/** The direction one walks through a door: along the line of sight from its frame to its middle. */
export function doorwayDirection(id: ChamberId): Vec2 {
  const slot = slotOf(id);
  const frame = doorFrame(id);
  const dx = sideOf(slot) * (CORRIDOR.width / 2) - frame.x;
  const dz = slot.z - frame.z;
  const length = Math.hypot(dx, dz);
  return { x: dx / length, z: dz / length };
}

/**
 * How far the walk through a door goes along `doorwayDirection`: to the door, then on past the plane
 * of its wall by `entryAdvanceM - focusDistanceM` (0.2 m, as the straight-in walk went), which
 * along an oblique line is longer. The visitor ends in the doorway at the same place as ever.
 */
export function doorwayAdvanceM(id: ChamberId): number {
  const past = SPINE_TIMING.entryAdvanceM - SPINE_TIMING.focusDistanceM;
  return SPINE_TIMING.focusDistanceM + past / Math.abs(doorwayDirection(id).x);
}

/** Named viewpoints for reduced motion, in corridor order: the hand-over, then each door. */
export function viewpointOrder(): readonly (ChamberId | null)[] {
  return [null, ...CHAMBER_SLOTS.flatMap((slot) => (slot.chamber ? [slot.chamber] : []))];
}
