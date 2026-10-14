import { clamp01, smoothstep, type Vec3 } from '../math.ts';
import type { PropId } from '../../props.ts';

/**
 * The language every prop's motion is written in. A prop's `action` runs 0..1; each prop turns
 * that into the poses of its moving parts. The poses are pure functions of the motion, so a part
 * is exactly where the number says it is: the same value always gives the same pose, in either
 * direction, and a test can ask for any of them without drawing a frame.
 */

/** One moving part's displacement from rest, in the prop's own axes (+x along the wall, +y up, +z out of the wall). */
export interface PartPose {
  /** Translation, metres. */
  move?: Vec3;
  /** Rotation about the part's pivot. */
  turn?: { axis: Vec3; angle: number };
  /** Uniform scale about the pivot (a drop appearing and vanishing). */
  scale?: number;
}

/** Poses by part name. A part not named is at rest. */
export type PoseSet = Record<string, PartPose>;

/**
 * Small ambient motions of the props' own (ADR 0004): each is a displacement in -1..1 that is 0 at
 * the start and end of its window, so a window opens and closes at rest.
 */
export interface AmbientDrive {
  /** The loose sleeve of the top team shirt, lifting in the lobby's draught. */
  sleeve: number;
  /** The luggage tag on the walking boots, swinging on its string. */
  tag: number;
}

export const NO_AMBIENT: AmbientDrive = { sleeve: 0, tag: 0 };

export const X: Vec3 = [1, 0, 0];
export const Y: Vec3 = [0, 1, 0];
export const Z: Vec3 = [0, 0, 1];

export const rad = (deg: number): number => (deg * Math.PI) / 180;

/** 0 before `a`, 1 after `b`, smooth between. */
export const ramp = (t: number, a: number, b: number): number => smoothstep(a, b, t);

/** Rise over [a, b], hold, fall over [c, d]: 0 outside, 1 on the plateau. */
export function plateau(t: number, a: number, b: number, c: number, d: number): number {
  return ramp(t, a, b) * (1 - ramp(t, c, d));
}

/** Ease-out of strength `k`: fast at first, then settling (a wheel spinning down). */
export const easeOut = (t: number, k: number): number => 1 - Math.pow(1 - clamp01(t), k);

/** A displacement of an angle about an axis, skipped when it is exactly zero so rest stays exactly rest. */
export function turned(axis: Vec3, angle: number): PartPose {
  return angle === 0 ? {} : { turn: { axis, angle } };
}

export function moved(x: number, y: number, z: number): PartPose {
  return x === 0 && y === 0 && z === 0 ? {} : { move: [x, y, z] };
}

/** Both a move and a turn. */
export function both(move: Vec3, axis: Vec3, angle: number): PartPose {
  const pose: PartPose = {};
  if (move[0] !== 0 || move[1] !== 0 || move[2] !== 0) pose.move = move;
  if (angle !== 0) pose.turn = { axis, angle };
  return pose;
}

/** The props whose action ends open and stays open until `action` returns to 0. */
export const HOLDS_OPEN: ReadonlySet<PropId> = new Set<PropId>(['trophy-cabinet', 'team-photo', 'repair-kit', 'recipe-drawer']);
