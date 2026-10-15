import { chamberById } from '@tqw/engine';
import type { DoorSpec } from '../../corridor/doorKit.ts';

const chamber = chamberById('outline-room');

export const DOOR: DoorSpec = {
  family: 'glazed-office',
  width: 2.2,
  height: 2.1,
  material: { primary: '#555C57', secondary: '#302E29', metal: '#9B794D', glazing: 'frosted' },
  handle: 'push-plate',
  topper: 'lamp',
  plaque: { text: chamber.plaque, code: 'BAY 06' },
  spill: { kelvin: 3500, colour: '#DDD5C8' },
  character: {
    note: 'Two low, wide smoked-glass leaves withdraw into paired blackened-brass pockets.',
    roughness: 0.52,
    frame: 'steel-insertion',
    lock: 'sliding-bolt',
    lamp: { kelvin: 3200, strength: 0.22 },
    history: 'polished',
    exposure: 0.03,
    marks: [],
    motif: 'gridded-glazing',
  },
};
