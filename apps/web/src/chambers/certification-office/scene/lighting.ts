import { Color } from 'three';
import { kelvinToLinear } from '../../../look/colour.ts';

export const DESK_KELVIN = 2900;
export const SUN_KELVIN = 3100;
export const DESK_LIGHT_COLOUR = new Color().setRGB(...kelvinToLinear(DESK_KELVIN));
export const SUN_LIGHT_COLOUR = new Color().setRGB(...kelvinToLinear(SUN_KELVIN));
