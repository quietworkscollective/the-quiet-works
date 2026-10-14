import { Matrix4, Quaternion, Vector3 } from 'three';
import { GRAMOPHONE } from '../../../../audio/music/space.ts';
import type { Vec3 } from '../../math.ts';
import { ROUTE_HALF_WIDTH } from '../placement.ts';

/**
 * Where the gramophone stands. Like the twelve props it is placed on a wall in a frame of its own:
 * the origin on the wall plane at floor level, +x along the wall to the visitor's right as they
 * face it, +y up and +z out of the wall into the room. It is not one of the twelve (`PROPS`, the
 * lead's contract, names exactly twelve, and the verbs and labels of `CORRIDOR_PROPS` are keyed
 * by them), so it carries its own placement, behaviour and reading, built the same way.
 *
 * The same numbers place the sound: the horn's mouth in `audio/music/space.ts` is where this prop's
 * horn ends, so the music comes from the object the visitor can see.
 */
export interface GramophonePlacement {
  /** World x of the wall plane. */
  wallX: number;
  /** World z of the centre of the table along the wall. */
  z: number;
  /** Rotation about y that takes local +z to the wall's inward normal. */
  yaw: number;
  /** Local to world. */
  matrix: Matrix4;
  /** The wall's inward normal, in world space. */
  normal: Vec3;
}

/** The table's footprint in the local frame: along the wall, and out from it. */
export const TABLE = { width: 0.74, depth: 0.46, top: 0.74, standoff: 0.04 } as const;

export function gramophonePlacement(): GramophonePlacement {
  // The lobby's left wall: its inward normal is +x, so local +z is world +x.
  const yaw = Math.PI / 2;
  const matrix = new Matrix4().compose(
    new Vector3(GRAMOPHONE.wallX, 0, GRAMOPHONE.z),
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw),
    new Vector3(1, 1, 1),
  );
  return { wallX: GRAMOPHONE.wallX, z: GRAMOPHONE.z, yaw, matrix, normal: [1, 0, 0] };
}

/** A local point in world space. */
export function toWorld(placement: GramophonePlacement, local: Vec3): Vec3 {
  const v = new Vector3(local[0], local[1], local[2]).applyMatrix4(placement.matrix);
  return [v.x, v.y, v.z];
}

/** The furthest the prop reaches into the room, in world x: the horn's mouth rim and the table's edge. */
export function reachX(placement: GramophonePlacement, depth: number): number {
  return placement.wallX + depth;
}

/** The visitor's route is the corridor's central 1.5 m: nothing of the gramophone may enter it. */
export { ROUTE_HALF_WIDTH };
