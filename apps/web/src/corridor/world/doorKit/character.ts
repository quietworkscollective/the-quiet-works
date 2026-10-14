import type { DoorCharacter, DoorSpec } from '../../doorKit.ts';
import { DOOR_GRAMMAR } from '../../doorKit.ts';
import { linear, mixRgb, mulRgb, type Rgb } from '../colour.ts';
import type { MarkCell } from '../marksLayout.ts';
import { MARK_TEXT, stencilWidthPx } from '../marksLayout.ts';
import { mulberry32 } from '../math.ts';
import { FRAME } from './frame.ts';
import { lookOf, type SignatureId } from './look.ts';
import type { LeafPlan } from './plan.ts';

/**
 * A door's character (ADR 0004) as data: where each lock, mark, chip, scuff and wash goes, worked
 * out from the spec's DoorCharacter and the door's plan before any geometry exists. The unit
 * tests read it ("each chamber door has its lock, marks and lamp"; "exposed substrate is 2-12%
 * of the surface"; "marks stay under 8%"), and the builders turn it into geometry, so the data
 * and what is drawn cannot drift apart.
 *
 * Everything is door-local metres (origin at the floor in the middle of the opening, +x across,
 * +y up) on a leaf; seeded by the door's seed so a door is the same on every visit.
 */

/** What a principal or supplementary lock is built as. Lever, knob and handwheel are the door's handle. */
export type LockBuild = 'handle' | 'rim-lock' | 'thumb-latch' | 'sliding-bolt' | 'padlock' | 'closure';

export interface LockPart {
  /** The character's name for it. */
  kind: DoorCharacter['lock'] | NonNullable<DoorCharacter['extraLock']>;
  role: 'principal' | 'extra';
  /** How it is built: the handle, or a closure the spec already carries, or a lock fitting of its own. */
  build: LockBuild;
  leaf: number;
  centre: readonly [number, number];
  /** +1 toward +x, -1 toward -x: which way the fitting's long axis points. */
  dir: 1 | -1;
}

export interface MarkPart {
  kind: DoorCharacter['marks'][number]['kind'];
  text?: string;
  leaf: number;
  centre: readonly [number, number];
  /** Bounding size on the leaf, metres. */
  size: readonly [number, number];
  rotDeg: number;
  /** Colour of the paint, residue or paper. */
  colour: Rgb;
}

/** What shows through where paint has gone. */
export type Substrate = 'timber' | 'primer' | 'earlier' | 'rust' | 'filler' | 'metal';

export interface ChipPart {
  cell: MarkCell;
  leaf: number;
  centre: readonly [number, number];
  size: readonly [number, number];
  rotDeg: number;
  /** Layers from the outermost inward: the colour of each coat or substrate it reveals. */
  layers: readonly Rgb[];
}

export interface WearPart {
  kind: 'hand-polish' | 'hand-grime' | 'scuff' | 'dust' | 'stain' | 'drip';
  /** Leaf-mounted (moves with the leaf), or fixed to the frame and wall. */
  leaf: number | null;
  cell: MarkCell;
  centre: readonly [number, number];
  /** y-up for a leaf; for dust, the second value is the depth out of the wall. */
  size: readonly [number, number];
  rotDeg: number;
  colour: Rgb;
  /** Height in z of a horizontal part (dust on a ledge); otherwise unused. */
  ledgeY?: number;
}

export interface CharacterPlan {
  note: string;
  roughness: number;
  /** Which of the three finishes the paint is in. */
  finish: 'gloss' | 'satin' | 'matt';
  frame: DoorCharacter['frame'];
  motif: DoorCharacter['motif'];
  history: DoorCharacter['history'];
  locks: LockPart[];
  marks: MarkPart[];
  /** Total area of every mark's bounding rectangle over the area of the leaf face. */
  markCoverage: number;
  chips: ChipPart[];
  /** Area exposed through the finish over the area of the leaf face, as built. */
  exposure: number;
  wear: WearPart[];
  lamp: { kelvin: number; strength: number } | null;
  foliage: DoorCharacter['foliage'] | null;
  signature: SignatureId | null;
  /** The potted plant a look adds beside a door whose data has no foliage. */
  pot: 'fern' | null;
}

/** Paint finish from roughness: polished highlights belong to touched metal, not to the whole leaf. */
export function finishOf(roughness: number): CharacterPlan['finish'] {
  if (roughness <= 0.47) return 'gloss';
  if (roughness <= 0.62) return 'satin';
  return 'matt';
}

/** The leaf a spec's plaque hangs on, or the first leaf. */
function mainLeaf(leaves: readonly LeafPlan[]): number {
  return leaves.length > 1 ? 1 : 0;
}

/** The centre height of the bottom rail's front face, where feet and stencils meet it. */
export function kickCentreY(spec: DoorSpec): number {
  switch (spec.family) {
    case 'panelled-timber':
      return 0.012 + 0.11;
    case 'glazed-office':
      return 0.012 + 0.07;
    case 'ceremonial-double':
      return 0.012 + 0.15;
    case 'steel-insertion':
      return 0.3;
  }
}

/** Strip height for a stencil of `capM` metres cap height: the strip is taller than its capitals. */
const STRIP_PER_CAP = MARK_TEXT.rowHeight / (MARK_TEXT.fontPx * 0.72);

export function stencilSize(text: string, capM: number): readonly [number, number] {
  const h = capM * STRIP_PER_CAP;
  return [(stencilWidthPx(text) / MARK_TEXT.rowHeight) * h, h];
}

const BONE: Rgb = linear('#DDD5C8');
const GRAPHITE: Rgb = linear('#1E2326');

const luminance = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** Stencil paint: bone on a dark door, the door's own dark secondary (or graphite) on a light one. */
function stencilColour(primary: Rgb, secondary: Rgb): Rgb {
  if (luminance(primary) < 0.3) return mixRgb(BONE, secondary, 0.12);
  return luminance(secondary) < 0.1 ? secondary : GRAPHITE;
}
const PAPER: Rgb = linear('#B9B09C');
const PRIMER: Rgb = [0.34, 0.31, 0.28];
const TIMBER: Rgb = linear('#7A5A38');
const RUST: Rgb = linear('#6E3B22');
const FILLER: Rgb = linear('#B7AE9A');

/** The coats under a door's finish: older paints in the same family, then primer, then wood. */
function coatsOf(primary: Rgb, history: DoorCharacter['history']): { earlier: readonly Rgb[]; base: Rgb } {
  const cream = mulRgb(mixRgb(primary, [0.7, 0.66, 0.55], 0.42), 0.8);
  const dark = mulRgb(primary, 0.5);
  const warm = mulRgb(mixRgb(primary, [0.55, 0.38, 0.24], 0.4), 0.8);
  return { earlier: history === 'neglected' ? [cream, dark, warm] : [cream, dark], base: history === 'neglected' ? PRIMER : TIMBER };
}

export function characterOf(spec: DoorSpec, geometry: { leaves: readonly LeafPlan[]; opening: { width: number; height: number }; hole: { width: number; height: number }; handle: readonly [number, number]; transomTop: number | null }, seed: number): CharacterPlan | null {
  const ch = spec.character;
  if (!ch) return null;
  const look = lookOf(spec);
  const rng = mulberry32(seed ^ 0x6a09e667);
  const { leaves, opening, hole } = geometry;
  const W = opening.width;
  const H = opening.height;
  const primary = linear(spec.material.primary);
  const secondary = spec.material.secondary ? linear(spec.material.secondary) : mulRgb(primary, 0.55);
  const metalDir = (leaf: LeafPlan): 1 | -1 => (leaf.x1 > leaf.x0 ? 1 : -1);
  const main = mainLeaf(leaves);
  const mainLeafPlan = leaves[main] as LeafPlan;
  const dir = metalDir(mainLeafPlan);
  const [hx, hy] = geometry.handle;

  // ---- Locks ------------------------------------------------------------------------------
  const locks: LockPart[] = [];
  const handleKind: LockPart['kind'][] = ['lever', 'knob', 'handwheel'];
  const principalBuild: LockBuild = handleKind.includes(ch.lock) ? 'handle' : ch.lock === 'rim-lock' ? 'rim-lock' : ch.lock === 'thumb-latch' ? 'thumb-latch' : 'sliding-bolt';
  const principalAt = (): [number, number] => {
    switch (principalBuild) {
      case 'rim-lock':
        // A rim lock sits on the lock rail beside the handle, nearer the hanging side.
        return [hx - dir * 0.15, hy + 0.1];
      case 'thumb-latch':
        return [hx - dir * 0.02, hy + 0.17];
      case 'sliding-bolt':
        return [hx, 1.32];
      default:
        return [hx, hy];
    }
  };
  locks.push({ kind: ch.lock, role: 'principal', build: principalBuild, leaf: main, centre: principalAt(), dir });
  if (ch.extraLock) {
    const dupBolt = ch.extraLock === 'sliding-bolt' && spec.closure === 'bolt';
    const dupPad = ch.extraLock === 'padlock' && (spec.closure === 'chain' || spec.closure === 'padlock');
    const build: LockBuild = dupBolt || dupPad ? 'closure' : ch.extraLock;
    const at: [number, number] = ch.extraLock === 'padlock' ? [hx, hy - 0.28] : ch.extraLock === 'sliding-bolt' ? [hx, 1.7] : [hx - dir * 0.15, hy - 0.22];
    locks.push({ kind: ch.extraLock, role: 'extra', build, leaf: main, centre: at, dir });
  }

  // ---- Marks ("tattoos"): zero to three, under 8% together ---------------------------------
  const marks: MarkPart[] = [];
  const kickY = kickCentreY(spec);
  const faceW = spec.family === 'ceremonial-double' ? (mainLeafPlan.width) : W;
  ch.marks.forEach((m, i) => {
    switch (m.kind) {
      case 'stencil': {
        const text = m.text ?? '';
        // Small door numbers read big (a "7"); sentences read small. Both sit on the kick rail.
        const cap = text.length <= 2 ? 0.07 : 0.026;
        const size = stencilSize(text, cap);
        const cx = (mainLeafPlan.x0 + mainLeafPlan.x1) / 2 + (text.length <= 2 ? dir * 0.08 : 0);
        const cy = text.length <= 2 ? 1.78 : kickY;
        marks.push({ kind: 'stencil', text, leaf: main, centre: [cx, cy], size: size[0] > faceW * 0.8 ? [faceW * 0.8, size[1] * (faceW * 0.8) / size[0]] : size, rotDeg: 0, colour: stencilColour(primary, secondary) });
        break;
      }
      case 'notice': {
        const text = m.text ?? '';
        const size = stencilSize(text, 0.0085);
        marks.push({ kind: 'notice', text, leaf: main, centre: [hx - dir * 0.0, 1.43], size: [Math.min(size[0] + 0.03, faceW * 0.9), size[1] + 0.03], rotDeg: -1.2, colour: PAPER });
        break;
      }
      case 'decal-residue': {
        const w = 0.21;
        marks.push({ kind: 'decal-residue', leaf: main, centre: [(mainLeafPlan.x0 + mainLeafPlan.x1) / 2 - dir * (0.04 + rng() * 0.05), 1.72], size: [w, w * 0.75], rotDeg: (rng() - 0.5) * 4, colour: mulRgb(primary, 1.45) });
        break;
      }
      case 'carving': {
        marks.push({ kind: 'carving', leaf: main, centre: [(mainLeafPlan.x0 + mainLeafPlan.x1) / 2, H - 0.075], size: [Math.abs(mainLeafPlan.width) * 0.62, 0.05], rotDeg: 0, colour: [1, 1, 1] });
        break;
      }
      case 'stripe': {
        // A painted band at hip height across the whole leaf, in the door's secondary colour.
        const y = spec.family === 'steel-insertion' ? 0.5 : 0.42;
        marks.push({ kind: 'stripe', leaf: 0, centre: [0, y + i * 0.0], size: [Math.abs(leaves[0]?.width ?? W) * 0.86, 0.045], rotDeg: 0, colour: secondary });
        break;
      }
    }
  });
  const faceArea = W * H;
  const markCoverage = marks.reduce((n, m) => n + m.size[0] * m.size[1], 0) / faceArea;

  // ---- Exposed substrate: chips and flakes totalling `exposure` of the leaf face -------------
  const target = ch.exposure * faceArea;
  const { earlier, base } = coatsOf(primary, ch.history);
  const chips: ChipPart[] = [];
  // How much of a chip's quad is actually bare: a ragged edge band is about half, a flake 55%, pits a quarter.
  const FILL = { edge: 0.5, flake: 0.55, pits: 0.25 } as const;
  const shares: Record<DoorCharacter['history'], { edge: number; flake: number; pits: number; hand: number }> = {
    repainted: { edge: 0.75, flake: 0.15, pits: 0.1, hand: 0 },
    repaired: { edge: 0.55, flake: 0.25, pits: 0.1, hand: 0.1 },
    polished: { edge: 0.45, flake: 0.05, pits: 0.1, hand: 0.4 },
    neglected: { edge: 0.3, flake: 0.5, pits: 0.2, hand: 0 },
  };
  const share = shares[ch.history];
  const outerEdges = leaves.map((leaf, i) => {
    const x0 = Math.min(leaf.x0, leaf.x1);
    const x1 = Math.max(leaf.x0, leaf.x1);
    // A pair's meeting edges are not outer: only the hinge-side stile of each leaf is.
    return { i, left: leaves.length === 1 || leaf.hinge === 'left' ? x0 : null, right: leaves.length === 1 || leaf.hinge === 'right' ? x1 : null, x0, x1 };
  });
  const coat = (): Rgb => earlier[Math.floor(rng() * earlier.length)] as Rgb;
  const layersFor = (kind: 'edge' | 'flake' | 'pits' | 'hand'): Rgb[] => {
    if (kind === 'edge') return [coat()];
    if (ch.history === 'neglected') return [coat(), rng() < 0.3 ? RUST : base];
    if (ch.history === 'polished' || kind === 'hand') return [base];
    if (ch.history === 'repaired') return [rng() < 0.45 ? FILLER : coat(), base];
    return [coat(), base];
  };
  const pick = (): (typeof outerEdges)[number] => outerEdges[Math.floor(rng() * outerEdges.length)] as (typeof outerEdges)[number];
  let used = 0;
  const edgeBudget = target * share.edge;
  let g = 0;
  while (used < edgeBudget && g < 60) {
    g += 1;
    const e = pick();
    const len = 0.14 + rng() * 0.34;
    const depth = 0.012 + rng() * 0.018;
    if (rng() < 0.62) {
      // Down an outer stile: the edge a shoulder brushes.
      const x = e.left !== null && (e.right === null || rng() < 0.5) ? e.left : e.right;
      if (x === null) continue;
      const cy = len / 2 + 0.02 + rng() * Math.max(0.01, H - len - 0.1);
      const inward = x === e.left ? 1 : -1;
      chips.push({ cell: 'edge0', leaf: e.i, centre: [x + inward * depth * 0.5, cy], size: [len, depth], rotDeg: inward > 0 ? 90 : -90, layers: layersFor('edge') });
    } else {
      // Along the foot, where a mop and boots go.
      const cx = e.x0 + 0.06 + rng() * Math.max(0.01, e.x1 - e.x0 - 0.12 - len * 0.5);
      chips.push({ cell: 'edge0', leaf: e.i, centre: [cx, 0.012 + depth * 0.5], size: [len, depth * 1.2], rotDeg: 180, layers: layersFor('edge') });
    }
    used += len * depth * FILL.edge;
  }
  const flakeBudget = used + target * share.flake;
  const flakeCells: readonly MarkCell[] = ['chip0', 'chip1', 'chip2', 'chip5'];
  g = 0;
  while (used < flakeBudget && g < 120) {
    g += 1;
    const e = pick();
    const size = ch.history === 'neglected' ? 0.04 + rng() * 0.06 : 0.018 + rng() * 0.028;
    const h = size * (0.7 + rng() * 0.6);
    // Flakes cluster near the edges and low on the leaf, where damp and boots reach.
    const nearEdge = rng() < 0.7;
    const cx = nearEdge ? (rng() < 0.5 ? e.x0 + 0.04 + rng() * 0.11 : e.x1 - 0.04 - rng() * 0.11) : e.x0 + 0.08 + rng() * Math.max(0.01, e.x1 - e.x0 - 0.16);
    const cy = rng() < 0.65 ? 0.04 + rng() * 0.55 : 0.4 + rng() * (H - 0.5);
    chips.push({ cell: flakeCells[Math.floor(rng() * flakeCells.length)] as MarkCell, leaf: e.i, centre: [cx, cy], size: [size, h], rotDeg: rng() * 360, layers: layersFor('flake') });
    used += size * h * FILL.flake;
  }
  const pitBudget = used + target * share.pits;
  g = 0;
  while (used < pitBudget && g < 60) {
    g += 1;
    const e = pick();
    const size = 0.07 + rng() * 0.05;
    const cx = rng() < 0.5 ? e.x0 + 0.07 + rng() * 0.1 : e.x1 - 0.07 - rng() * 0.1;
    const cy = 0.12 + rng() * (H * 0.6);
    chips.push({ cell: 'chip4', leaf: e.i, centre: [cx, cy], size: [size, size], rotDeg: rng() * 360, layers: layersFor('pits') });
    used += size * size * FILL.pits;
  }
  const handBudget = used + target * share.hand;
  g = 0;
  while (used < handBudget && g < 60) {
    g += 1;
    // Worn through where a hand reaches for the handle and along the lock edge.
    const size = 0.03 + rng() * 0.03;
    chips.push({ cell: rng() < 0.5 ? 'chip0' : 'chip1', leaf: main, centre: [hx + (rng() - 0.5) * 0.2, hy + (rng() - 0.5) * 0.42], size: [size, size * 0.8], rotDeg: rng() * 360, layers: layersFor('hand') });
    used += size * size * 0.8 * FILL.flake;
  }
  const exposure = chips.reduce((n, c) => n + c.size[0] * c.size[1] * (c.cell === 'edge0' ? FILL.edge : c.cell === 'chip4' ? FILL.pits : FILL.flake), 0) / faceArea;

  // ---- Wear: where hands and feet go ---------------------------------------------------------
  const wear: WearPart[] = [];
  const polishStrength = ch.history === 'polished' ? 1 : 0.7;
  wear.push({ kind: 'hand-polish', leaf: main, cell: 'polish', centre: [hx, hy], size: [0.17, 0.17], rotDeg: 0, colour: mulRgb(mixRgb(primary, BONE, 0.35), polishStrength) });
  wear.push({ kind: 'hand-grime', leaf: main, cell: 'polish', centre: [hx + dir * -0.01, hy - 0.04], size: [0.26, 0.26], rotDeg: 0, colour: mulRgb(primary, 0.5) });
  for (const [i, leaf] of leaves.entries()) {
    const x0 = Math.min(leaf.x0, leaf.x1);
    const x1 = Math.max(leaf.x0, leaf.x1);
    const w = x1 - x0;
    wear.push({ kind: 'scuff', leaf: i, cell: i % 2 === 0 ? 'scuff0' : 'scuff1', centre: [(x0 + x1) / 2, 0.11], size: [w * 0.92, 0.22], rotDeg: 0, colour: mulRgb(primary, ch.history === 'neglected' ? 0.35 : 0.55) });
  }
  // Dust: on the tops of the corner and plinth blocks, the only flat ledges nothing wipes.
  const hwDust = hole.width / 2;
  for (const sign of [-1, 1] as const) {
    const cx = sign * (hwDust + FRAME.architrave / 2);
    const w = FRAME.architrave + 0.012;
    wear.push({ kind: 'dust', leaf: null, cell: 'dust', centre: [cx, 0], size: [w, 0.036], rotDeg: 0, colour: [0.55, 0.52, 0.46], ledgeY: hole.height + FRAME.architrave + 0.006 });
    wear.push({ kind: 'dust', leaf: null, cell: 'dust', centre: [cx, 0], size: [w, 0.038], rotDeg: 0, colour: [0.55, 0.52, 0.46], ledgeY: 0.22 });
  }
  if (ch.history === 'neglected') {
    wear.push({ kind: 'stain', leaf: 0, cell: 'stain', centre: [(leaves[0]?.x0 ?? 0) * 0.3, H * 0.3], size: [0.36, 0.32], rotDeg: 0, colour: mulRgb(primary, 0.55) });
    wear.push({ kind: 'drip', leaf: 0, cell: 'drip', centre: [(leaves[0]?.x1 ?? 0) * 0.5, 0.82], size: [0.07, 0.34], rotDeg: 0, colour: RUST });
  }

  return {
    note: ch.note,
    roughness: ch.roughness,
    finish: finishOf(ch.roughness),
    frame: ch.frame,
    motif: ch.motif,
    history: ch.history,
    locks,
    marks,
    markCoverage,
    chips,
    exposure,
    wear,
    lamp: ch.lamp ?? null,
    foliage: ch.foliage ?? null,
    signature: look.signature,
    pot: look.pot ?? null,
  };
}

/** The handle position the plan puts on the main leaf (centre height 1.0 m). */
export function handleAt(parts: readonly { kind: string; centre: readonly [number, number, number]; leaf?: number | undefined }[], main: number): readonly [number, number] {
  const h = parts.find((p) => p.kind === 'handle' && (p.leaf ?? 0) === main) ?? parts.find((p) => p.kind === 'handle');
  return h ? [h.centre[0], h.centre[1]] : [0, DOOR_GRAMMAR.handleCentreY];
}
