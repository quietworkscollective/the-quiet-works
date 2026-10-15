import { CORRIDOR } from '../layout.ts';

/** The corridor's distant end is dressed as a warm destination beyond the visitor's walkable route. */
export const CORRIDOR_END_BAYS = 13;

/** The amber window at the distant end gives the corridor a visible source beside its open door. */
export const CORRIDOR_WINDOW = {
  x: -1.0,
  width: 0.9,
  bottom: 0.78,
  height: 1.48,
  frame: 0.055,
  kelvin: 2900,
} as const;

/** The far wall closes the fully built corridor after thirteen complete bays. */
export const CORRIDOR_END_Z = CORRIDOR.innerDoorZ - CORRIDOR.bay * CORRIDOR_END_BAYS;
