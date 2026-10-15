import { chamberById } from '@tqw/engine';
import type { DoorSpec } from '../../corridor/doorKit.ts';

const chamber = chamberById('outline-room');

export const DOOR: DoorSpec = {
  family: 'glazed-office',
  width: 1.1,
  height: 2.35,
  material: { primary: '#743E49', secondary: '#DDD5C8', metal: '#897044', glazing: 'frosted' },
  handle: 'lever',
  topper: 'lamp',
  plaque: { text: chamber.plaque, code: 'AN-01' },
  spill: { kelvin: 3500, colour: '#DDD5C8' },
  character: {
    note: 'A red instrument-workshop door repaired around its glazing beads.',
    roughness: 0.64,
    frame: 'retained-oak',
    lock: 'rim-lock',
    lamp: { kelvin: 3000, strength: 0.35 },
    history: 'repaired',
    exposure: 0.04,
    marks: [{ kind: 'stripe' }, { kind: 'stencil', text: 'OUTSIDE EDGE' }],
    motif: 'gridded-glazing',
  },
};
