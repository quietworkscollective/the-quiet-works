import { Bucket, quad } from './builder.ts';
import { kelvinToLinear, type Rgb } from './colour.ts';
import { CORRIDOR } from '../layout.ts';
import { corridorSconceSlots } from './lighting.ts';
import type { Vec3 } from './math.ts';

/**
 * The far end of the corridor is a warm destination, not a void (founder feedback: a long still
 * corridor receding into dark is the horror image; the eye should travel toward warmth). Two
 * things survive the fog, because they are drawn without it:
 *
 *  - a door left ajar at the end wall, spilling 2900 K light onto the floor in a wedge;
 *  - a warm glow at every sconce beyond the doors, so the string of lights keeps its rhythm all
 *    the way to the vanishing point instead of fading into the haze one by one.
 *
 * All of it is flat, unlit and additive (or a plain bright quad): no lights, no shader code, one
 * draw call for the door's parts and one for the sconce glows.
 */

/** The doorway at the end wall: off the corridor's axis, so the view is not perfectly symmetrical. */
export const BEACON = {
  x: 0.42,
  width: 1.0,
  height: 2.3,
  kelvin: 2900,
  /** How far the light wedge reaches back down the corridor, metres. */
  spillDepth: 11,
  /** The wedge's width at the door and its widest, metres. */
  spillWidth: 3.0,
} as const;

/** Sconces nearer than this keep their own lamp glass and pool; beyond it the fog begins to take them. */
export const GLOW_FROM_Z = -17;

/** The glow beside each far sconce: width on the wall, metres. */
export const GLOW_SIZE = 1.5;

export interface GlowMount {
  position: Vec3;
  /** 0..1 of the full glow: the far ones are fainter, as they are smaller. */
  strength: number;
}

/** Where the sconce glows go: at each sconce beyond `GLOW_FROM_Z`, just off the wall, at lamp height. */
export function glowMounts(): GlowMount[] {
  const hw = CORRIDOR.width / 2;
  const span = CORRIDOR.farZ - GLOW_FROM_Z;
  return corridorSconceSlots(CORRIDOR.farZ)
    .filter((s) => s.z < GLOW_FROM_Z)
    .map((s) => ({
      position: [s.side === 'left' ? -hw + 0.28 : hw - 0.28, CORRIDOR.sconce.y, s.z] as Vec3,
      strength: 1 - 0.45 * ((s.z - GLOW_FROM_Z) / span),
    }));
}

/** The warm light of the doorway, linear. */
export function beaconColour(): Rgb {
  return kelvinToLinear(BEACON.kelvin);
}

/** The pieces of the far door, each in its own bucket so each can take its own material. */
export function buildBeacon(): { doorway: Bucket; leaf: Bucket; halo: Bucket; spill: Bucket } {
  const z = CORRIDOR.farZ + 0.04;
  const { x, width, height } = BEACON;
  const doorway = new Bucket();
  quad(doorway, [x - width / 2, 0, z], [x + width / 2, 0, z], [x + width / 2, height, z], [x - width / 2, height, z], undefined, [0, 0, 1]);

  // The leaf, left ajar toward the viewer: a dark slab narrowing the lit gap on its hinge side.
  const leaf = new Bucket();
  const lw = width * 0.3;
  const zl = z + 0.015;
  quad(leaf, [x - width / 2, 0, zl], [x - width / 2 + lw, 0, zl], [x - width / 2 + lw, height, zl], [x - width / 2, height, zl], undefined, [0, 0, 1]);

  // A soft halo around the opening, as light scatters in the dust over the threshold.
  const halo = new Bucket();
  const hz = z + 0.02;
  const hw = 3.4;
  const hh = 3.6;
  quad(halo, [x - hw / 2, 0, hz], [x + hw / 2, 0, hz], [x + hw / 2, hh, hz], [x - hw / 2, hh, hz], undefined, [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);

  // The wedge on the floor: bright at the door, widening and fading toward the viewer.
  const spill = new Bucket();
  const y = 0.012;
  const half = BEACON.spillWidth / 2;
  quad(spill, [x - half, y, z], [x + half, y, z], [x + half, y, z + BEACON.spillDepth], [x - half, y, z + BEACON.spillDepth], undefined, [0, 1, 0], [[0, 1], [1, 1], [1, 0], [0, 0]]);
  return { doorway, leaf, halo, spill };
}

/** One unit quad facing +z, for the instanced sconce glows. */
export function glowQuad(): Bucket {
  const b = new Bucket();
  const h = 0.5;
  quad(b, [-h, -h, 0], [h, -h, 0], [h, h, 0], [-h, h, 0], undefined, [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  return b;
}
