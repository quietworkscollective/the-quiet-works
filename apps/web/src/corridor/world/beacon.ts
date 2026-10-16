import { Bucket, quad } from './builder.ts';
import { kelvinToLinear, type Rgb } from './colour.ts';
import { CORRIDOR } from '../layout.ts';
import { CORRIDOR_END_Z, CORRIDOR_WINDOW } from './extent.ts';
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
  const span = CORRIDOR_END_Z - GLOW_FROM_Z;
  return corridorSconceSlots(CORRIDOR_END_Z)
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
export function buildBeacon(): {
  doorway: Bucket;
  leaf: Bucket;
  halo: Bucket;
  spill: Bucket;
  windowPane: Bucket;
  windowFrame: Bucket;
  floorBars: Bucket;
  wallBars: Bucket;
} {
  const z = CORRIDOR_END_Z + 0.04;
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

  // A low, off-axis window beside the door gives the far end a source that reads as a room, not a target.
  const windowPane = new Bucket();
  const windowFrame = new Bucket();
  const frameWidth = CORRIDOR_WINDOW.frame;
  const wx0 = CORRIDOR_WINDOW.x - CORRIDOR_WINDOW.width / 2;
  const wx1 = CORRIDOR_WINDOW.x + CORRIDOR_WINDOW.width / 2;
  const wy0 = CORRIDOR_WINDOW.bottom;
  const wy1 = CORRIDOR_WINDOW.bottom + CORRIDOR_WINDOW.height;
  const glassZ = CORRIDOR_END_Z + 0.035;
  const frameZ = CORRIDOR_END_Z + 0.055;
  quad(windowPane, [wx0, wy0, glassZ], [wx1, wy0, glassZ], [wx1, wy1, glassZ], [wx0, wy1, glassZ], undefined, [0, 0, 1]);
  const mullion = (xa: number, xb: number, ya: number, yb: number): void => {
    quad(windowFrame, [xa, ya, frameZ], [xb, ya, frameZ], [xb, yb, frameZ], [xa, yb, frameZ], undefined, [0, 0, 1]);
  };
  mullion(wx0 - frameWidth / 2, wx0 + frameWidth / 2, wy0 - frameWidth / 2, wy1 + frameWidth / 2);
  mullion(wx1 - frameWidth / 2, wx1 + frameWidth / 2, wy0 - frameWidth / 2, wy1 + frameWidth / 2);
  mullion(wx0, wx1, wy0 - frameWidth / 2, wy0 + frameWidth / 2);
  mullion(wx0, wx1, wy1 - frameWidth / 2, wy1 + frameWidth / 2);
  mullion(CORRIDOR_WINDOW.x - frameWidth * 0.42, CORRIDOR_WINDOW.x + frameWidth * 0.42, wy0, wy1);
  mullion(wx0, wx1, (wy0 + wy1) / 2 - frameWidth * 0.42, (wy0 + wy1) / 2 + frameWidth * 0.42);

  // Sunlight is a separate additive layer: soft bars reach the walked strip and rake the left wall.
  const floorBars = new Bucket();
  const patchNear = CORRIDOR_END_Z + 0.16;
  const patchFar = Math.min(CORRIDOR_END_Z + 8.2, CORRIDOR.innerDoorZ - 1);
  const patchHalfWidth = CORRIDOR.width / 2 - 0.34;
  quad(
    floorBars,
    [-patchHalfWidth, 0.016, patchFar],
    [patchHalfWidth, 0.016, patchFar],
    [patchHalfWidth, 0.016, patchNear],
    [-patchHalfWidth, 0.016, patchNear],
    undefined,
    [0, 1, 0],
    [[0, 0], [1, 0], [1, 1], [0, 1]],
  );
  const wallBars = new Bucket();
  const wallX = -CORRIDOR.width / 2 + 0.028;
  const wallNear = CORRIDOR_END_Z + 0.16;
  const wallFar = CORRIDOR_END_Z + 5.0;
  const low = 0.62;
  const high = Math.min(CORRIDOR.height - 0.45, 3.35);
  quad(
    wallBars,
    [wallX, low, wallFar],
    [wallX, low, wallNear],
    [wallX, high, wallNear],
    [wallX, high, wallFar],
    undefined,
    [1, 0, 0],
    [[0, 0], [0, 1], [1, 1], [1, 0]],
  );

  return { doorway, leaf, halo, spill, windowPane, windowFrame, floorBars, wallBars };
}

/** One unit quad facing +z, for the instanced sconce glows. */
export function glowQuad(): Bucket {
  const b = new Bucket();
  const h = 0.5;
  quad(b, [-h, -h, 0], [h, -h, 0], [h, h, 0], [-h, h, 0], undefined, [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  return b;
}
