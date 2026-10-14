import type { DoorSpec } from '../../doorKit.ts';
import { CORRIDOR } from '../../layout.ts';

/**
 * The lobby's own two pairs of doors, described with the same DoorSpec the chambers use so they
 * are built by the same kit: the inner pair at the end wall (already open, framing the corridor)
 * and the entrance pair in the back wall (closed, behind the visitor).
 */

const OAK = CORRIDOR.colours.oak;
const BRASS = CORRIDOR.colours.brass;

/** Tall oak double doors, glazed above, standing open into the lobby. */
export const INNER_DOORS: DoorSpec = {
  family: 'ceremonial-double',
  width: 2.6,
  height: 3.1,
  material: { primary: OAK, metal: BRASS, glazing: 'reeded' },
  handle: 'push-plate',
  topper: 'lamp',
  plaque: null,
};

/** The building's street doors: oak and glass with ring pulls and a fanlight, shut for the night. */
export const ENTRANCE_DOORS: DoorSpec = {
  family: 'ceremonial-double',
  width: 1.9,
  height: 3.0,
  material: { primary: OAK, metal: BRASS, glazing: 'clear' },
  handle: 'ring-pull',
  topper: 'transom',
  plaque: null,
};

/** How far the inner pair stands open into the lobby, degrees from closed. */
export const INNER_OPEN_DEG = 100;
