import { box, type Bucket, type FaceName, type Style } from '../builder.ts';
import { createBuckets, type Buckets } from '../buckets.ts';
import { linear, mulRgb, type Rgb } from '../colour.ts';
import { CORRIDOR } from '../../layout.ts';
import type { DoorSpec, Glazing } from '../../doorKit.ts';
import type { PlaqueLayout } from '../artLayout.ts';
import { MarksLayout } from '../marksLayout.ts';
import { hash2, mulberry32 } from '../math.ts';
import { FRAME } from './frame.ts';
import { lookOf, type Hue, type Look, type Role } from './look.ts';
import type { DoorPlan } from './plan.ts';

/**
 * What every door builder works with: the plan, the spec's colours and one set of buckets for the
 * fixed parts plus one per leaf (and one per handle, which turns on its own pivot). Everything
 * is door-local; `build.ts` moves leaf and handle geometry to their pivots at the end.
 */
export interface Ctx {
  plan: DoorPlan;
  spec: DoorSpec;
  /** `far` doors are seen only from a distance: no bevels, no mouldings, simpler fittings. */
  lod: 'near' | 'far';
  plaques: PlaqueLayout;
  tints: Tints;
  fixed: Buckets;
  leaf: Buckets[];
  handle: Buckets[];
  /** A seed for small per-door variation (so identical specs are not clones). */
  seed: number;
  /** Where each stencil string sits on the marks atlas. */
  marks: MarksLayout;
  /** The door's art direction beyond its data: colour roles and its signature detail. */
  look: Look;
  /** Seeded randomness for chips, wear and plants: the same door is the same every load. */
  rng: () => number;
  /**
   * Depth of the leaf surface by region (door-local metres), added by the family builder as it
   * recesses fields and raises panels, so a mark laid on the leaf touches it instead of floating.
   */
  relief: { x: readonly [number, number]; y: readonly [number, number]; z: number }[];
  /** Oval panels as built, so a fitting can be set at the centre of each. */
  ovals: { cx: number; cy: number; rx: number; ry: number }[];
}

export interface Tints {
  primary: Rgb;
  secondary: Rgb;
  metal: Rgb;
  /** The primary colour is the building's oak: the leaf is stained timber, not painted. */
  stained: boolean;
}

const OAK = linear(CORRIDOR.colours.oak);

export function tintsOf(spec: DoorSpec): Tints {
  const primary = linear(spec.material.primary);
  const stained = Math.hypot(primary[0] - OAK[0], primary[1] - OAK[1], primary[2] - OAK[2]) < 0.012;
  return {
    primary,
    secondary: spec.material.secondary ? linear(spec.material.secondary) : mulRgb(primary, 0.55),
    metal: linear(spec.material.metal),
    stained,
  };
}

export function createCtx(plan: DoorPlan, lod: 'near' | 'far', plaques: PlaqueLayout, seed: number, marks?: MarksLayout): Ctx {
  return {
    plan,
    spec: plan.spec,
    lod,
    plaques,
    tints: tintsOf(plan.spec),
    fixed: createBuckets(),
    leaf: plan.leaves.map(() => createBuckets()),
    handle: plan.leaves.map(() => createBuckets()),
    seed,
    marks: marks ?? new MarksLayout((plan.spec.character?.marks ?? []).flatMap((m) => (m.text ? [m.text] : []))),
    look: lookOf(plan.spec),
    rng: mulberry32(seed ^ 0x5ca1ab1e),
    relief: [],
    ovals: [],
  };
}

/** The bevel for a part: 3 mm up close, none far away where it could not be seen. */
export const bevelOf = (c: Ctx, near = 0.003): number => (c.lod === 'near' ? near : 0);

/** A box in min/max form (door-local metres). */
export function span(
  b: Bucket,
  x: readonly [number, number],
  y: readonly [number, number],
  z: readonly [number, number],
  bevel: number,
  style?: Style,
  skip?: readonly FaceName[],
): void {
  box(b, [(x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2], [Math.abs(x[1] - x[0]), Math.abs(y[1] - y[0]), Math.abs(z[1] - z[0])], bevel, style, skip);
}

/** A member of the leaf as it is built: its bucket and vertex colour style. */
export interface Member {
  bucket: Bucket;
  style: Style;
}

/** The colour a hue stands for on this door, linear. */
export function hueRgb(c: Ctx, hue: Hue): Rgb {
  const t = c.tints;
  switch (hue) {
    case 'secondary':
      return t.secondary;
    case 'fresh':
      // New paint over the old: brighter and cleaner than the coat around it.
      return mulRgb(t.primary, 1.28);
    case 'faded':
      return mulRgb(t.primary, 0.84);
    default:
      return t.primary;
  }
}

const isOak = (rgb: Rgb): boolean => Math.hypot(rgb[0] - OAK[0], rgb[1] - OAK[1], rgb[2] - OAK[2]) < 0.012;

/**
 * Where a member of the leaf goes, and how it is tinted: the colour its role takes on this door
 * (the dominant paint unless the door's look says otherwise), in stained oak when that colour is
 * the building's own oak and in paint when it is not. Steel doors are always painted.
 */
export function member(c: Ctx, lb: Buckets, role: Role, grainAlong: boolean, hueOverride?: Hue): Member {
  const hue = hueOverride ?? c.look.roles[role] ?? 'primary';
  const base = hueRgb(c, hue);
  const jitter = 1 + (hash2(c.seed, 7) - 0.5) * 0.12;
  if (c.spec.family === 'steel-insertion' || !isOak(base)) {
    return { bucket: lb.paint, style: { colour: mulRgb(base, jitter), uv: { swap: !grainAlong } } };
  }
  return { bucket: lb.oak, style: { colour: [jitter, jitter, jitter], uv: { swap: !grainAlong } } };
}

/** The primary-coloured member (used by builders that predate roles, and by plain doors). */
export function body(c: Ctx, lb: Buckets, grainAlong: boolean): Member {
  return member(c, lb, 'stile', grainAlong, 'primary');
}

/** The bucket and flat style for a glazing treatment. */
export function glassBucket(lb: Buckets, glazing: Glazing): Bucket {
  switch (glazing) {
    case 'wired':
      return lb.wired;
    case 'frosted':
      return lb.frosted;
    case 'reeded':
      return lb.reeded;
    default:
      return lb.glass;
  }
}

export const zFace = -FRAME.leafSetback;
