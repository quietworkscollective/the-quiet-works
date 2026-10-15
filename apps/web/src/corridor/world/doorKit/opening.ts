import { Matrix4 } from 'three';
import { box, quad, strip, type Style } from '../builder.ts';
import { linear, mulRgb, type Rgb } from '../colour.ts';
import { stud } from '../shapes.ts';
import type { Buckets } from '../buckets.ts';
import type { Vec3 } from '../math.ts';
import { CORRIDOR } from '../../layout.ts';
import type { DoorSpec } from '../../doorKit.ts';
import { FRAME } from './frame.ts';
import { BRASS_TINT } from '../palette.ts';
import { holeOf } from '../openings.ts';
import { lookOf } from './look.ts';
import { planDoor, transomHeight } from './plan.ts';

/**
 * The joinery around a door: the lining inside the wall, the architrave on the wall face with its
 * plinth and corner blocks, and the brass threshold. Built in door-local space (origin at the
 * floor in the middle of the opening, +x across the door as the visitor faces it, +y up, +z out
 * of the wall into the corridor) and placed with `doorMatrix`.
 */

/** Door-local to world for a door on `side` of the corridor at `z`. */
export function doorMatrix(side: 'left' | 'right', z: number, halfWidth: number = CORRIDOR.width / 2): Matrix4 {
  const m = new Matrix4().makeRotationY(side === 'left' ? Math.PI / 2 : -Math.PI / 2);
  m.setPosition(side === 'left' ? -halfWidth : halfWidth, 0, z);
  return m;
}

/** Architrave profile as (distance out from the hole edge, projection from the wall), inner edge first. */
const ARCHITRAVE: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 0.016],
  [0.007, 0.027],
  [0.017, 0.027],
  [0.023, 0.02],
  [0.031, 0.03],
  [0.041, 0.03],
  [0.049, 0.02],
  [0.09, 0.015],
  [0.1, 0],
];

/** A plainer painted board: a flat face with its outer arris rounded, no stepped mouldings. */
const ARCHITRAVE_PAINTED: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 0.02],
  [0.012, 0.025],
  [0.086, 0.025],
  [0.1, 0.015],
  [0.1, 0],
];

/** A fluted pilaster face for ceremonial frames: three flutes between a bead and a plinth. */
const ARCHITRAVE_FLUTED: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 0.032],
  [0.006, 0.034],
  [0.014, 0.034],
  [0.018, 0.02],
  [0.03, 0.02],
  [0.034, 0.034],
  [0.042, 0.034],
  [0.046, 0.02],
  [0.058, 0.02],
  [0.062, 0.034],
  [0.07, 0.034],
  [0.074, 0.02],
  [0.086, 0.02],
  [0.09, 0.034],
  [0.1, 0.034],
  [0.1, 0],
];

const PLINTH = { height: 0.22, projection: 0.038 } as const;
const CORNER_BLOCK = { projection: 0.036 } as const;

export interface OpeningStyles {
  /** Timber lining and architrave. */
  trim: Style;
  /** Plaster reveal for insertions. */
  plaster: Style;
  /** The dark backing seen through glass. */
  dark: Style;
}

export interface FrameOptions {
  /** Depth of the reveal behind the wall plane. */
  reveal: number;
  /** Plaster reveal (an insertion into an older opening) rather than a timber lining. */
  plasterReveal: boolean;
  /** Timber lining inside the hole, each side and at the head (zero when there is none). */
  lining: number;
  /** Dark backing behind the leaf (omit for an opening nothing closes). */
  backed: boolean;
  /** The joinery family (ADR 0004): retained oak when omitted. */
  kind?: NonNullable<DoorSpec['character']>['frame'];
  /** Paint for a painted frame (and for the steel liner): the door's own colours. */
  paint?: { colour: Rgb; liner: Rgb };
  /** Brass for rosettes and the like. */
  metal?: Rgb;
}

/** The opening for a door spec: the hole, lining and reveal it needs. */
export function buildOpening(b: Buckets, spec: DoorSpec, s: OpeningStyles): void {
  const plan = planDoor(spec);
  const primary = linear(spec.material.primary);
  const secondary = spec.material.secondary ? linear(spec.material.secondary) : mulRgb(primary, 1.15);
  const look = lookOf(spec);
  // A painted frame takes the door's secondary colour; one whose look gives the secondary to a
  // member of the leaf (the Office's steel) takes the dominant one a shade lighter.
  const paint = look.roles.frame === 'secondary' && spec.character?.frame !== 'painted-timber' ? mulRgb(primary, 1.1) : secondary;
  buildOpeningFrame(
    b,
    plan.hole,
    // An open chamber has its interior behind the leaf, so its reveal is not backed by dark.
    {
      reveal: FRAME.reveal,
      plasterReveal: spec.surround !== undefined,
      lining: plan.lining,
      backed: spec.spill === undefined,
      ...(spec.character ? { kind: spec.character.frame } : {}),
      paint: { colour: paint, liner: secondary },
      metal: linear(spec.material.metal),
    },
    s,
  );
}

/** A finished plaster return for a custom door model that supplies its own front frame. */
export function buildOpeningReveal(b: Buckets, spec: DoorSpec, style: Style): void {
  const plan = planDoor(spec);
  const half = plan.hole.width / 2;
  const innerHalf = half - plan.lining;
  const innerHeight = plan.hole.height - plan.lining;
  const holeHeight = plan.hole.height;
  const reveal = FRAME.reveal + 0.04;
  // Jambs and head run behind the corridor wall return to close oblique sightlines through it.
  quad(b.plaster, [-innerHalf, 0, 0], [-innerHalf, 0, -reveal], [-innerHalf, innerHeight, -reveal], [-innerHalf, innerHeight, 0], style, [1, 0, 0]);
  quad(b.plaster, [innerHalf, 0, -reveal], [innerHalf, 0, 0], [innerHalf, innerHeight, 0], [innerHalf, innerHeight, -reveal], style, [-1, 0, 0]);
  quad(b.plaster, [-innerHalf, innerHeight, 0], [-innerHalf, innerHeight, -reveal], [innerHalf, innerHeight, -reveal], [innerHalf, innerHeight, 0], style, [0, -1, 0]);
  // The custom frame supplies the visible joinery, but unlike buildOpeningFrame it does not
  // automatically close the 35 mm lining margins at the wall plane. Finish those margins behind
  // the frame so grazing views cannot see the clear colour around its feet or head.
  const faceDepth = -0.002;
  quad(b.plaster, [-half, 0, faceDepth], [-innerHalf, 0, faceDepth], [-innerHalf, innerHeight, faceDepth], [-half, innerHeight, faceDepth], style, [0, 0, 1]);
  quad(b.plaster, [innerHalf, 0, faceDepth], [half, 0, faceDepth], [half, innerHeight, faceDepth], [innerHalf, innerHeight, faceDepth], style, [0, 0, 1]);
  quad(b.plaster, [-half, innerHeight, faceDepth], [half, innerHeight, faceDepth], [half, holeHeight, faceDepth], [-half, holeHeight, faceDepth], style, [0, 0, 1]);
  // Run the threshold right to the reveal's outside corners; the door itself keeps its clearance.
  box(b.brass, [0, 0.006, -reveal / 2], [2 * half, 0.012, reveal], 0.002, { colour: BRASS_TINT });
}

/** Build the lining, reveal, architrave, blocks and threshold around a hole into door-local buckets. */
export function buildOpeningFrame(b: Buckets, hole: { width: number; height: number }, o: FrameOptions, s: OpeningStyles): void {
  const { width: hw2, height: hh } = hole;
  const hw = hw2 / 2;
  const iw = hw - o.lining;
  const ih = hh - o.lining;
  const inside: Vec3 = [0, hh / 2, 1.2];
  const reveal = o.reveal;
  const kind = o.kind ?? 'retained-oak';
  const painted = kind === 'painted-timber' && o.paint !== undefined;
  // The timber a painted frame is made of is the same joinery in paint; everything else stays oak.
  const trimBucket = painted ? b.paint : b.oak;
  const trimStyle: Style = painted && o.paint ? (s.trim.uv ? { colour: o.paint.colour, uv: s.trim.uv } : { colour: o.paint.colour }) : s.trim;
  const revealBucket = o.plasterReveal ? b.plaster : trimBucket;
  const revealStyle = o.plasterReveal ? s.plaster : trimStyle;
  // The grain of a painted member runs along it: the texture's u axis is turned to run up a jamb.
  const upright = (style: Style): Style => (painted ? { ...style, uv: { ...style.uv, swap: !style.uv?.swap } } : style);
  const jambReveal = o.plasterReveal ? revealStyle : upright(revealStyle);
  const jambTrim = upright(trimStyle);

  // Reveal: the two jambs and the head, from the wall plane back to the leaf's recess. With a
  // lining these are the lining's inner faces, and its edge shows at the wall plane.
  quad(revealBucket, [-iw, 0, 0], [-iw, 0, -reveal], [-iw, ih, -reveal], [-iw, ih, 0], jambReveal, [1, 0, 0]);
  quad(revealBucket, [iw, 0, -reveal], [iw, 0, 0], [iw, ih, 0], [iw, ih, -reveal], jambReveal, [-1, 0, 0]);
  quad(revealBucket, [-iw, ih, 0], [-iw, ih, -reveal], [iw, ih, -reveal], [iw, ih, 0], revealStyle, [0, -1, 0]);
  if (o.lining > 0) {
    const face: Vec3 = [0, 0, 1];
    quad(trimBucket, [-hw, 0, 0], [-iw, 0, 0], [-iw, hh, 0], [-hw, hh, 0], jambTrim, face);
    quad(trimBucket, [iw, 0, 0], [hw, 0, 0], [hw, hh, 0], [iw, hh, 0], jambTrim, face);
    quad(trimBucket, [-iw, ih, 0], [iw, ih, 0], [iw, hh, 0], [-iw, hh, 0], trimStyle, face);
  }
  // Behind the leaf: whatever shows through glass is dark, never the fog colour.
  if (o.backed) quad(b.glass, [-iw, 0, -reveal], [iw, 0, -reveal], [iw, ih, -reveal], [-iw, ih, -reveal], s.dark, [0, 0, 1]);
  // Threshold: a brass plate across the opening at the foot of the reveal.
  box(b.brass, [0, 0.006, -reveal / 2], [2 * hw, 0.012, reveal], 0.002, { colour: BRASS_TINT });

  // Architrave: both jambs from the plinth up, and the head between them.
  const profile = kind === 'ceremonial-double' ? ARCHITRAVE_FLUTED : painted ? ARCHITRAVE_PAINTED : ARCHITRAVE;
  const jamb = (sign: -1 | 1): void => {
    const polyline: Vec3[] = profile.map(([t, p]) => [sign * (hw + t), PLINTH.height, p]);
    strip(trimBucket, polyline, [0, hh - PLINTH.height, 0], jambTrim, inside);
  };
  jamb(-1);
  jamb(1);
  const head: Vec3[] = profile.map(([t, p]) => [-hw, hh + t, p]);
  strip(trimBucket, head, [2 * hw, 0, 0], trimStyle, inside);

  // Plinth blocks at the foot and corner blocks at the head: the joints an Edwardian carpenter
  // did not mitre. Blocks stand a little proud of the moulding they cover.
  const a = FRAME.architrave;
  const blockProjection = kind === 'ceremonial-double' ? 0.046 : CORNER_BLOCK.projection;
  for (const sign of [-1, 1] as const) {
    const cx = sign * (hw + a / 2);
    box(trimBucket, [cx, PLINTH.height / 2, PLINTH.projection / 2], [a + 0.012, PLINTH.height, PLINTH.projection], 0.003, trimStyle, ['-z', '-y']);
    box(trimBucket, [cx, hh + a / 2, blockProjection / 2], [a + 0.012, a + 0.012, blockProjection], 0.003, trimStyle, ['-z']);
    // Ceremonial corner blocks carry a brass rosette: a boss with a ring about it.
    if (kind === 'ceremonial-double' && o.metal) {
      const metal: Style = { colour: o.metal };
      stud(b.brass, [cx, hh + a / 2, blockProjection], 0.032, 0.032, 0.008, 20, metal);
      stud(b.brass, [cx, hh + a / 2, blockProjection + 0.004], 0.014, 0.014, 0.008, 12, metal);
    }
  }

  // A steel insertion keeps the older opening's joinery and adds its own: a box-section liner
  // set against the plaster infill, painted in the door's colour, the line where the insertion
  // was made.
  if (kind === 'steel-insertion' && o.paint) {
    const liner: Style = { colour: o.paint.liner };
    const t = 0.03;
    const z0 = -0.012;
    box(b.paint, [0, ih - t / 2 - 0.0, z0 + 0.012], [2 * iw, t, 0.024], 0.003, liner, ['-z']);
    for (const sign of [-1, 1] as const) box(b.paint, [sign * (iw - t / 2), ih / 2, z0 + 0.012], [t, ih, 0.024], 0.003, liner, ['-z']);
  }
}

/**
 * Plaster over the wall opening that a surround leaves around a smaller door: the "patched"
 * infill between the older opening and the steel frame, a little different in tone and bordered
 * by a faint repair line. Door-local; the frame itself is the door kit's.
 */
export function buildPatch(b: Buckets, spec: DoorSpec, style: Style, edgeStyle: Style): void {
  if (!spec.surround) return;
  const { width: hw2, height: hh } = holeOf(spec);
  const iw = spec.width / 2;
  const tH = transomHeight(spec);
  const ih = spec.height + (tH > 0 ? tH + 0.05 : 0);
  const hw = hw2 / 2;
  const z = -FRAME.leafSetback;
  const f: Vec3 = [0, 0, 1];
  // Four slabs around the frame: left, right, above. (The floor is the threshold.)
  quad(b.plaster, [-hw, 0, z], [-iw, 0, z], [-iw, hh, z], [-hw, hh, z], style, f);
  quad(b.plaster, [iw, 0, z], [hw, 0, z], [hw, hh, z], [iw, hh, z], style, f);
  quad(b.plaster, [-iw, ih, z], [iw, ih, z], [iw, hh, z], [-iw, hh, z], style, f);
  // The repair line: a slim ridge where new plaster meets old, just proud of the infill.
  const r = 0.004;
  box(b.plaster, [-hw + r, hh / 2, z + r / 2], [2 * r, hh, r], 0, edgeStyle, ['-z']);
  box(b.plaster, [hw - r, hh / 2, z + r / 2], [2 * r, hh, r], 0, edgeStyle, ['-z']);
  box(b.plaster, [0, hh - r, z + r / 2], [2 * hw, 2 * r, r], 0, edgeStyle, ['-z']);
}
