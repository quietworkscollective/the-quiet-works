import { chamberById } from '@tqw/engine';
import type { DoorSpec } from '../../corridor/doorKit.ts';

/**
 * A 1971 steel insertion into the building's older, taller opening: lower teal enamel panel,
 * upper wired glass, a closed service hatch and a plain brass lever. Opening it releases warm
 * desk light in a narrow floor wedge and a subdued mechanical hum.
 */
export const DOOR: DoorSpec = {
  family: 'steel-insertion',
  width: 1.05,
  height: 2.25,
  surround: { width: 1.45, height: 2.9 },
  material: { primary: '#3C7775', secondary: '#1E2326', metal: '#B08A4E', glazing: 'wired' },
  handle: 'lever',
  topper: 'lamp',
  plaque: { text: chamberById('certification-office').plaque, code: 'DEPT 07 · C/71' },
  hatch: { width: 0.28, height: 0.16, centreY: 1.3 },
  spill: { kelvin: 2900, colour: '#FFD7A0' },
  character: {
    note: 'Meticulously maintained institutional insertion: precise repainting around the service hatch.',
    roughness: 0.4,
    frame: 'steel-insertion',
    lock: 'lever',
    lamp: { kelvin: 3000, strength: 0.35 },
    history: 'repainted',
    exposure: 0.02,
    marks: [{ kind: 'stencil', text: 'APPLICANTS WAIT HERE' }],
    motif: 'gridded-glazing',
  },
};
