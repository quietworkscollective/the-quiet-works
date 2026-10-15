import { contains, nearestWalkable, type Bounds, type Vec2 } from '../../firstPerson/bounds.ts';
import type { GlideTarget } from '../../firstPerson/controller.ts';
import { CORRIDOR, LOBBY } from '../layout.ts';
import { PROPS, type PropId, type PropSpec } from '../props.ts';
import { placementOf } from '../world/props/placement.ts';
import { slotOf } from './viewpoints.ts';
import { boardPoint, horizontalFov, type Lens, type Point3 } from './framing.ts';
import type { ChamberId } from '@tqw/engine';

/**
 * Where a thing to touch is, and where the visitor stands to look at it (ADR 0004: a click on a
 * distant prop glides to a framing station for it, by the same rules as a door). Everything derives
 * from the contract (`PROPS`, `LOBBY.board`, `CHAMBER_SLOTS`), so when the props lane nudges a
 * prop along its wall its station and its label follow.
 */

const RAD = Math.PI / 180;

/** An object fixed to a wall: its centre, the way the wall faces into the room, and its face size. */
export interface Anchor {
  x: number;
  y: number;
  z: number;
  /** The unit direction the wall faces into the room, in x and z. */
  nx: number;
  nz: number;
  /** Width along the wall and height of what the visitor looks at. */
  width: number;
  height: number;
  /** How far it stands out from the wall. */
  depth: number;
}

/** The lobby's middle along z, which a lobby prop's `along` is measured from. */
export const LOBBY_MID_Z = (CORRIDOR.innerDoorZ + LOBBY.startZ) / 2;

export function propAnchor(spec: PropSpec): Anchor {
  const lobby = spec.bay === 'lobby';
  const half = lobby ? LOBBY.width / 2 : CORRIDOR.width / 2;
  const side = spec.side === 'right' ? 1 : -1;
  const [width, size1, depth] = spec.size;
  // Where the prop is built, not where the contract first put it: the props lane may move one up to
  // 0.5 m along its wall, or a little in height, to clear a door or a radiator (`placementOf`).
  const placed = placementOf(spec.id);
  return {
    x: side * (half - depth / 2),
    y: placed.height > 0 ? placed.height : size1 / 2,
    z: placed.z,
    nx: -side,
    nz: 0,
    width,
    height: size1,
    depth,
  };
}

export function propById(id: PropId): PropSpec {
  const spec = PROPS.find((p) => p.id === id);
  if (!spec) throw new Error(`No prop ${id}`);
  return spec;
}

/** The notice board, swivelled toward the entrance as the contract states. */
export function boardAnchor(): Anchor {
  const s = LOBBY.board.swivelDeg * RAD;
  const [x, y, z] = boardPoint(0, 0);
  return {
    x,
    y,
    z,
    nx: Math.cos(s),
    nz: Math.sin(s),
    width: LOBBY.board.width,
    height: LOBBY.board.height,
    depth: 0.087,
  };
}

/** How much of the picture an object should fill when the visitor stands at its station. */
const FILL = 0.6;
/** Nearest a station is to the object along the line of sight, so a small object is not stood on. */
const MIN_STANDOFF_M = 1.4;
/** Furthest, so a large object is not framed from across the building. */
const MAX_STANDOFF_M = 3.0;
/** The steepest the station's view looks down; the controller limits pitch to 25 degrees. */
const MAX_DOWN_DEG = 22;
const MAX_UP_DEG = 14;
/** Station views stay slightly oblique as a composition choice; the camera itself remains free. */
const STATION_YAW_DEG = 40;

/** The furthest off the axis a composed station looks, in degrees. */
export function stationYawCapDeg(_lens: Lens): number { return STATION_YAW_DEG; }

/**
 * Where to stand, and which way to look, to frame `anchor` on a screen with this lens (ADR 0004,
 * ADR 0004). Out from its middle, while leaving a little wall around it; the station is where the
 * line of sight is as near the wall's normal as the composition allows (`stationYawCapDeg`), back up the corridor from
 * the object. Far enough for it to fill about 60% of the picture (further for something low, so the
 * view looks down at it by no more than 22 degrees where the room allows), and inside the
 * walkable ground.
 */
export function stationFor(anchor: Anchor, lens: Lens, bounds: Bounds): Required<GlideTarget> {
  const tanH = Math.tan((horizontalFov(lens) * RAD) / 2);
  const tanV = Math.tan((lens.vfovDeg * RAD) / 2);
  const tall = anchor.height / (2 * FILL * tanV);
  const down = anchor.y < CORRIDOR.eyeHeight ? (CORRIDOR.eyeHeight - anchor.y) / Math.tan(MAX_DOWN_DEG * RAD) : 0;
  const cap = stationYawCapDeg(lens);
  const baseAngle = Math.atan2(anchor.nz, anchor.nx);
  const spotFor = (u: Vec2, d: number): Vec2 => ({ x: anchor.x + u.x * d, z: anchor.z + u.z * d });
  const yawFrom = (spot: Vec2): number => (Math.atan2(anchor.x - spot.x, -(anchor.z - spot.z)) * 180) / Math.PI;
  const pitchFrom = (spot: Vec2): number => {
    const run = Math.hypot(anchor.x - spot.x, anchor.z - spot.z);
    const aim = (Math.atan2(anchor.y - CORRIDOR.eyeHeight, run) * 180) / Math.PI;
    return Math.max(-MAX_DOWN_DEG - 3, Math.min(MAX_UP_DEG, aim));
  };
  const distances = (wanted: number): number[] => {
    const out: number[] = [];
    for (let d = wanted; d <= MAX_STANDOFF_M + 1e-9; d += 0.05) out.push(d);
    for (let d = wanted - 0.05; d >= MIN_STANDOFF_M - 1e-9; d -= 0.05) out.push(d);
    return out;
  };
  // Swing the line of sight away from the normal, toward the entrance (the corridor's forward is -z, so
  // a station is back up it from what it looks at), until the view is within the cap.
  for (let degrees = 0; degrees <= 85; degrees += 1) {
    for (const sign of [1, -1]) {
      const angle = baseAngle + sign * degrees * RAD;
      const u = { x: Math.cos(angle), z: Math.sin(angle) };
      if (u.z < anchor.nz - 1e-9) continue;
      // What the object shows of itself from this side: its width foreshortened by the angle.
      const across = Math.abs(anchor.nx * u.x + anchor.nz * u.z);
      const wide = (anchor.width * across) / (2 * FILL * tanH);
      const wanted = Math.min(MAX_STANDOFF_M, Math.max(MIN_STANDOFF_M, wide, tall, down));
      // The view along this line is the same wherever on it one stands.
      const yaw = yawFrom(spotFor(u, wanted));
      if (Math.abs(yaw) > cap + 1e-6) continue;
      // The wanted distance, then further, then (when the room runs out behind: a low thing near the
      // back of the lobby wants a long look down) nearer, which fills more of the picture and looks down more steeply.
      for (const d of distances(wanted)) {
        const spot = spotFor(u, d);
        if (contains(bounds, spot)) return { x: spot.x, z: spot.z, yawDeg: yaw, pitchDeg: pitchFrom(spot) };
      }
    }
  }
  // Nowhere on the ground gives a view within the cap: the nearest ground to the head-on station, looking at it.
  const d = Math.min(MAX_STANDOFF_M, Math.max(MIN_STANDOFF_M, anchor.width / (2 * FILL * tanH), tall, down));
  const spot = nearestWalkable(bounds, spotFor({ x: anchor.nx, z: anchor.nz }, d));
  return { x: spot.x, z: spot.z, yawDeg: yawFrom(spot), pitchDeg: pitchFrom(spot) };
}

/** The eight corners of a wall-mounted prop's box, for a ring around it. */
export function boxCorners(anchor: Anchor): Point3[] {
  const points: Point3[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        points.push([
          anchor.x + (sx * anchor.depth) / 2,
          anchor.y + (sy * anchor.height) / 2,
          anchor.z + (sz * anchor.width) / 2,
        ]);
      }
    }
  }
  return points;
}

/** The four corners of the board's frame, for a ring around it. */
export { boardCorners } from './framing.ts';

/** A chamber door's leaf: its four corners on the wall it is set in. */
export function doorCorners(id: ChamberId, height: number, width: number): Point3[] {
  const slot = slotOf(id);
  const x = (slot.side === 'right' ? 1 : -1) * (CORRIDOR.width / 2 - 0.02);
  return [
    [x, 0, slot.z - width / 2],
    [x, 0, slot.z + width / 2],
    [x, height, slot.z + width / 2],
    [x, height, slot.z - width / 2],
  ];
}
