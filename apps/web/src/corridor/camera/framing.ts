import { CORRIDOR, LOBBY } from '../layout.ts';
import { BOARD_HINGE_CLEARANCE_M } from '../boardGeometry.ts';
import { INNER_DOORS } from '../world/doorKit/lobbyDoors.ts';

/**
 * Where things land on screen, in plain geometry (no three.js): the starting view's acceptance
 * (ADR 0004, "Starting view": both the notice board and the corridor's inner opening in the first
 * frame, on a desktop and on a phone) is checked against these projections, and the cue overlay
 * places its labels with the same numbers the tests read.
 *
 * Conventions follow the controller: yaw 0 looks toward -z and grows clockwise seen from above, so
 * +90 faces +x; pitch is positive up. Screen coordinates are normalised: -1..1 across and up, 0 at
 * the middle of the picture.
 */
export interface View {
  x: number;
  z: number;
  yawDeg: number;
  pitchDeg: number;
}

/** A lens: vertical field of view in degrees, and the picture's width over its height. */
export interface Lens {
  vfovDeg: number;
  aspect: number;
}

export type Point3 = readonly [number, number, number];

export interface Extent {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const RAD = Math.PI / 180;

/** Horizontal field of view in degrees for a lens. */
export function horizontalFov(lens: Lens): number {
  return (2 * Math.atan(Math.tan((lens.vfovDeg * RAD) / 2) * lens.aspect)) / RAD;
}

/** Where `point` lands on screen from `view`, or null when it is behind the eye. */
export function project(view: View, lens: Lens, point: Point3, eyeHeight: number = CORRIDOR.eyeHeight): { x: number; y: number } | null {
  const yaw = view.yawDeg * RAD;
  const pitch = view.pitchDeg * RAD;
  const fx = Math.sin(yaw) * Math.cos(pitch);
  const fy = Math.sin(pitch);
  const fz = -Math.cos(yaw) * Math.cos(pitch);
  // Right is forward x up, which for a camera with no roll is (cos yaw, 0, sin yaw).
  const rx = Math.cos(yaw);
  const rz = Math.sin(yaw);
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  const dx = point[0] - view.x;
  const dy = point[1] - eyeHeight;
  const dz = point[2] - view.z;
  const depth = dx * fx + dy * fy + dz * fz;
  if (depth <= 0.01) return null;
  const tanV = Math.tan((lens.vfovDeg * RAD) / 2);
  return {
    x: (dx * rx + dz * rz) / (depth * tanV * lens.aspect),
    y: (dx * ux + dy * uy + dz * uz) / (depth * tanV),
  };
}

/** The screen box around a set of points, or null if any is behind the eye. */
export function extentOf(view: View, lens: Lens, points: readonly Point3[]): Extent | null {
  let box: Extent | null = null;
  for (const point of points) {
    const p = project(view, lens, point);
    if (!p) return null;
    box = box
      ? { minX: Math.min(box.minX, p.x), maxX: Math.max(box.maxX, p.x), minY: Math.min(box.minY, p.y), maxY: Math.max(box.maxY, p.y) }
      : { minX: p.x, maxX: p.x, minY: p.y, maxY: p.y };
  }
  return box;
}

/** How much of the box's width is inside the picture (1 when all of it, 0 when none). */
export function visibleWidth(box: Extent, margin = 0): number {
  const limit = 1 - margin;
  const width = box.maxX - box.minX;
  if (width <= 0) return Math.abs(box.minX) <= limit ? 1 : 0;
  return Math.max(0, Math.min(box.maxX, limit) - Math.max(box.minX, -limit)) / width;
}

/** The box lies wholly inside the picture, `margin` (a fraction of the half-width) to spare. */
export function inside(box: Extent, margin = 0): boolean {
  const limit = 1 - margin;
  return box.minX >= -limit && box.maxX <= limit && box.minY >= -limit && box.maxY <= limit;
}

/** Depth the board's face stands proud of the left wall, mid-frame: the frame and felt, in metres. */
const BOARD_FACE_DEPTH = 0.07;

/**
 * A point on the notice board, by `u` (to the visitor's right, which is -z on the left wall) and
 * `v` (up) from its centre. The board turns toward the entrance about its hinged edge; use the
 * same hinge offset as the world geometry so framing and touch targets land on the built board.
 */
export function boardPoint(u: number, v: number, swivelDeg: number = LOBBY.board.swivelDeg): Point3 {
  const s = swivelDeg * RAD;
  const halfWidth = LOBBY.board.width / 2;
  const originX = -LOBBY.width / 2 + BOARD_HINGE_CLEARANCE_M + halfWidth * Math.sin(s);
  return [
    originX + BOARD_FACE_DEPTH * Math.cos(s) + u * Math.sin(s),
    LOBBY.board.y + v,
    LOBBY.board.z + BOARD_FACE_DEPTH * Math.sin(s) - u * Math.cos(s),
  ];
}

/** The four corners of the board's frame. */
export function boardCorners(swivelDeg?: number): Point3[] {
  const hw = LOBBY.board.width / 2;
  const hh = LOBBY.board.height / 2;
  return [
    boardPoint(-hw, -hh, swivelDeg),
    boardPoint(hw, -hh, swivelDeg),
    boardPoint(hw, hh, swivelDeg),
    boardPoint(-hw, hh, swivelDeg),
  ];
}

/** The inner opening in the lobby's end wall, which frames the corridor: its four corners. */
export function openingCorners(): Point3[] {
  const hw = INNER_DOORS.width / 2;
  const z = CORRIDOR.innerDoorZ;
  return [
    [-hw, 0, z],
    [hw, 0, z],
    [hw, INNER_DOORS.height, z],
    [-hw, INNER_DOORS.height, z],
  ];
}

export interface Framing {
  board: Extent | null;
  opening: Extent | null;
}

/** Where the board and the corridor's opening land from `view`. */
export function framingOf(view: View, lens: Lens, swivelDeg?: number): Framing {
  return {
    board: extentOf(view, lens, boardCorners(swivelDeg)),
    opening: extentOf(view, lens, openingCorners()),
  };
}
