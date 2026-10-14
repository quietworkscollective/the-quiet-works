import type { ChamberId } from '@tqw/engine';
import { CHAMBER_MODULES } from '../../chambers/registry.ts';
import type { DoorSpec } from '../doorKit.ts';
import { BLANK_DOORS, blankDoorAt, CHAMBER_SLOTS, CORRIDOR } from '../layout.ts';
import { FRAME } from './doorKit/frame.ts';
import { holeFor } from './doorKit/plan.ts';

export { FRAME };

/**
 * Where every door sits along the corridor: the four chamber doors, the authored blank doors in
 * the walkable bays, and the blank doors that recede past them to the fog. One list feeds the
 * wall builder (which leaves a gap for each), the door kit, the lamps and the layout tests.
 */
export interface Placement {
  key: string;
  side: 'left' | 'right';
  /** Centre of the opening along the corridor. */
  z: number;
  spec: DoorSpec;
  chamber: ChamberId | null;
  /** Past the walkable bays: seen only from a distance, so built to a lower detail. */
  far: boolean;
}

/** The hole through the wall for a door (its lining and transom included, or the older surround). */
export const holeOf = holeFor;

/** The gap a door leaves in the dado and skirting: the hole and its architrave. */
export function gapOf(spec: DoorSpec): { width: number; height: number } {
  const hole = holeOf(spec);
  return { width: hole.width + 2 * FRAME.architrave, height: hole.height + FRAME.architrave };
}

export function placements(): Placement[] {
  const out: Placement[] = [];
  for (const slot of CHAMBER_SLOTS) {
    if (!slot.chamber) continue;
    out.push({ key: slot.key, side: slot.side, z: slot.z, spec: CHAMBER_MODULES[slot.chamber].door, chamber: slot.chamber, far: false });
  }
  for (const door of BLANK_DOORS) out.push({ key: door.key, side: door.side, z: door.z, spec: door.spec, chamber: null, far: false });
  // Whole bays only: a door whose opening would run past the far wall is not built.
  const bays = Math.floor((CORRIDOR.innerDoorZ - CORRIDOR.farZ) / CORRIDOR.bay);
  for (let bay = CORRIDOR.walkableBays; bay < bays; bay += 1) {
    for (const side of ['left', 'right'] as const) {
      const spec = blankDoorAt(bay, side);
      if (!spec) continue;
      out.push({ key: `far-${bay}${side === 'left' ? 'L' : 'R'}`, side, z: CORRIDOR.innerDoorZ - CORRIDOR.bay * (bay + 0.5), spec, chamber: null, far: true });
    }
  }
  return out;
}
