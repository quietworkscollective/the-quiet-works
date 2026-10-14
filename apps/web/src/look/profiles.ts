import { ATMOSPHERES, type AtmosphereProfile, type SpaceId } from './atmosphere/data.ts';
import { EXPOSURE, type AoPreset } from './ranges.ts';

/**
 * Every number the finishing stack and the generated environment read, per space. A profile is
 * plain data: no renderer, no pass, no class. A composer pipeline and a node pipeline read the
 * same object, and a space lane tunes its own profile without touching the stack.
 *
 * Starting values come from art consult 6; `ranges.ts` holds the ranges and the profile test holds
 * every profile to them. Landing is the corridor's hero view: its edges already darken, so it
 * takes no vignette. Vignette and grain sit at the low end of their ranges on purpose: the look
 * is warm and cosy, and neither may add a mood of its own.
 */
export interface LookProfile {
  readonly space: SpaceId;
  /** Contact shadow from the main pass's depth (N8AO, half resolution), desktop tier only. */
  readonly ao: {
    /** World-space radius in metres. */
    readonly radius: number;
    /**
     * N8AO's intensity: the occlusion is raised to this power. 0.3 to 0.45 darkens a heavily
     * occluded corner by about a third of a full multiply. 0 turns the contact shadow off.
     */
    readonly intensity: number;
    /** Which N8AO preset sets the sample counts. */
    readonly quality: AoPreset;
    /** How fast the occlusion fades with distance, as a ratio of its radius; lower reduces halos. */
    readonly distanceFalloff: number;
    /**
     * The colour the occluded light keeps, `#rrggbb`: the occlusion multiplies the scene by this
     * (in linear light) at full strength, so a warm value makes a contact shadow warm shade that
     * keeps red over blue, never a cold black.
     */
    readonly tint: string;
  };
  readonly bloom: {
    readonly strength: number;
    readonly radius: number;
    /** HDR luminance (linear, before tone mapping) above which a pixel blooms. */
    readonly threshold: number;
    /** The mobile tier may bloom at reduced resolution; off unless a space asks for it. */
    readonly mobile: { readonly enabled: boolean; readonly scale: number };
  };
  readonly lut: {
    /** 0 is the identity, 1 the full grade. */
    readonly intensity: number;
    /**
     * The same on a phone, which has none of the depth-based air (haze, far glow, surface light) that
     * lifts a dark room's deepest shadows on a desktop. A room that is already well lifted keeps its
     * desktop number; a dark one (the Office) asks for more, because the grade's shadow lift is the
     * phone's only lever. What lies above the shadow knee (luma 0.4) does not move at any intensity.
     */
    readonly mobileIntensity: number;
  };
  readonly vignette: {
    /** Fraction of light lost in the corners of the frame. 0 is no vignette. */
    readonly amount: number;
    /** Radius, 0 centre to 1 corner, where the fall-off begins. */
    readonly inner: number;
  };
  readonly grain: {
    /** Peak-to-peak variation of each colour channel, as a fraction of its value. 0 is none. */
    readonly amount: number;
  };
  /** Fixed for every space: ACES at this exposure. */
  readonly exposure: number;
  /** The generated environment that lights materials with no environment map of their own. */
  readonly environment: {
    /** `scene.environmentIntensity`. */
    readonly intensity: number;
    /** Colour temperature of the broad ceiling patches. */
    readonly ceilingKelvin: number;
    /** Colour temperature of the one dim window patch (near neutral). */
    readonly windowKelvin: number;
    /** Radiance of the window patch relative to a ceiling patch. */
    readonly windowWeight: number;
    /** Radiance of the faint warm floor patch relative to a ceiling patch. */
    readonly floorBounceWeight: number;
  };
  readonly atmosphere: AtmosphereProfile;
}

export const CORRIDOR_LOOK: LookProfile = {
  space: 'corridor',
  ao: { radius: 0.25, intensity: 0.4, quality: 'Low', distanceFalloff: 1, tint: '#7A5A3A' },
  bloom: { strength: 0.15, radius: 0.2, threshold: 1.1, mobile: { enabled: false, scale: 0.5 } },
  lut: { intensity: 0.3, mobileIntensity: 0.3 },
  vignette: { amount: 0.05, inner: 0.5 },
  grain: { amount: 0.03 },
  exposure: EXPOSURE,
  environment: { intensity: 0.15, ceilingKelvin: 3000, windowKelvin: 6500, windowWeight: 0.4, floorBounceWeight: 0.08 },
  atmosphere: ATMOSPHERES.corridor,
};

export const LANDING_LOOK: LookProfile = {
  space: 'landing',
  ao: { radius: 0.25, intensity: 0.38, quality: 'Low', distanceFalloff: 1, tint: '#7A5A3A' },
  bloom: { strength: 0.14, radius: 0.2, threshold: 1.1, mobile: { enabled: false, scale: 0.5 } },
  lut: { intensity: 0.3, mobileIntensity: 0.3 },
  vignette: { amount: 0, inner: 0.5 },
  grain: { amount: 0.03 },
  exposure: EXPOSURE,
  environment: { intensity: 0.12, ceilingKelvin: 3000, windowKelvin: 6500, windowWeight: 0.4, floorBounceWeight: 0.08 },
  atmosphere: ATMOSPHERES.landing,
};

export const OFFICE_LOOK: LookProfile = {
  space: 'office',
  ao: { radius: 0.3, intensity: 0.45, quality: 'Low', distanceFalloff: 1, tint: '#7A5A3A' },
  bloom: { strength: 0.16, radius: 0.2, threshold: 1.3, mobile: { enabled: false, scale: 0.5 } },
  lut: { intensity: 0.3, mobileIntensity: 0.7 },
  vignette: { amount: 0.05, inner: 0.5 },
  grain: { amount: 0.035 },
  exposure: EXPOSURE,
  environment: { intensity: 0.15, ceilingKelvin: 3000, windowKelvin: 6500, windowWeight: 0.55, floorBounceWeight: 0.08 },
  atmosphere: ATMOSPHERES.office,
};

export const LOOK_PROFILES: Readonly<Record<SpaceId, LookProfile>> = {
  corridor: CORRIDOR_LOOK,
  landing: LANDING_LOOK,
  office: OFFICE_LOOK,
};
