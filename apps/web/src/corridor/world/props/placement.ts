import { Matrix4, Quaternion, Vector3 } from 'three';
import { bayCentreZ, CORRIDOR, LOBBY } from '../../layout.ts';
import { PROPS, type PropId, type PropSpec } from '../../props.ts';
import type { Vec3 } from '../math.ts';

/**
 * Where each prop stands. The contract (`PROPS`) gives a bay, a side, a distance `along` the wall
 * and a centre height; the props lane may move a prop by up to 0.5 m after checking real frames
 * (ADR 0004). Every move is listed here with its reason, so the contract and the built object
 * can be compared at a glance.
 *
 * Prop-local frame: the origin is on the wall plane at floor level; +x runs along the wall to the
 * visitor's right as they face it, +y is up and +z points out of the wall into the room. Heights
 * are therefore absolute (metres above the floor).
 */

/** Wall surfaces the props are fixed to, as depth out of the wall plane (see world/architecture/run.ts). */
export const WALL = {
  /** Oak panelling between the skirting and the dado cap. */
  panel: 0.03,
  skirting: 0.036,
  /** The dado cap rail stands this far off the wall, between `dado - 0.07` and `dado`. */
  capRail: 0.05,
  dado: CORRIDOR.dado,
} as const;

/** The visitor's route is the central 1.5 m of the corridor: nothing of a prop may enter it. */
export const ROUTE_HALF_WIDTH = 0.75;

export interface Move {
  /** Metres added to the contract's `along`. */
  along?: number;
  /** Metres added to the contract's centre height. */
  height?: number;
  /** Why the prop is not at its contract anchor. */
  reason: string;
}

/**
 * Moves from the contract anchors. Seven are within the 0.5 m allowance; the bicycle wheel is not,
 * because its contract anchor lies inside the Tomorrow Engine's door opening (see `EXCEEDS`).
 */
export const MOVES: Partial<Record<PropId, Move>> = {
  'trophy-cabinet': { along: 0.5, reason: 'clear of the waiting bench, which ends at z = 5.7 m; the bench belongs to the world lane' },
  'team-shirts': { along: 0.5, reason: 'stays inside the cabinet it is stored in' },
  football: { height: 0.3, reason: 'its rack sits on the plaster above the dado cap, not astride it' },
  'cricket-bat': { along: 0.15, reason: 'a hand clear of the radiator end plate beside it' },
  'walking-boots': { along: -0.14, reason: 'between the radiator and the next door opening' },
  'repair-kit': { along: -0.2, reason: 'clear of the neighbouring door opening and under the sconce' },
  'work-glove': { along: 0.1, reason: 'clear of the Great Atrium door opening' },
  'recipe-drawer': { height: 0.2, reason: 'hung wholly above the dado cap, which would otherwise run through its lower third' },
  'bicycle-wheel': { along: 2.8, height: 0.1, reason: 'the contract anchor (z = -13.0 m, left) is inside the Tomorrow Engine door opening (-14.30 to -12.50 m); the wheel hangs over the radiator, under the sconce at z = -9.8 m' },
};

/** Props moved by more than the 0.5 m allowance. The lead should update `PROPS` to match. */
export const EXCEEDS: readonly PropId[] = ['bicycle-wheel'];

export function specOf(id: PropId): PropSpec {
  const spec = PROPS.find((p) => p.id === id);
  if (!spec) throw new RangeError(`unknown prop ${id}`);
  return spec;
}

export interface PropPlacement {
  id: PropId;
  side: 'left' | 'right';
  /** World z of the prop's centre along the wall. */
  z: number;
  /** World x of the wall plane the prop is fixed to. */
  wallX: number;
  /** Centre height above the floor (the contract's, plus any move). */
  height: number;
  /** Rotation about y that takes prop-local +z to the wall's inward normal. */
  yaw: number;
  /** Prop-local to world. */
  matrix: Matrix4;
  /** The wall's inward normal, in world space. */
  normal: Vec3;
}

/** The wall plane's x for a bay: the lobby is wider than the corridor. */
function wallXOf(spec: PropSpec): number {
  const half = spec.bay === 'lobby' ? LOBBY.width / 2 : CORRIDOR.width / 2;
  return spec.side === 'left' ? -half : half;
}

export function placementOf(id: PropId): PropPlacement {
  const spec = specOf(id);
  const move = MOVES[id];
  const centreZ = spec.bay === 'lobby' ? (CORRIDOR.innerDoorZ + LOBBY.startZ) / 2 : bayCentreZ(spec.bay);
  const z = centreZ + spec.along + (move?.along ?? 0);
  const height = spec.height + (move?.height ?? 0);
  const left = spec.side === 'left';
  const yaw = left ? Math.PI / 2 : -Math.PI / 2;
  const wallX = wallXOf(spec);
  const matrix = new Matrix4().compose(new Vector3(wallX, 0, z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw), new Vector3(1, 1, 1));
  return { id, side: spec.side, z, wallX, height, yaw, matrix, normal: left ? [1, 0, 0] : [-1, 0, 0] };
}

/** Every prop's placement, in contract order. */
export function allPlacements(): PropPlacement[] {
  return PROPS.map((p) => placementOf(p.id));
}

/** A prop-local point in world space. */
export function toWorld(placement: PropPlacement, local: Vec3): Vec3 {
  const v = new Vector3(local[0], local[1], local[2]).applyMatrix4(placement.matrix);
  return [v.x, v.y, v.z];
}
