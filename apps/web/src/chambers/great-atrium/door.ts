import { chamberById } from '@tqw/engine';
import type { DoorSpec } from '../../corridor/doorKit.ts';

/** Tall ceremonial double doors in bronze and glass, chained shut; cold air behind them. */
export const DOOR: DoorSpec = {
  family: 'ceremonial-double',
  width: 2.0,
  height: 3.1,
  // Statuary bronze, kept bright where hands go: its own finish, not the corridor's teal (issue #22).
  material: { primary: '#2B241D', secondary: '#6E5634', metal: '#897044', glazing: 'clear' },
  handle: 'ring-pull',
  topper: 'transom',
  plaque: { text: chamberById('great-atrium').plaque, code: 'WORKS 00' },
  closure: 'chain',
  character: {
    note: 'Public grandeur kept alive by maintenance: repaired lower rails, one carefully trained plant beside the frame.',
    roughness: 0.5,
    frame: 'ceremonial-double',
    lock: 'rim-lock',
    extraLock: 'padlock',
    lamp: { kelvin: 3100, strength: 0.3 },
    foliage: 'trained',
    history: 'polished',
    exposure: 0.02,
    marks: [],
    motif: 'gridded-glazing',
  },
};
