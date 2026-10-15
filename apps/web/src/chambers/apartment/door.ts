import type { DoorSpec } from '../../corridor/doorKit.ts';

/** An ordinary painted apartment door in a public corridor: brass 4, a doormat, and a transom. */
export const DOOR: DoorSpec = {
  family: 'panelled-timber',
  width: 0.9,
  height: 2.1,
  material: { primary: '#634D61', secondary: '#B4AA98', metal: '#897044', glazing: 'none' },
  handle: 'knob',
  topper: 'transom',
  plaque: null,
  spill: { kelvin: 2800, colour: '#FFD7A0' },
  fittings: ['number-4', 'doormat', 'letterbox'],
  character: {
    note: 'Domestic stubbornness inside civic architecture: the old number kept through successive coats.',
    roughness: 0.55,
    frame: 'painted-timber',
    lock: 'knob',
    lamp: { kelvin: 2800, strength: 0.2 },
    history: 'polished',
    exposure: 0.04,
    marks: [{ kind: 'decal-residue' }],
    motif: 'curved-joinery',
  },
};
