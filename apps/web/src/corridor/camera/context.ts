import type { ChamberId } from '@tqw/engine';
import { CHAMBER_SLOTS, CORRIDOR, LOBBY, WALK_LIMITS } from '../layout.ts';
import { PROPS } from '../props.ts';
import { INNER_DOORS } from '../world/doorKit/lobbyDoors.ts';
import { sameCueTarget, type CueTarget } from './cueText.ts';
import { CUE_TUNING, type CueTuning } from './cueTuning.ts';
import { project, type Lens, type Point3, type View } from './framing.ts';
import { boardAnchor, propAnchor } from './stations.ts';

/**
 * Which thing, if any, the visitor has "found": the one within reach, on screen, in the clear, and
 * nearest the centre of the view (founder direction and art consult 6). Pure geometry on the
 * contract's anchors, so the rule is tested without a browser and tuned in `cueTuning.ts` alone.
 */

const RAD = Math.PI / 180;

export interface Candidate {
  target: CueTarget;
  /** Where the thing is: the middle of what the visitor would look at. */
  at: Point3;
  /** A door or another large destination: found from further off. */
  large: boolean;
}

/** The height a chamber door is aimed at: between its handle and its plaque. */
const DOOR_AIM_Y = 1.3;

/** Everything the visitor can find: the chamber doors (blank doors offer nothing), the board and the props. */
export function candidates(tuning: CueTuning = CUE_TUNING): Candidate[] {
  const out: Candidate[] = [];
  for (const slot of CHAMBER_SLOTS) {
    if (!slot.chamber) continue;
    const x = (slot.side === 'right' ? 1 : -1) * (CORRIDOR.width / 2 - 0.05);
    out.push({ target: { kind: 'door', id: slot.chamber as ChamberId }, at: [x, DOOR_AIM_Y, slot.z], large: true });
  }
  const board = boardAnchor();
  out.push({ target: { kind: 'board' }, at: [board.x, board.y, board.z], large: true });
  for (const spec of PROPS) {
    const a = propAnchor(spec);
    out.push({
      target: { kind: 'prop', id: spec.id },
      at: [a.x, a.y, a.z],
      large: Math.max(spec.size[0], spec.size[1]) >= tuning.largeMinM,
    });
  }
  return out;
}

/** The angle between the line of sight and the direction to `point`, in degrees (0 straight ahead, 180 behind). */
export function gazeAngleDeg(view: View, point: Point3, eyeHeight: number = CORRIDOR.eyeHeight): number {
  const yaw = view.yawDeg * RAD;
  const pitch = view.pitchDeg * RAD;
  const fx = Math.sin(yaw) * Math.cos(pitch);
  const fy = Math.sin(pitch);
  const fz = -Math.cos(yaw) * Math.cos(pitch);
  const dx = point[0] - view.x;
  const dy = point[1] - eyeHeight;
  const dz = point[2] - view.z;
  const length = Math.hypot(dx, dy, dz);
  if (length === 0) return 0;
  const cos = (dx * fx + dy * fy + dz * fz) / length;
  return Math.acos(Math.max(-1, Math.min(1, cos))) / RAD;
}

/** How far the visitor stands from `point` along the floor, in metres. */
export const reachOf = (view: View, point: Point3): number => Math.hypot(point[0] - view.x, point[2] - view.z);

/** Slack on the building's walls, so an anchor on a wall's own face is inside it. */
const WALL_SLACK = 0.03;
const SAMPLE_STEP = 0.1;

/** True when the floor point (x, z) is inside the lobby or the corridor (the building's open volume). */
function inside(x: number, z: number): boolean {
  const lobby = Math.abs(x) <= LOBBY.width / 2 + WALL_SLACK && z >= CORRIDOR.innerDoorZ - WALL_SLACK && z <= LOBBY.startZ + WALL_SLACK;
  const corridor =
    Math.abs(x) <= CORRIDOR.width / 2 + WALL_SLACK && z <= CORRIDOR.innerDoorZ + WALL_SLACK && z >= WALK_LIMITS.minZ - CORRIDOR.bay * 8;
  return lobby || corridor;
}

/**
 * True when nothing in the building's walls is between the eye and `point`: the straight line stays
 * inside the lobby and the corridor, and goes from one to the other only through the inner opening.
 * Furniture, props and the open door leaves are not counted (they are not walls); the end wall is.
 */
export function unobstructed(view: View, point: Point3): boolean {
  const iz = CORRIDOR.innerDoorZ;
  // Across the end wall the line must pass through the inner opening.
  if ((view.z - iz) * (point[2] - iz) < 0) {
    const t = (iz - view.z) / (point[2] - view.z);
    const x = view.x + (point[0] - view.x) * t;
    if (Math.abs(x) > INNER_DOORS.width / 2) return false;
  }
  const length = reachOf(view, point);
  const steps = Math.max(1, Math.ceil(length / SAMPLE_STEP));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    if (!inside(view.x + (point[0] - view.x) * t, view.z + (point[2] - view.z) * t)) return false;
  }
  return true;
}

export interface Found {
  target: CueTarget;
  distanceM: number;
  gazeDeg: number;
  /** The line to it is blocked by a wall (it is still the nearest to the centre of view). */
  blocked: boolean;
}

export interface FindOptions {
  /** What was labelled a moment ago: held to the looser "leave" limits. */
  previous?: CueTarget | null;
  tuning?: CueTuning;
  /** When given, a thing must also project onto the picture (inside 98% of it). */
  lens?: Lens;
}

/**
 * The thing to label from `view`: among the candidates within reach (2.2 m, 3 m for doors and other
 * large destinations), on screen and within 25 degrees of the centre of view, the one nearest the
 * centre. The thing labelled a moment ago is held to the looser limits (2.7 m, 35 degrees) and is
 * kept unless something else is `switchGainDeg` closer to the centre, so a label does not flicker
 * between two neighbours or at the edge of reach. A thing behind a wall is reported `blocked`.
 */
export function find(view: View, list: readonly Candidate[], options: FindOptions = {}): Found | null {
  const tuning = options.tuning ?? CUE_TUNING;
  const previous = options.previous ?? null;
  let best: Found | null = null;
  let held: Found | null = null;
  for (const c of list) {
    const distanceM = reachOf(view, c.at);
    const gazeDeg = gazeAngleDeg(view, c.at);
    const isPrevious = previous !== null && sameCueTarget(previous, c.target);
    const reach = isPrevious ? (c.large ? tuning.leaveReachLargeM : tuning.leaveReachM) : c.large ? tuning.reachLargeM : tuning.reachM;
    const gaze = isPrevious ? tuning.leaveGazeDeg : tuning.gazeDeg;
    if (distanceM > reach || gazeDeg > gaze) continue;
    if (options.lens) {
      const at = project(view, options.lens, c.at);
      if (!at || Math.abs(at.x) > 0.98 || Math.abs(at.y) > 0.98) continue;
    }
    const found: Found = { target: c.target, distanceM, gazeDeg, blocked: !unobstructed(view, c.at) };
    if (isPrevious) held = found;
    if (!best || found.gazeDeg < best.gazeDeg) best = found;
  }
  if (held && best && !sameCueTarget(held.target, best.target) && best.gazeDeg > held.gazeDeg - tuning.switchGainDeg) {
    return held;
  }
  return best;
}
