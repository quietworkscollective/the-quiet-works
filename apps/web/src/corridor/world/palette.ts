import { CORRIDOR } from '../layout.ts';
import { linear } from './colour.ts';

/** The architecture's aged brass, as a vertex-colour tint (the brass material itself is white). */
export const BRASS_TINT = linear(CORRIDOR.colours.brass);

/**
 * The ambient fill's colour temperature. The contract's 4300 K is a neutral white; against the
 * 2700 K lamps it left the shadows grey-green, and founder feedback is that shadows read amber or
 * brown. 3400 K is a warm white; the ground bounce is warmer still.
 */
export const FILL_KELVIN = 3400;
export const GROUND_KELVIN = 2900;
