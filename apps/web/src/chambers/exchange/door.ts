import { chamberById } from '@tqw/engine';
import type { DoorSpec } from '../../corridor/doorKit.ts';

const LACQUER = '#1C1A18';
const ENAMEL = '#E6DCC7';
const BRASS = '#897044';

export const DOOR: DoorSpec = {
  family: 'glazed-office',
  handle: 'push-plate',
  topper: 'lamp',
  width: 0.95,
  height: 2.7,
  plaque: { code: 'ANNEX · BAY 06', text: chamberById('exchange').plaque },
  material: { glazing: 'none', primary: LACQUER, secondary: ENAMEL, metal: BRASS },
  spill: { colour: '#F2C995', kelvin: 2900 },
  character: {
    frame: 'painted-timber',
    lock: 'rim-lock',
    motif: 'round-aperture',
    history: 'polished',
    lamp: { strength: 0.3, kelvin: 3200 },
    roughness: 0.38,
    exposure: 0.03,
    marks: [],
    note: 'A tall black lacquer door with cream enamel bands and a small engaged lamp.',
  },
};
