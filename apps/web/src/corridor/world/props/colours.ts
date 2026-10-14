import { CORRIDOR } from '../../layout.ts';
import { linear, mulRgb, type Rgb } from '../colour.ts';
import { BRASS_TINT } from '../palette.ts';

/**
 * The props' colours, as linear-light vertex tints. Each channel reads its tint differently, which
 * is why these are helpers and not constants:
 *  - wood: the corridor's oak material already averages the dark oak, so a tint is the ratio of the
 *    wood wanted to that oak (walnut, pine, ebony and pale willow all share one grain);
 *  - metal: the material is white metal, so the tint is the metal's colour;
 *  - everything else: the tint is the albedo.
 */

const OAK = linear(CORRIDOR.colours.oak);

/** A timber of the given colour, as a tint on the corridor's oak grain. */
export function wood(hex: string): Rgb {
  const c = linear(hex);
  return [c[0] / OAK[0], c[1] / OAK[1], c[2] / OAK[2]];
}

export { linear, mulRgb };

/** The building's own brass, and brighter and cooler metals for the things people polished. */
export const METAL = {
  brass: BRASS_TINT,
  /** Brass that someone has looked after. */
  polished: linear('#B8995A'),
  gold: linear('#C9A257'),
  silver: linear('#D2D6D8'),
  /** Silver gone grey at the creases. */
  tarnishedSilver: linear('#8C9092'),
  /** Galvanised steel: pale, slightly blue. */
  galvanised: linear('#A3A9AA'),
  iron: linear('#3B4042'),
  steel: linear('#8F9596'),
} as const;

/** Bone and ivory: the colour of every fitting a hand is meant to find. */
export const IVORY = linear('#E3DAC3');

export const INK = linear('#1B1E20');
export const WHITE = linear('#F1EBDD');
