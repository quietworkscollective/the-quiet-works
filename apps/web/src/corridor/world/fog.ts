import { CORRIDOR } from '../layout.ts';

/**
 * The corridor's fog curve. three's linear fog (smoothstep between near and far) puts only about
 * 38% at the half distance and a hard edge at `far`; the art direction wants negligible haze
 * before 12 m, about 50% at 28 m and 90% by 50 m, and a soft fade after. A Weibull-style
 *   1 - exp(-a * (d - near)^p)
 * passes through both targets exactly, so the curve is solved from CORRIDOR.fog, not hand-tuned.
 */
const { near, half, far } = CORRIDOR.fog;

/** Fraction of the fog colour at the "far" distance. */
export const FOG_AT_FAR = 0.9;

export const FOG_POWER = Math.log(Math.log(1 / (1 - FOG_AT_FAR)) / Math.log(2)) / Math.log((far - near) / (half - near));
export const FOG_RATE = Math.log(2) / Math.pow(half - near, FOG_POWER);

/** Fog amount in [0, 1] at view distance `d` metres. Static: it never drifts. */
export function fogAt(d: number): number {
  if (d <= near) return 0;
  return 1 - Math.exp(-FOG_RATE * Math.pow(d - near, FOG_POWER));
}

/**
 * The fog and background colour: a warm dark brown, not the contract's blue-grey #20282A. Founder
 * feedback on the first full view was that a long, still corridor running into blue-black reads as
 * creepy; shadow and distance now stay amber-brown, so the far end is a warm haze the eye can
 * travel into. The fog curve (distances) is unchanged. layout.ts still names #20282A; this file
 * overrides it for the world only.
 */
export const FOG_COLOUR = '#4A3524';
