import { needleDown, NEEDLE_TRAVEL_S, type NeedleState } from '../../../../audio/music/needle.ts';
import { clamp01, smoothstep, type Vec3 } from '../../math.ts';

/**
 * What the gramophone does, apart from what it looks like (the props' pattern): its named moving
 * parts, where each pivots, and how they sit for a given needle and platter. Nothing here reads the
 * geometry or draws a frame; the poses are pure functions of numbers, so a test can ask for any of
 * them, and a real model's parts could take their place.
 *
 * Prop-local frame as in `placement.ts`: +x along the wall to the visitor's right, +y up, +z out of
 * the wall. All lengths in metres.
 */

/** Where the turntable's spindle is, on the cabinet's top. */
export const PLATTER = { centre: [-0.02, 0.955, 0.27] as Vec3, radius: 0.127, felt: 0.135 } as const;

/** The tonearm's pivot post, at the back right of the cabinet, and how long the arm is from it. */
export const ARM = {
  pivot: [0.165, 0.995, 0.12] as Vec3,
  /** Pivot to needle, on the horizontal. */
  length: 0.27,
  /** The needle in the outer groove: the arm has swung this far from its rest (degrees). */
  swingDeg: 26.1,
  /** How far the head is raised while it travels, and while it waits on its rest (metres at the head). */
  travelLift: 0.022,
  restLift: 0.012,
} as const;

/** The arm's rest: a brass post under the tube with an ivory cap, where the hand finds the arm. */
export const REST_AT: Vec3 = [0.17, 0.988, 0.33];

/** The moving parts, each with the point it turns about. The arm has two: its swing, and its lift. */
export const PARTS = [
  { name: 'platter', pivot: [PLATTER.centre[0], PLATTER.centre[1], PLATTER.centre[2]] as Vec3 },
  { name: 'tonearm', pivot: ARM.pivot },
] as const;

export type PartName = (typeof PARTS)[number]['name'];

/** How long the arm takes between its rest and the groove, in either direction (seconds). */
export const ARM_TRAVEL_S = NEEDLE_TRAVEL_S;

/** The platter's turn: 40 turns a minute, calm enough to read as turning at 15 frames a second. */
export const PLATTER_RAD_PER_S = (40 / 60) * 2 * Math.PI;
/** How quickly the platter reaches its speed and runs down, as a time constant (seconds). */
export const PLATTER_INERTIA_S = 0.55;

/** The arm's journey, 0 on its rest and 1 in the groove, toward where the needle is. */
export const armTarget = (needle: NeedleState): 0 | 1 => (needleDown(needle) ? 1 : 0);

/** One step of the arm's journey toward its target: constant speed, `ARM_TRAVEL_S` end to end. */
export function armStep(arm: number, target: 0 | 1, dt: number): number {
  const step = dt / ARM_TRAVEL_S;
  return target > arm ? Math.min(target, arm + step) : Math.max(target, arm - step);
}

export interface ArmPose {
  /** Swing about the pivot's vertical axis, radians (zero on the rest, negative toward the record). */
  yaw: number;
  /**
   * Raising of the head about the horizontal axis, radians, from the authored pose (the head on its
   * rest, `restLift` above the record): positive raises it to travel, negative sets it in the groove.
   */
  lift: number;
}

const swing = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Where the arm is for a journey `a` in 0..1. The swing eases in and out; the head waits raised on
 * its rest, rises a little more as the arm leaves it, and comes down onto the groove at the end.
 * Exactly the authored pose (the arm on its rest: no yaw, no lift) at 0.
 */
export function armPose(a: number): ArmPose {
  const t = clamp01(a);
  // Written as a subtraction so that the arm on its rest is +0, not -0.
  const yaw = 0 - swing(ARM.swingDeg) * smoothstep(0.1, 0.9, t);
  // Head height above the groove: on the rest, raised; travelling, raised more; in the groove, none.
  const height = (ARM.restLift + (ARM.travelLift - ARM.restLift) * smoothstep(0, 0.15, t)) * (1 - smoothstep(0.78, 1, t));
  return { yaw, lift: Math.asin(Math.max(-1, Math.min(1, (height - ARM.restLift) / ARM.length))) };
}

/** The platter's rotation (radians about y), its speed and whether it is still turning, after `dt`. */
export interface PlatterState {
  angle: number;
  /** Radians a second. */
  speed: number;
}

export const PLATTER_REST: PlatterState = { angle: 0, speed: 0 };

/**
 * Advance the platter by `dt`: it spins up toward its speed while the needle is down and runs down
 * toward stillness when it is not, with the inertia of a heavy disc. Under reduced motion it does not
 * turn at all, whatever the needle does: the sound carries the record.
 */
export function platterStep(state: PlatterState, turning: boolean, dt: number, reducedMotion: boolean): PlatterState {
  if (reducedMotion) return PLATTER_REST;
  const target = turning ? PLATTER_RAD_PER_S : 0;
  const k = 1 - Math.exp(-dt / PLATTER_INERTIA_S);
  const speed = state.speed + (target - state.speed) * k;
  // A run-down that has all but stopped stops: no frames are drawn to turn a disc by a hair.
  const settled = !turning && speed < 0.04 ? 0 : speed;
  return { angle: (state.angle + settled * dt) % (2 * Math.PI), speed: settled };
}

/** Is the platter visibly moving: worth drawing frames for. */
export const platterMoving = (state: PlatterState): boolean => state.speed > 0;
