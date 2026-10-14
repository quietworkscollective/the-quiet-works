import { chamberById } from '@tqw/engine';
import type { DoorSpec } from '../../corridor/doorKit.ts';

/** A riveted 1928 plant-room door: iron, a wheel handle, a pressure gauge, sealed. */
export const DOOR: DoorSpec = {
  family: 'steel-insertion',
  width: 1.25,
  height: 2.6,
  surround: { width: 1.6, height: 3.0 },
  material: { primary: '#365D69', secondary: '#969C97', metal: '#8A6A44', glazing: 'porthole' },
  handle: 'wheel',
  topper: 'lamp',
  plaque: { text: chamberById('tomorrow-engine').plaque, code: 'PLANT 02 · 1928' },
  closure: 'seal',
  fittings: ['pressure-gauge', 'rivets'],
  character: {
    note: 'An industrial repair made permanent: riveted steel, a copper aperture, a handwheel with one replacement grip.',
    roughness: 0.6,
    frame: 'steel-insertion',
    lock: 'handwheel',
    lamp: { kelvin: 3400, strength: 0.35 },
    history: 'repaired',
    exposure: 0.07,
    marks: [{ kind: 'stencil', text: 'DO NOT STOP' }, { kind: 'stripe' }],
    motif: 'round-aperture',
  },
};
