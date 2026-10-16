import type { ChamberId } from '@tqw/engine';
import type { DoorCharacter, DoorSpec } from './doorKit.ts';

/**
 * Corridor geometry (ADR 0001, "Corridor art direction"). World units are metres. The camera
 * walks toward -z; +x is the visitor's right. y = 0 is the floor.
 *
 * The lobby runs from z = LOBBY.startZ back to the inner doors at CORRIDOR.innerDoorZ; the
 * corridor runs on from there in 3.6 m bays. Bay i spans z in [innerDoorZ - 3.6(i+1), innerDoorZ - 3.6i]
 * and its doors sit at the bay centre. Shared by the scene, the camera, the DOM door list order
 * and the e2e tests.
 */
export const CORRIDOR = {
  width: 3.2,
  height: 3.8,
  bay: 3.6,
  dado: 1.15,
  corniceDepth: 0.16,
  eyeHeight: 1.62,
  /** The inner doors between lobby and corridor. */
  innerDoorZ: 1,
  /** Walkable bays (about 25 m), including the Annex at bay 6; beyond them the corridor is perspective only. */
  walkableBays: 7,
  /** The visitor keeps this far from the walls. */
  wallMargin: 0.35,
  /** Walking slows to a stop over this distance before the far limit. */
  softStopM: 1.2,
  /** The corridor's geometry and blank doors continue to here, inside the fog. */
  farZ: -75,
  fog: { colour: '#4B3A27', near: 12, half: 28, far: 50 },
  sconce: { y: 2.25, spacing: 7.2, stagger: 3.6, kelvin: 2700, wallPool: 1.2, floorPool: 1.6 },
  ambientKelvin: 4300,
  colours: {
    plaster: '#77776B',
    oak: '#302B25',
    terrazzo: '#535954',
    ceiling: '#929083',
    brass: '#897044',
  },
} as const;

export const LOBBY = {
  width: 5,
  height: 4.2,
  /** Deepened (ADR 0004) so the starting view can pull back far enough to frame board and corridor. */
  startZ: 11,
  /**
   * The notice board on the lobby's left wall, centre 1.45 m high. It faces +x, swivelled
   * `swivelDeg` toward the entrance (+z) so it reads from the starting view.
   */
  board: { x: -2.47, y: 1.45, z: 3.2, width: 1.25, height: 0.85, frame: 0.035, felt: '#505247', swivelDeg: 15 },
  /** In-world lettering over the inner doors. */
  lettering: { y: 3.35, z: 1.05 },
} as const;

/** Camera z along the landing walk, keyed to scroll progress (ADR beat sheet). x = 0, y = eye height. */
export const ENTRANCE_KEYS: readonly { t: number; z: number }[] = [
  { t: 0, z: 5.2 },
  { t: 0.16, z: 5.0 },
  { t: 0.4, z: 3.5 },
  { t: 0.64, z: 2.0 },
  { t: 0.9, z: 0.2 },
  { t: 1, z: 0.2 },
];

/**
 * ADR 0004: free walking begins further back, with the notice board and the corridor both in view.
 * Candidates from art consult 5 (yaw 0 looks toward -z, negative yaw toward the left wall, negative
 * pitch looks down). The camera lane verifies them in real frames at 16:10 and 9:16, may adjust by
 * up to 0.5 m and 5 degrees, re-authors ENTRANCE_KEYS so the walk-in arrives here without a snap,
 * and then makes these the hand-over (replacing HANDOVER and the portrait turn).
 */
export const START_VIEW = {
  desktop: { x: 0, z: 7, yawDeg: -13, pitchDeg: -1 },
  portrait: { x: 0, z: 9.8, yawDeg: -10, pitchDeg: -1 },
} as const;

/** Landscape hand-over tuple retained for callers that use the shared starting pose. */
export const HANDOVER = {
  x: START_VIEW.desktop.x,
  z: START_VIEW.desktop.z,
  yawDeg: START_VIEW.desktop.yawDeg,
} as const;

/** The portrait starting heading, exposed for shared camera test helpers. */
export const HANDOVER_PORTRAIT_TURN_DEG = START_VIEW.portrait.yawDeg;

/** The Annex (ADR 0004): commissioned rooms share bay six beneath its small enamel sign. */
export const ANNEX = { bay: 6, sign: { y: 2.75 } } as const;

export function bayCentreZ(bay: number): number {
  return CORRIDOR.innerDoorZ - CORRIDOR.bay * (bay + 0.5);
}

/** The walkable z range: from the lobby's start to just short of the last walkable bay's end. */
export const WALK_LIMITS = {
  maxZ: LOBBY.startZ - 1.2,
  minZ: CORRIDOR.innerDoorZ - CORRIDOR.bay * CORRIDOR.walkableBays + 1.6,
} as const;

export interface DoorSlot {
  /** Stable key for React and tests. */
  key: string;
  chamber: ChamberId | null;
  side: 'left' | 'right';
  /** Centre of the opening along the corridor. */
  z: number;
}

/**
 * Chamber doors in corridor order. The Office is in the second bay on the right so the light
 * leads to it first; sides agree with the chamber registry.
 */
export const CHAMBER_SLOTS: readonly DoorSlot[] = [
  { key: 'certification-office', chamber: 'certification-office', side: 'right', z: bayCentreZ(1) },
  { key: 'apartment', chamber: 'apartment', side: 'left', z: bayCentreZ(2) },
  { key: 'tomorrow-engine', chamber: 'tomorrow-engine', side: 'left', z: bayCentreZ(3.5) },
  { key: 'great-atrium', chamber: 'great-atrium', side: 'right', z: bayCentreZ(5) },
  { key: 'exchange', chamber: 'exchange', side: 'right', z: bayCentreZ(ANNEX.bay) },
  { key: 'outline-room', chamber: 'outline-room', side: 'left', z: bayCentreZ(ANNEX.bay) },
];

/**
 * Blank doors: architecture, not destinations. Not focusable, no plaque text, no handle light.
 * Within the walkable bays they are authored; past them `blankDoorAt` repeats a varied pattern
 * into the fog.
 */
export interface BlankDoor extends DoorSlot {
  spec: DoorSpec;
}

const blank = (spec: Omit<DoorSpec, 'plaque' | 'topper'> & Partial<Pick<DoorSpec, 'topper'>>): DoorSpec => ({
  topper: 'transom',
  plaque: null,
  ...spec,
});

const ch = (c: DoorCharacter): DoorCharacter => c;

/** Nine distinct blank doors (art consult 5, ADR 0004); they stay non-interactive. */
export const BLANK_DOORS: readonly BlankDoor[] = [
  { key: 'blank-0L', chamber: null, side: 'left', z: bayCentreZ(0), spec: blank({ family: 'panelled-timber', width: 1.0, height: 2.5, material: { primary: '#713E43', secondary: '#CCC2AD', metal: CORRIDOR.colours.brass, glazing: 'none' }, handle: 'knob', character: ch({ note: 'Heavy panelled door with an unusually neat replacement bottom rail.', roughness: 0.6, frame: 'retained-oak', lock: 'rim-lock', history: 'repaired', exposure: 0.04, marks: [{ kind: 'stencil', text: 'KEEP CLEAR' }], motif: 'inset-panels' }) }) },
  { key: 'blank-0R', chamber: null, side: 'right', z: bayCentreZ(0), spec: blank({ family: 'glazed-office', width: 0.88, height: 2.3, material: { primary: '#566D83', secondary: CORRIDOR.colours.oak, metal: CORRIDOR.colours.brass, glazing: 'reeded' }, handle: 'knob', character: ch({ note: 'Narrow glazed door with privacy glass in two subtly different textures.', roughness: 0.5, frame: 'painted-timber', lock: 'knob', history: 'repainted', exposure: 0.03, marks: [], motif: 'gridded-glazing' }) }) },
  { key: 'blank-1L', chamber: null, side: 'left', z: bayCentreZ(1), spec: blank({ family: 'steel-insertion', width: 1.1, height: 2.6, surround: { width: 1.4, height: 2.9 }, material: { primary: '#747552', secondary: '#DDD5C8', metal: '#6F6A60', glazing: 'porthole' }, handle: 'push-plate', character: ch({ note: 'Steel leaf with a circular inspection cover painted shut.', roughness: 0.7, frame: 'steel-insertion', lock: 'sliding-bolt', history: 'neglected', exposure: 0.1, marks: [{ kind: 'decal-residue' }, { kind: 'stripe' }], motif: 'round-aperture' }) }) },
  { key: 'blank-2R', chamber: null, side: 'right', z: bayCentreZ(2), spec: blank({ family: 'panelled-timber', width: 0.95, height: 2.7, material: { primary: '#C8C5B7', secondary: '#414848', metal: CORRIDOR.colours.brass, glazing: 'none' }, handle: 'lever', character: ch({ note: 'A tall door whose removed fittings survive as carefully filled outlines.', roughness: 0.55, frame: 'painted-timber', lock: 'lever', history: 'repainted', exposure: 0.02, marks: [], motif: 'vertical-ribs' }) }) },
  { key: 'blank-3R', chamber: null, side: 'right', z: bayCentreZ(3), spec: blank({ family: 'ceremonial-double', width: 1.7, height: 3.0, material: { primary: '#754F66', secondary: '#776342', metal: '#776342', glazing: 'none' }, handle: 'ring-pull', character: ch({ note: 'Broad timber panels with one small carved geometric border.', roughness: 0.6, frame: 'retained-oak', lock: 'thumb-latch', history: 'polished', exposure: 0.03, marks: [{ kind: 'carving' }], motif: 'curved-joinery' }) }) },
  { key: 'blank-4R', chamber: null, side: 'right', z: bayCentreZ(4), spec: blank({ family: 'steel-insertion', width: 0.85, height: 2.15, surround: { width: 1.2, height: 2.6 }, material: { primary: '#465F83', secondary: '#9DABA8', metal: '#9DABA8', glazing: 'none' }, handle: 'push-plate', character: ch({ note: 'Narrow steel insertion with a stout pull and oversized hinge plates.', roughness: 0.45, frame: 'steel-insertion', lock: 'rim-lock', extraLock: 'padlock', history: 'repaired', exposure: 0.05, marks: [{ kind: 'notice', text: 'NO ENTRY BEYOND THIS POINT EXCEPT' }], motif: 'diagonal-bracing' }) }) },
  { key: 'blank-5L', chamber: null, side: 'left', z: bayCentreZ(5), spec: blank({ family: 'panelled-timber', width: 1.0, height: 2.4, material: { primary: '#5E7059', secondary: '#C3AE8A', metal: CORRIDOR.colours.brass, glazing: 'none' }, handle: 'knob', character: ch({ note: 'Timber door with three generations of green visible at its worn edges.', roughness: 0.65, frame: 'painted-timber', lock: 'knob', history: 'neglected', exposure: 0.12, marks: [{ kind: 'decal-residue' }], motif: 'inset-panels' }) }) },
  { key: 'blank-7L', chamber: null, side: 'left', z: bayCentreZ(7), spec: blank({ family: 'ceremonial-double', width: 1.8, height: 2.9, material: { primary: '#86654C', secondary: '#303D49', metal: CORRIDOR.colours.brass, glazing: 'none' }, handle: 'ring-pull', character: ch({ note: 'Restrained double door with unusually elegant oval panels.', roughness: 0.5, frame: 'retained-oak', lock: 'rim-lock', history: 'polished', exposure: 0.03, marks: [], motif: 'oval-panels' }) }) },
  { key: 'blank-7R', chamber: null, side: 'right', z: bayCentreZ(7), spec: blank({ family: 'glazed-office', width: 0.9, height: 2.4, material: { primary: '#A1B7BA', secondary: '#384F61', metal: '#9DABA8', glazing: 'frosted' }, handle: 'lever', character: ch({ note: 'Glazed upper leaf with a slightly mismatched enamel repair below.', roughness: 0.45, frame: 'painted-timber', lock: 'lever', history: 'repaired', exposure: 0.06, marks: [{ kind: 'stencil', text: '7' }], motif: 'gridded-glazing' }) }) },
];

/** The far corridor's repeat order, drawn from the authored blank doors. */
const REPEAT: readonly DoorSpec[] = [0, 3, 4, 1, 6, 2, 7, 8, 5].flatMap((i) => {
  const door = BLANK_DOORS[i];
  return door ? [door.spec] : [];
});

/**
 * The blank door, if any, past the walkable bays at `bay` on `side`. Deterministic, so the far
 * corridor looks the same on every visit; some bays are left bare so the rhythm never reads as tiled.
 */
export function blankDoorAt(bay: number, side: 'left' | 'right'): DoorSpec | null {
  // The Annex keeps its bay; authored doors past the walkable bays are not repeated over.
  if (bay === ANNEX.bay) return null;
  if (BLANK_DOORS.some((d) => d.side === side && Math.abs(d.z - bayCentreZ(bay)) < CORRIDOR.bay / 2)) return null;
  const n = bay * 2 + (side === 'left' ? 0 : 1);
  if (n % 5 === 3) return null;
  return REPEAT[(n * 7) % REPEAT.length] ?? null;
}
