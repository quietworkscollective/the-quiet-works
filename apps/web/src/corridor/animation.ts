import type { ChamberId } from '@tqw/engine';

/**
 * Per-frame door animation, written by the camera/interaction lane and read in useFrame by the
 * world lane. Mutable on purpose: animation never goes through React state.
 */
export interface DoorMotion {
  /** 0 closed .. 1 swung fully open (SPINE_TIMING.swingDeg). */
  open: number;
  /** 0 at rest .. 1 turned (SPINE_TIMING.handleTurnDeg). */
  handle: number;
  /** A sealed door's rattle: 0 at rest; any value in (0, 1] is the rattle's phase. */
  rattle: number;
  /** 0 .. 1: hover or keyboard focus emphasis (plaque and handle catch a little more light). */
  attention: number;
}

export type CorridorAnimation = Record<ChamberId, DoorMotion>;

export function createCorridorAnimation(ids: readonly ChamberId[]): CorridorAnimation {
  return Object.fromEntries(ids.map((id) => [id, { open: 0, handle: 0, rattle: 0, attention: 0 }])) as CorridorAnimation;
}
