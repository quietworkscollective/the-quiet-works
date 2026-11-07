import { fromSet } from '../stage.ts';
import type { AtmosphereLamp } from '../../../look/index.ts';

/**
 * Five real lights of the six the room may spend. The desk, ledge, under-desk and clerestory lights
 * never change, so they stay inside the bake's static hash. The operator light changes with state and
 * sits under a dynamic ancestor, which keeps it out of that hash. There is no hemisphere light.
 */
export const EXCHANGE_LIGHTING = {
  desk: { kelvin: 2700, intensity: 0.6, distance: 3.2, position: fromSet(-0.28, 5.47, 1.33) },
  ledge: { kelvin: 3000, intensity: 0.55, distance: 3, position: fromSet(-1.40, 8.38, 1.12) },
  underDesk: { kelvin: 2900, intensity: 0.5, distance: 2, position: fromSet(0.24, 5.50, 0.64) },
  clerestory: { kelvin: 5000, intensity: 14, distance: 12, position: fromSet(1.55, 6.40, 7.50) },
  operator: { kelvin: 2200, intensity: 0.14, distance: 1.4, position: fromSet(0.68, 5.66, 0.52) },
} as const;

export const EXCHANGE_LIGHT_COUNT = Object.keys(EXCHANGE_LIGHTING).length;

/**
 * Line lamps are emissive only, on dark glass. Levels are emissive drive, a fraction of `peak`; the
 * tone curve bends drive a long way before it reaches the screen, so these are set from measured
 * pixels (exchange-guards.spec.ts): on a 390 by 184 phone scene a dim lamp shows about a fifth of
 * CERTIFICATION's luminance and a night lamp under a tenth. Read on screen, that is the script's one
 * bright lamp among eleven at about 35%, and all twelve low at night.
 */
export const EXCHANGE_LAMP = {
  colour: '#FFB265',
  peak: 3,
  full: 1,
  dim: 0.1,
  night: 0.035,
} as const;

/** The open drawer sits a hand below the ledge lamp; its form takes this share of the paper's colour. */
export const EXCHANGE_FORM_TONE = 0.35;

export const EXCHANGE_OPERATOR_GLOW = { colour: '#FF9A3E', peak: 3.6, dark: 0.02 } as const;

export const EXCHANGE_AMBIENCE: readonly AtmosphereLamp[] = [
  { id: 'clerestory', kind: 'window', position: [1.82, 11.17, -5.18], direction: [-0.3, -0.84, -0.57] },
  { id: 'desk-pool', kind: 'desk-lamp', position: [-0.28, 1.325, -5.47], direction: [0, -1, 0] },
];
