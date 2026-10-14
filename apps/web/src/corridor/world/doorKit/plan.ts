import { DOOR_GRAMMAR, type DoorSpec, type Glazing } from '../../doorKit.ts';
import { characterOf, handleAt, type CharacterPlan } from './character.ts';
import { FRAME } from './frame.ts';
import type { Vec3 } from '../math.ts';
import { nth } from '../math.ts';

/**
 * A DoorSpec turned into a plan: what is on the door and where, as plain data. Geometry is built
 * from the plan, and the unit tests read the plan, so "a chain door has a chain" and "a blank
 * door has no plaque" are checked without a GPU.
 *
 * Door-local space: origin at the floor in the middle of the opening, +x across the door as the
 * visitor faces it, +y up, +z out of the wall into the corridor. The leaf face sits
 * FRAME.leafSetback behind the wall plane (z = -leafSetback).
 */

export type PartKind =
  | 'leaf'
  | 'frame'
  | 'surround-patch'
  | 'glass'
  | 'transom'
  | 'handle'
  | 'plaque'
  | 'hatch'
  | 'lamp'
  | 'seam-light'
  | 'closure-chain'
  | 'closure-padlock'
  | 'closure-seal'
  | 'closure-bolt'
  | 'fitting-number-4'
  | 'fitting-doormat'
  | 'fitting-letterbox'
  | 'fitting-pressure-gauge'
  | 'fitting-rivets';

export interface PlanPart {
  kind: PartKind;
  /** Centre in door-local metres. */
  centre: Vec3;
  /** Width and height of the part's face, metres. */
  size: readonly [number, number];
  /** Which leaf it is mounted on (index into `leaves`), when it is leaf-mounted. */
  leaf?: number;
  /** Glass treatment, for glass parts. */
  glazing?: Glazing;
}

export interface LeafPlan {
  /** The side the leaf is hinged on, as the visitor faces it. */
  hinge: 'left' | 'right';
  /** Door-local x of the hinge and of the free edge. */
  x0: number;
  x1: number;
  width: number;
  height: number;
}

export interface DoorPlan {
  spec: DoorSpec;
  /** The clear opening the door fills (the spec's width and height). */
  opening: { width: number; height: number };
  /** The hole through the wall: the opening plus its lining and any transom, or the older surround. */
  hole: { width: number; height: number };
  /** Timber lining inside the hole, each side (zero for an insertion into an older opening). */
  lining: number;
  /** A fixed light above the leaf, inside the hole. */
  transom: { bottom: number; height: number } | null;
  leaves: LeafPlan[];
  parts: PlanPart[];
  /** The door's character as data (ADR 0004); null for a door with none (the lobby's own). */
  character: CharacterPlan | null;
}

/** The clearance a leaf is hung with: sides and head, and a deeper gap at the foot. */
export const LEAF_GAP = { side: 0.005, top: 0.005, bottom: 0.012 } as const;

/** Leaf thickness by family, metres. */
export const LEAF_THICKNESS = { 'panelled-timber': 0.045, 'glazed-office': 0.042, 'steel-insertion': 0.05, 'ceremonial-double': 0.055 } as const;

/** Where a transom may reach before it meets the cornice's lower edge. */
const TRANSOM_CEILING = 3.45;

/** Height of the transom over a door of height `h`: none for a lamp topper. */
export function transomHeight(spec: DoorSpec): number {
  if (spec.topper !== 'transom') return 0;
  if (spec.surround) return Math.max(0, Math.min(0.4, spec.surround.height - spec.height - 0.2));
  const room = TRANSOM_CEILING - FRAME.architrave - FRAME.lining - spec.height;
  return Math.min(0.42, Math.max(0.18, room));
}

/** Timber lining thickness for doors original to the building. */
export function liningOf(spec: DoorSpec): number {
  return spec.surround ? 0 : FRAME.lining;
}

/** The wall hole a spec needs (see DoorPlan.hole). */
export function holeFor(spec: DoorSpec): { width: number; height: number } {
  if (spec.surround) return { width: spec.surround.width, height: spec.surround.height };
  const lining = liningOf(spec);
  return { width: spec.width + 2 * lining, height: spec.height + transomHeight(spec) + lining };
}

/** Which edge a family's leaf is hinged on. The Office's hinge is toward the lobby. */
export function hingeSide(spec: DoorSpec): 'left' | 'right' {
  return spec.family === 'steel-insertion' || spec.family === 'glazed-office' ? 'right' : 'left';
}

/** A stable seed from a spec's own words, so a door's chips and wear are the same on every visit. */
function seedOfSpec(spec: DoorSpec): number {
  let h = 2166136261;
  for (const ch of `${spec.character?.note ?? ''}${spec.material.primary}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function planDoor(spec: DoorSpec): DoorPlan {
  const lining = liningOf(spec);
  const hole = holeFor(spec);
  const tH = transomHeight(spec);
  const parts: PlanPart[] = [];
  const zFace = -FRAME.leafSetback;
  const W = spec.width;
  const H = spec.height;

  const double = spec.family === 'ceremonial-double';
  const leafH = H - LEAF_GAP.bottom - LEAF_GAP.top;
  const leaves: LeafPlan[] = [];
  if (double) {
    const lw = (W - 2 * LEAF_GAP.side - 0.006) / 2;
    leaves.push({ hinge: 'left', x0: -W / 2 + LEAF_GAP.side, x1: -W / 2 + LEAF_GAP.side + lw, width: lw, height: leafH });
    leaves.push({ hinge: 'right', x0: W / 2 - LEAF_GAP.side, x1: W / 2 - LEAF_GAP.side - lw, width: lw, height: leafH });
  } else {
    const hinge = hingeSide(spec);
    const lw = W - 2 * LEAF_GAP.side;
    leaves.push(
      hinge === 'left'
        ? { hinge, x0: -W / 2 + LEAF_GAP.side, x1: W / 2 - LEAF_GAP.side, width: lw, height: leafH }
        : { hinge, x0: W / 2 - LEAF_GAP.side, x1: -W / 2 + LEAF_GAP.side, width: lw, height: leafH },
    );
  }
  leaves.forEach((leaf, i) => parts.push({ kind: 'leaf', centre: [(leaf.x0 + leaf.x1) / 2, LEAF_GAP.bottom + leaf.height / 2, zFace], size: [leaf.width, leaf.height], leaf: i }));

  parts.push({ kind: 'frame', centre: [0, hole.height / 2, 0], size: [hole.width, hole.height] });
  if (spec.surround) parts.push({ kind: 'surround-patch', centre: [0, hole.height / 2, zFace], size: [hole.width, hole.height] });

  if (spec.material.glazing !== 'none') {
    parts.push({ kind: 'glass', centre: [0, H * 0.72, zFace], size: [W * 0.7, H * 0.4], glazing: spec.material.glazing, leaf: 0 });
  }
  if (tH > 0) {
    parts.push({ kind: 'transom', centre: [0, H + lining / 2 + tH / 2, zFace], size: [W, tH], glazing: spec.material.glazing === 'none' ? 'clear' : spec.material.glazing });
  }
  if (spec.topper === 'lamp') parts.push({ kind: 'lamp', centre: [0, hole.height + FRAME.architrave + 0.22, 0.12], size: [0.2, 0.2] });

  // Handle: centre at 1.0 m, on the free edge side of the leaf (the meeting edge for doubles).
  if (double) {
    for (const [i, leaf] of leaves.entries()) {
      const x = leaf.x1 + (i === 0 ? -0.09 : 0.09);
      parts.push({ kind: 'handle', centre: [x, DOOR_GRAMMAR.handleCentreY, zFace], size: [0.12, 0.12], leaf: i });
    }
  } else {
    const x = (nth(leaves, 0).hinge === 'left' ? 1 : -1) * (W / 2 - 0.1);
    parts.push({ kind: 'handle', centre: [x, DOOR_GRAMMAR.handleCentreY, zFace], size: [0.12, 0.12], leaf: 0 });
  }

  if (spec.plaque) {
    // On a pair the plaque is hung on the right-hand leaf; otherwise it is centred on the leaf.
    const plaqueLeaf = double ? 1 : 0;
    const plaqueX = double ? (nth(leaves, 1).x0 + nth(leaves, 1).x1) / 2 : 0;
    parts.push({
      kind: 'plaque',
      centre: [plaqueX, DOOR_GRAMMAR.plaqueCentreY, zFace],
      size: [DOOR_GRAMMAR.plaque.width, DOOR_GRAMMAR.plaque.height],
      leaf: plaqueLeaf,
    });
  }
  if (spec.hatch) parts.push({ kind: 'hatch', centre: [0, spec.hatch.centreY, zFace], size: [spec.hatch.width, spec.hatch.height], leaf: 0 });
  if (spec.spill) parts.push({ kind: 'seam-light', centre: [0, H / 2, zFace - 0.06], size: [W, H] });

  switch (spec.closure) {
    case 'chain':
      parts.push({ kind: 'closure-chain', centre: [0, DOOR_GRAMMAR.handleCentreY, zFace], size: [0.5, 0.3] });
      parts.push({ kind: 'closure-padlock', centre: [0, DOOR_GRAMMAR.handleCentreY - 0.42, zFace], size: [0.06, 0.08] });
      break;
    case 'padlock':
      parts.push({ kind: 'closure-padlock', centre: [0, DOOR_GRAMMAR.handleCentreY - 0.12, zFace], size: [0.06, 0.08], leaf: 0 });
      break;
    case 'seal':
      parts.push({ kind: 'closure-seal', centre: [0, 1.35, zFace], size: [0.07, 0.42], leaf: 0 });
      break;
    case 'bolt':
      parts.push({ kind: 'closure-bolt', centre: [0, 1.62, zFace], size: [0.2, 0.05], leaf: 0 });
      break;
    default:
      break;
  }

  for (const fitting of spec.fittings ?? []) {
    switch (fitting) {
      case 'number-4':
        parts.push({ kind: 'fitting-number-4', centre: [0, 1.62, zFace], size: [0.08, 0.12], leaf: 0 });
        break;
      case 'doormat':
        parts.push({ kind: 'fitting-doormat', centre: [0, 0.006, 0.34], size: [Math.min(0.8, W - 0.1), 0.5] });
        break;
      case 'letterbox':
        parts.push({ kind: 'fitting-letterbox', centre: [0, 1.2, zFace], size: [0.26, 0.07], leaf: 0 });
        break;
      case 'pressure-gauge':
        parts.push({ kind: 'fitting-pressure-gauge', centre: [hole.width / 2 + FRAME.architrave + 0.3, 1.45, 0], size: [0.14, 0.14] });
        break;
      case 'rivets':
        parts.push({ kind: 'fitting-rivets', centre: [0, H / 2, zFace], size: [W, H], leaf: 0 });
        break;
    }
  }

  const main = leaves.length > 1 ? 1 : 0;
  const character = characterOf(spec, { leaves, opening: { width: W, height: H }, hole, handle: handleAt(parts, main), transomTop: tH > 0 ? H + tH : null }, seedOfSpec(spec));
  return { spec, opening: { width: W, height: H }, hole, lining, transom: tH > 0 ? { bottom: H, height: tH } : null, leaves, parts, character };
}

export function partsOf(plan: DoorPlan, kind: PartKind): PlanPart[] {
  return plan.parts.filter((p) => p.kind === kind);
}
