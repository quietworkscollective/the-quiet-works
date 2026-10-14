/**
 * The ranges art consult 6 gives for each finishing setting, as data. Profiles are held to them
 * by a test, and a space that needs to leave one has to change it here, in the open, with the
 * reason. A range is [lowest, highest], inclusive.
 */
export type Range = readonly [number, number];

export const LOOK_RANGES = {
  /** World-space radius of the contact shadow, in metres. */
  aoRadius: [0.15, 0.3],
  /**
   * N8AO's intensity: the occlusion is raised to this power, so a value in this range darkens the
   * most occluded pixels by roughly the fraction consult 6 calls the blend.
   */
  aoIntensity: [0.3, 0.45],
  bloomStrength: [0.12, 0.2],
  bloomRadius: [0.15, 0.25],
  /**
   * In HDR (linear, before tone mapping): only lamp cores cross it. The consult's floor was 1.2; the
   * corridor's sconce glass measures 1.2 to 1.3 there, so a threshold of 1.2 or more leaves it
   * without a glow, and the founder's reference wants the glow on lamp glass. 1.05 is the lowest
   * that still stays above anything a lit surface reaches (paper in a lamp pool is under 1).
   */
  bloomThreshold: [1.05, 1.8],
  /** How much of the grade is mixed in; 0 is the identity. */
  lutIntensity: [0.25, 0.4],
  /**
   * The grade on a phone, which has no air to lift its shadows. Measured at Pixel 7: the Office needs
   * about 0.7 to keep the deepest value band under an eighth of the frame, while a lifted room loses
   * that band altogether above about 0.4, so a space chooses within this range and a test holds the
   * lifted rooms near their desktop number.
   */
  mobileLutIntensity: [0.25, 0.8],
  /** Fraction of light lost in the corners of the frame. */
  vignetteAmount: [0.05, 0.08],
  grainAmount: [0.03, 0.06],
  /** Image-based light on the materials that have no environment map of their own. */
  environmentIntensity: [0.08, 0.25],
  /** Colour temperature of the broad ceiling patches in the generated environment. */
  ceilingKelvin: [2800, 3200],
} as const satisfies Record<string, Range>;

/** Exposure is fixed: ACES at 1.0, with the light repaired before the exposure is ever raised. */
export const EXPOSURE = 1;

/**
 * The N8AO quality presets a profile may name, with the samples each runs. Consult 6 asked for 8
 * to 16 denoise samples; the budget ruling (4 ms for the whole stack on a desktop) allows the two
 * cheaper presets, so a profile defaults to `Low` and `Medium` is a measured upgrade.
 */
export const AO_PRESETS = {
  Performance: { aoSamples: 8, denoiseSamples: 4 },
  Low: { aoSamples: 16, denoiseSamples: 4 },
  Medium: { aoSamples: 16, denoiseSamples: 8 },
} as const;

export type AoPreset = keyof typeof AO_PRESETS;

export const inRange = (value: number, [lo, hi]: Range): boolean => value >= lo && value <= hi;
