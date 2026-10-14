import { chamberById } from '@tqw/engine';
import type { DoorSpec } from '../../corridor/doorKit.ts';

export const DOOR: DoorSpec = {
  family: 'glazed-office',
  width: 0.95,
  height: 2.7,
  material: { primary: '#1C1A18', secondary: '#E6DCC7', metal: '#897044', glazing: 'none' },
  handle: 'push-plate',
  topper: 'lamp',
  plaque: { text: chamberById('exchange').plaque, code: 'ANNEX · BAY 06' },
  spill: { kelvin: 2900, colour: '#F2C995' },
  character: {
    note: 'A tall black lacquer door with cream enamel bands and a small engaged lamp.',
    roughness: 0.38,
    frame: 'painted-timber',
    lock: 'rim-lock',
    lamp: { kelvin: 3200, strength: 0.3 },
    history: 'polished',
    exposure: 0.03,
    marks: [],
    motif: 'round-aperture',
  },
};
