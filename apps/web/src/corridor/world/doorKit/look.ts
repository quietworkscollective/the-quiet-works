import { CHAMBER_MODULES } from '../../../chambers/registry.ts';
import type { DoorSpec } from '../../doorKit.ts';
import { BLANK_DOORS, CHAMBER_SLOTS } from '../../layout.ts';

/**
 * The art direction of each door beyond what its data says: which of the door's two paints each
 * member of the leaf takes, and the one signature detail the builders give it (a repaired split,
 * a number taken down for another door, an old department's ghost). The DoorCharacter in the
 * spec is the contract; this table is the world lane's own design on top of it, kept in one place
 * so a reviewer can read every door's intent at once.
 *
 * Colour roles keep the 55-80% / 10-25% split the character system asks for: stiles, rails and
 * panels are mostly the dominant colour; the secondary is spent on beads, a kick band, bars or
 * panel fields, never on all of them at once.
 */

/** Which paint a member of the leaf takes. `fresh` and `faded` are the dominant colour, newly done and long exposed. */
export type Hue = 'primary' | 'secondary' | 'fresh' | 'faded';

export type Role = 'stile' | 'rail' | 'panel' | 'bead' | 'kick' | 'frame' | 'bar';

/** The signature details, each a small built or printed thing that is this door's alone. */
export type SignatureId =
  | 'old-plaque-ghost'
  | 'butterfly-keys'
  | 'leather-grip'
  | 'brass-kick-plates'
  | 'ghost-number'
  | 'cylinder-latch'
  | 'patch-plate'
  | 'filled-outlines'
  | 'fanlight'
  | 'stout-pull'
  | 'biscuit-tin'
  | 'fleurons'
  | 'finger-plate'
  | 'enamel-repair-tab';

export interface Look {
  roles: Partial<Record<Role, Hue>>;
  signature: SignatureId | null;
  /** A second plant: a pot standing by the door (the Atrium's trained climber is in its data). */
  pot?: 'fern';
}

const L = (look: Look): Look => look;

/** Keyed by door key: the open chambers, then the authored blank doors. */
export const LOOKS: Readonly<Record<string, Look>> = {
  'certification-office': L({ roles: { frame: 'secondary', panel: 'primary', bar: 'secondary' }, signature: 'old-plaque-ghost' }),
  apartment: L({ roles: { stile: 'primary', rail: 'primary', panel: 'primary', bead: 'secondary', kick: 'secondary' }, signature: 'butterfly-keys', pot: 'fern' }),
  'tomorrow-engine': L({ roles: { frame: 'secondary', panel: 'primary', bar: 'secondary' }, signature: 'leather-grip' }),
  'great-atrium': L({ roles: { stile: 'primary', rail: 'primary', panel: 'primary', bead: 'secondary', bar: 'secondary', kick: 'faded' }, signature: 'brass-kick-plates' }),
  'outline-room': L({ roles: { frame: 'secondary', panel: 'primary', bar: 'secondary' }, signature: 'enamel-repair-tab' }),
  'blank-0L': L({ roles: { stile: 'primary', rail: 'primary', panel: 'primary', bead: 'secondary', kick: 'fresh' }, signature: 'ghost-number' }),
  'blank-0R': L({ roles: { stile: 'primary', rail: 'primary', panel: 'primary', bead: 'secondary', bar: 'secondary' }, signature: 'cylinder-latch' }),
  'blank-1L': L({ roles: { frame: 'secondary', panel: 'primary', bar: 'secondary' }, signature: 'patch-plate' }),
  'blank-2R': L({ roles: { stile: 'secondary', rail: 'secondary', panel: 'primary', bead: 'primary', kick: 'secondary' }, signature: 'filled-outlines' }),
  'blank-3R': L({ roles: { stile: 'primary', rail: 'primary', panel: 'primary', bead: 'secondary', kick: 'secondary' }, signature: 'fanlight' }),
  'blank-4R': L({ roles: { frame: 'secondary', panel: 'primary', bar: 'secondary' }, signature: 'stout-pull' }),
  'blank-5L': L({ roles: { stile: 'primary', rail: 'primary', panel: 'primary', bead: 'secondary', kick: 'faded' }, signature: 'biscuit-tin' }),
  'blank-7L': L({ roles: { stile: 'primary', rail: 'primary', panel: 'secondary', bead: 'primary', kick: 'primary' }, signature: 'fleurons' }),
  'blank-7R': L({ roles: { stile: 'primary', rail: 'primary', panel: 'primary', bar: 'secondary', bead: 'secondary' }, signature: 'finger-plate' }),
};

/** The look of a door given its spec (blank and far doors share spec objects with their authored original). */
let bySpec: Map<DoorSpec, string> | null = null;

function specKeys(): Map<DoorSpec, string> {
  if (bySpec) return bySpec;
  const map = new Map<DoorSpec, string>();
  for (const slot of CHAMBER_SLOTS) if (slot.chamber) map.set(CHAMBER_MODULES[slot.chamber].door, slot.key);
  for (const door of BLANK_DOORS) map.set(door.spec, door.key);
  bySpec = map;
  return map;
}

/** The authored key of a door spec, if it is one of the thirteen. */
export function keyOfSpec(spec: DoorSpec): string | null {
  return specKeys().get(spec) ?? null;
}

const PLAIN: Look = { roles: {}, signature: null };

/** The look for a spec; a door with no authored look (the lobby's) is plain. */
export function lookOf(spec: DoorSpec): Look {
  const key = keyOfSpec(spec);
  return (key ? LOOKS[key] : undefined) ?? PLAIN;
}

/** True when a spec is an authored door with a signature (the lobby's own doors have none). */
export function hasSignature(spec: DoorSpec): boolean {
  return keyOfSpec(spec) !== null;
}
