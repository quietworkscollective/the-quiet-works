import type { Quality } from '../corridor/world/quality.ts';
import type { LookProfile } from './profiles.ts';

/**
 * Which finishing stack a visitor gets, as pure decisions on numbers. The corridor already
 * decides a render quality from the renderer and the query string; this turns that, plus the kind
 * of device, into a tier and the list of stages the tier runs. No renderer is involved, so the
 * plan can be read, and tested, without a GPU.
 */

export type LookDevice = 'desktop' | 'mobile';

/** `lite`: no stack, the world renders exactly as it does without one. */
export type LookTier = 'lite' | 'mobile' | 'desktop';

/**
 * A stage of the finishing stack, in the order they run:
 *  - `scene`: the world, once, into an HDR target that carries a depth texture when a later stage
 *    reads one;
 *  - `ao`: contact shadow from that depth, with no second pass over the scene;
 *  - `atmosphere`: the lamp cones and the dust, drawn over the frame and faded against that depth;
 *  - `finish`: one merged pass of the effects in `effects`, the last of which writes to the canvas.
 */
export type LookStage = 'scene' | 'ao' | 'atmosphere' | 'finish';

/**
 * An effect merged into the `finish` pass, in the order they run. The light a shaft puts on the
 * surfaces it reaches, height fog and bloom work on the HDR frame (the light first, so the fog
 * veils it with distance); tone mapping happens once, here and nowhere else; the grade, vignette
 * and grain work on the display image after it.
 */
export type LookEffect = 'light-patch' | 'height-fog' | 'bloom' | 'tone-mapping' | 'lut' | 'vignette' | 'grain';

/** Short side, in CSS pixels, below which a coarse-pointer device is treated as a phone. */
export const MOBILE_SHORT_SIDE = 900;

export interface DeviceFacts {
  /** The primary pointer is coarse (a finger). */
  readonly coarsePointer: boolean;
  /** Viewport size in CSS pixels. */
  readonly width: number;
  readonly height: number;
}

/**
 * A phone or small tablet: the primary pointer is a finger and the viewport is small. A laptop
 * with a touch screen reports a fine primary pointer and stays on the desktop tier; a large
 * tablet is left on the desktop tier because its pixel budget is a laptop's.
 */
export function detectDevice(facts: DeviceFacts): LookDevice {
  return facts.coarsePointer && Math.min(facts.width, facts.height) < MOBILE_SHORT_SIDE ? 'mobile' : 'desktop';
}

/** The tier for a render quality and a device. Software renderers (`lite`) never get a stack. */
export function chooseTier(quality: Quality, device: LookDevice): LookTier {
  return quality === 'lite' ? 'lite' : device;
}

/** What a tier runs, for one profile. */
export interface LookPlan {
  readonly tier: LookTier;
  /** Stages in order. Empty for `lite`: the stack is bypassed. */
  readonly stages: readonly LookStage[];
  /** Effects of the merged `finish` pass, in order. Empty for `lite`. */
  readonly effects: readonly LookEffect[];
  /** Dither the output against banding in dark gradients. */
  readonly dither: boolean;
  /** The generated environment is applied. Never in the lite tier. */
  readonly environment: boolean;
  /** Which parts of the air are drawn. Desktop only: they read the scene's depth. */
  readonly atmosphere: { readonly heightFog: boolean; readonly cones: boolean; readonly dust: boolean };
  /** Whether any stage reads the scene's depth, so the scene target must carry a depth texture. */
  readonly depth: boolean;
  /** Bloom runs at this fraction of its desktop resolution. */
  readonly bloomScale: number;
  /** Samples for the multisampled scene target. */
  readonly msaaSamples: number;
  /** How much of the grade is mixed in: the profile's `intensity` on a desktop, its `mobileIntensity` on a phone. */
  readonly lutIntensity: number;
}

/** Pixel count above which the desktop's multisampled target drops from 4 samples to 2, to bound memory. */
export const MSAA_PIXEL_LIMIT = 4_200_000;

/** Samples a phone's target gets: a half-float multisampled target costs about 100 MiB a megapixel at 4. */
export const MOBILE_MSAA_SAMPLES = 2;

export interface PlanOptions {
  readonly reducedMotion: boolean;
  /** Drawing-buffer size in device pixels, to pick the sample count. */
  readonly pixels?: number;
}

const NO_ATMOSPHERE = { heightFog: false, cones: false, dust: false } as const;

/** The stages, effects and sample count for a tier, a profile and the visitor's motion setting. */
export function planFor(tier: LookTier, profile: LookProfile, options: PlanOptions): LookPlan {
  if (tier === 'lite') {
    return { tier, stages: [], effects: [], dither: false, environment: false, atmosphere: NO_ATMOSPHERE, depth: false, bloomScale: 1, msaaSamples: 0, lutIntensity: 0 };
  }
  const desktop = tier === 'desktop';
  const air = profile.atmosphere;
  const atmosphere = desktop
    ? {
        heightFog: air.heightFog.length > 0,
        cones: air.cones.specs.length > 0 && air.cones.maxVisible > 0,
        dust: air.dust.count > 0,
      }
    : NO_ATMOSPHERE;
  const ao = desktop && profile.ao.intensity > 0;
  const bloom = profile.bloom.strength > 0 && (desktop || profile.bloom.mobile.enabled);
  const lutIntensity = desktop ? profile.lut.intensity : profile.lut.mobileIntensity;

  const stages: LookStage[] = ['scene'];
  if (ao) stages.push('ao');
  if (atmosphere.cones || atmosphere.dust) stages.push('atmosphere');
  stages.push('finish');

  const effects: LookEffect[] = [];
  if (atmosphere.cones && air.cones.specs.some((spec) => spec.patch > 0)) effects.push('light-patch');
  if (atmosphere.heightFog) effects.push('height-fog');
  if (bloom) effects.push('bloom');
  effects.push('tone-mapping');
  if (lutIntensity > 0) effects.push('lut');
  // Vignette and grain are the desktop's; grain also stops for a visitor who asked for less motion.
  if (desktop && profile.vignette.amount > 0) effects.push('vignette');
  if (desktop && profile.grain.amount > 0 && !options.reducedMotion) effects.push('grain');

  return {
    tier,
    stages,
    effects,
    dither: true,
    environment: true,
    atmosphere,
    depth: ao || atmosphere.heightFog || atmosphere.cones || atmosphere.dust,
    bloomScale: desktop ? 1 : profile.bloom.mobile.scale,
    msaaSamples: !desktop || (options.pixels ?? 0) > MSAA_PIXEL_LIMIT ? MOBILE_MSAA_SAMPLES : 4,
    lutIntensity,
  };
}
