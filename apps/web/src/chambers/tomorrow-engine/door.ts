import { chamberById } from '@tqw/engine';
import type { DoorSpec } from '../../corridor/doorKit.ts';

/** A steel-insertion door; the room's only exit is Leave. */
export const DOOR: DoorSpec = {
  family: 'steel-insertion',
  width: 1.25,
  height: 2.6,
  surround: { width: 1.6, height: 3.0 },
  // Machinery green, apart from the Office's teal (issue #22).
  material: { primary: '#4A5A3B', secondary: '#969C97', metal: '#8A6A44', glazing: 'porthole' },
  handle: 'wheel',
  topper: 'lamp',
  plaque: { text: chamberById('tomorrow-engine').plaque },
  spill: { kelvin: 3100, colour: '#FFCF9A' },
  fittings: ['pressure-gauge', 'rivets'],
  character: {
    note: 'An industrial repair made permanent: riveted steel, a copper aperture, a handwheel with one replacement grip.',
    roughness: 0.6,
    frame: 'steel-insertion',
    lock: 'handwheel',
    lamp: { kelvin: 3400, strength: 0.35 },
    history: 'repaired',
    exposure: 0.05,
    marks: [{ kind: 'stripe' }],
    motif: 'round-aperture',
  },
};
