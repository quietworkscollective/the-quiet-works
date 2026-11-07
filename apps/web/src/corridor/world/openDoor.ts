import { Bucket, quad } from './builder.ts';
import { holeOf } from './openings.ts';
import { cylinder, sphere, stud } from './shapes.ts';
import { CORRIDOR } from '../layout.ts';
import type { DoorSpec } from '../doorKit.ts';

/**
 * The sign of an open room, read from down the corridor. Doors sit in the side walls, so a walking
 * visitor sees them almost edge-on, and the corridor is amber throughout: light on a door's face is
 * foreshortened and a warm lamp joins the sconces. The signal therefore stands out from the wall on
 * a bracket and is lit in the building's teal, the one hue the amber does not contain. It is steady
 * and unanimated, and a sealed door has no lamp at all, so the state is never colour alone.
 */
export const OPEN_LAMP = {
  /** How far the bracket carries the lamp out from the wall, metres. */
  reach: 0.42,
  /** Height above the door's opening, metres; clears the door's own lamp and a walker's head. */
  aboveHole: 0.42,
  /** Keeps the bracket under the cornice on the tallest doors. */
  maxY: CORRIDOR.height - CORRIDOR.corniceDepth - 0.3,
  glassRadius: 0.075,
  /** Linear teal, over-bright so it reads as the source after tone mapping. */
  glass: [0.3, 2.6, 2.3],
  halo: { size: 1.3, strength: 0.75 },
  pool: { size: 3.0, strength: 0.34 },
} as const;

export interface OpenLampParts {
  fixture: Bucket;
  glass: Bucket;
  pool: Bucket;
}

/** The lamp's centre in the door's own frame: x along the wall, y up, z out into the corridor. */
export function openLampCentre(spec: DoorSpec): readonly [number, number, number] {
  return [0, Math.min(holeOf(spec).height + OPEN_LAMP.aboveHole, OPEN_LAMP.maxY), OPEN_LAMP.reach];
}

/** Every part of one door's lamp, in the door's own frame. */
export function buildOpenLamp(spec: DoorSpec): OpenLampParts {
  const [, y, z] = openLampCentre(spec);
  const fixture = new Bucket();
  stud(fixture, [0, y + 0.1, 0.012], 0.05, 0.056, 0.024, 16);
  cylinder(fixture, { at: [0, y + 0.1, z / 2], rot: [Math.PI / 2, 0, 0] }, 0.011, 0.011, z, 10);
  cylinder(fixture, { at: [0, y + 0.075, z] }, 0.011, 0.011, 0.05, 10);
  cylinder(fixture, { at: [0, y + 0.04, z] }, 0.018, 0.092, 0.05, 18);

  const glass = new Bucket();
  sphere(glass, { at: [0, y - 0.01, z] }, OPEN_LAMP.glassRadius, 18, 12);

  const uv: [[number, number], [number, number], [number, number], [number, number]] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const pool = new Bucket();
  const p = OPEN_LAMP.pool.size / 2;
  const floor = 0.004;
  quad(pool, [-p, floor, z + p], [p, floor, z + p], [p, floor, z - p + 0.3], [-p, floor, z - p + 0.3], undefined, [0, 1, 0], uv);

  return { fixture, glass, pool };
}
