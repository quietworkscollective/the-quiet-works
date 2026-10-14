import { clamp01 } from '../math.ts';

/**
 * How much brighter a prop's ivory fitting is than at rest (ADR 0004, "Interactive cues").
 *  - `attention` (hover or focus) lightens the fitting: a visible but modest lift;
 *  - `glint` (the rare idle highlight, every 18-25 s) is the quietest cue and is capped at about
 *    8% local brightness, so it can never read as sparkle.
 * The result multiplies the fitting's vertex colour, so 0.08 is eight per cent brighter.
 */
export const ATTENTION_GAIN = 0.4;
export const GLINT_GAIN = 0.08;

export function fittingGain(attention: number, glint: number): number {
  return clamp01(attention) * ATTENTION_GAIN + clamp01(glint) * GLINT_GAIN;
}
