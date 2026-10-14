/**
 * The core door kit (ADR 0001, "Door kit"). A door is data: every chamber describes its door
 * with a DoorSpec and the corridor builds it from shared parts, so doors differ in proportion,
 * construction and mechanism while sharing mounting, signage and light. A future community
 * chamber contributes a door as validated data, never as code.
 *
 * Shared grammar: handle centre 1.0 m, plaque centre 1.55 m (about 280 x 90 mm), and either a
 * transom or a lamp above. Units are metres; colours are hex before lighting.
 */

/** The four silhouette families. Each chamber picks one. */
export type DoorFamily = 'panelled-timber' | 'glazed-office' | 'steel-insertion' | 'ceremonial-double';

export type Glazing = 'none' | 'wired' | 'frosted' | 'reeded' | 'clear' | 'porthole';
export type Handle = 'lever' | 'knob' | 'wheel' | 'ring-pull' | 'push-plate';

export interface DoorSpec {
  family: DoorFamily;
  /** The door leaf (or the pair, for doubles): width and height of the opening it fills. */
  width: number;
  height: number;
  /**
   * The older opening this door was inserted into, larger than the door; the gap is patched
   * plaster. Omit for doors original to the building.
   */
  surround?: { width: number; height: number };
  /** One dominant material, one metal, one glazing treatment. */
  material: { primary: string; secondary?: string; metal: string; glazing: Glazing };
  handle: Handle;
  topper: 'transom' | 'lamp';
  /** Plaque text comes from the chamber registry; `code` is a small Mono department code. */
  plaque: { text: string; code?: string } | null;
  /** A closed service hatch set into the leaf (the Office). */
  hatch?: { width: number; height: number; centreY: number };
  /** Interior light released when the door opens (open chambers only). */
  spill?: { kelvin: number; colour: string };
  /** Physical signs a sealed door will not open: a chain, a padlock, a seal tape. */
  closure?: 'chain' | 'padlock' | 'seal' | 'bolt';
  /** Small fittings that make it this door: a house number, a gauge, a doormat. */
  fittings?: readonly ('number-4' | 'doormat' | 'pressure-gauge' | 'rivets' | 'letterbox')[];
  /**
   * The door's own character (ADR 0004): a century of departments modifying one institution.
   * Five to seven layers are visibly expressed; only two compete for attention. The dominant colour
   * is `material.primary` (55–80% of the leaf), the secondary `material.secondary` (10–25%).
   */
  character?: DoorCharacter;
}

export interface DoorCharacter {
  /** One line of intent for builders and reviewers. */
  note: string;
  /** 0.35–0.8; polished highlights only on touched metal. */
  roughness: number;
  frame: 'retained-oak' | 'painted-timber' | 'steel-insertion' | 'ceremonial-double';
  lock: 'lever' | 'knob' | 'rim-lock' | 'thumb-latch' | 'sliding-bolt' | 'handwheel';
  extraLock?: 'padlock' | 'sliding-bolt' | 'rim-lock';
  /** An external wash on the door face, relative to a nearby sconce's pool centre; omit for shared sconces. Baked or cheap, never a new dynamic light per door. */
  lamp?: { kelvin: number; strength: number };
  /** At most two doors in the corridor carry foliage, projecting no more than 150 mm. */
  foliage?: 'potted' | 'trained';
  /** One dominant maintenance history. */
  history: 'repainted' | 'repaired' | 'polished' | 'neglected';
  /** Share of the surface showing substrate through the finish: 0.02–0.12. */
  exposure: number;
  /** Zero to three "tattoos", under 8% coverage together; no invented personal testimony. */
  marks: readonly { kind: 'stencil' | 'decal-residue' | 'carving' | 'stripe' | 'notice'; text?: string }[];
  motif: 'vertical-ribs' | 'round-aperture' | 'gridded-glazing' | 'inset-panels' | 'diagonal-bracing' | 'curved-joinery' | 'oval-panels';
}

export const DOOR_GRAMMAR = {
  handleCentreY: 1.0,
  plaqueCentreY: 1.55,
  plaque: { width: 0.28, height: 0.09 },
  lampKelvin: 3000,
} as const;
