import { kelvinToLinear, luminance } from '../colour.ts';
import type { LookProfile } from '../profiles.ts';

/**
 * The generated environment, as a layout of emissive patches in a dark room: broad warm patches
 * on the ceiling, one dim neutral window patch, and a faint warm patch below for floor bounce.
 * It stands in for the image-based light a downloaded HDRI would give, with no download and with
 * every colour and size stated here. Whatever builds the environment (an offscreen scene
 * prefiltered by PMREM today, anything else tomorrow) reads this layout; nothing here builds one.
 *
 * Coordinates are those of the capture: the origin is the point being lit, +y is up. Patches are
 * flat rectangles that face the origin. The room around them is a dark box at `base`.
 *
 * Radiance is normalised so the whole sphere averages luminance 1. That makes
 * `scene.environmentIntensity` mean what it says: a fraction of a unit white ambient. Without it
 * the number would change meaning with every patch added or moved.
 */

export type Vec3 = readonly [number, number, number];

export type PatchId = 'ceiling-left' | 'ceiling-right' | 'window' | 'floor-bounce';

export interface EnvironmentPatch {
  readonly id: PatchId;
  /** Unit vector from the origin to the patch centre. */
  readonly direction: Vec3;
  /** Distance from the origin to the patch centre, in metres. */
  readonly distance: number;
  /** Width and height of the rectangle, in metres. */
  readonly size: readonly [number, number];
  readonly kelvin: number;
  /** Radiance relative to a ceiling patch, before normalisation. */
  readonly weight: number;
}

export interface EnvironmentLayout {
  readonly base: { readonly kelvin: number; readonly weight: number };
  readonly patches: readonly EnvironmentPatch[];
}

function unit(v: Vec3): Vec3 {
  const n = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / n, v[1] / n, v[2] / n];
}

/** The weak ambient fill's colour temperature: ADR 0004's 4300 K. */
export const BASE_KELVIN = 4300;

/** Radiance of the dark room around the patches, relative to a ceiling patch. */
export const BASE_WEIGHT = 0.03;

export function environmentLayout(env: LookProfile['environment']): EnvironmentLayout {
  return {
    base: { kelvin: BASE_KELVIN, weight: BASE_WEIGHT },
    patches: [
      { id: 'ceiling-left', direction: unit([-0.45, 0.88, 0.1]), distance: 4, size: [3, 2.4], kelvin: env.ceilingKelvin, weight: 1 },
      { id: 'ceiling-right', direction: unit([0.45, 0.88, -0.1]), distance: 4, size: [3, 2.4], kelvin: env.ceilingKelvin, weight: 1 },
      { id: 'window', direction: unit([-0.97, 0.12, 0.2]), distance: 4.5, size: [1.8, 1.5], kelvin: env.windowKelvin, weight: env.windowWeight },
      { id: 'floor-bounce', direction: [0, -1, 0], distance: 3, size: [6, 6], kelvin: env.ceilingKelvin - 100, weight: env.floorBounceWeight },
    ],
  };
}

/** Solid angle, in steradians, of a patch: a rectangle facing the origin, centred on the view axis. */
export function patchSolidAngle(patch: EnvironmentPatch): number {
  const a = patch.size[0] / 2;
  const b = patch.size[1] / 2;
  const d = patch.distance;
  return 4 * Math.atan((a * b) / (d * Math.sqrt(d * d + a * a + b * b)));
}

/** Half the angular width of the patch's larger side, in radians, as seen from the origin. */
export function patchHalfExtent(patch: EnvironmentPatch): number {
  return Math.atan(Math.max(patch.size[0], patch.size[1]) / 2 / patch.distance);
}

/** Angle in radians between the centres of two patches as seen from the origin. */
export function angleBetween(a: EnvironmentPatch, b: EnvironmentPatch): number {
  const dot = a.direction[0] * b.direction[0] + a.direction[1] * b.direction[1] + a.direction[2] * b.direction[2];
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

export interface EnvironmentRadiance {
  /** Multiplier on the (largest-channel-1) kelvin colour of the room around the patches. */
  readonly base: number;
  /** Multiplier on the (largest-channel-1) kelvin colour of each patch. */
  readonly patches: Readonly<Record<PatchId, number>>;
}

const unitLuminance = (kelvin: number): number => luminance(kelvinToLinear(kelvin));

/** Average luminance over the sphere of a layout lit with the given radiance multipliers. */
export function meanLuminance(layout: EnvironmentLayout, radiance: EnvironmentRadiance): number {
  const sphere = 4 * Math.PI;
  let covered = 0;
  let sum = 0;
  for (const patch of layout.patches) {
    const solid = patchSolidAngle(patch);
    covered += solid;
    sum += radiance.patches[patch.id] * unitLuminance(patch.kelvin) * solid;
  }
  sum += radiance.base * unitLuminance(layout.base.kelvin) * (sphere - covered);
  return sum / sphere;
}

/** Radiance multipliers that scale the layout's weights so the sphere averages luminance 1. */
export function normalisedRadiance(layout: EnvironmentLayout): EnvironmentRadiance {
  const raw: EnvironmentRadiance = {
    base: layout.base.weight,
    patches: Object.fromEntries(layout.patches.map((p) => [p.id, p.weight])) as Record<PatchId, number>,
  };
  const scale = 1 / meanLuminance(layout, raw);
  return {
    base: raw.base * scale,
    patches: Object.fromEntries(Object.entries(raw.patches).map(([id, w]) => [id, w * scale])) as Record<PatchId, number>,
  };
}
