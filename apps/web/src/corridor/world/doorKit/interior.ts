import { quad } from '../builder.ts';
import { createBuckets, type Buckets } from '../buckets.ts';
import { kelvinToLinear, mulRgb, type Rgb } from '../colour.ts';
import type { DoorSpec } from '../../doorKit.ts';
import { FRAME } from './frame.ts';

/**
 * A proxy for the room behind an open chamber's door, seen as the door swings: dark walls, a
 * dim floor, a pool of 2900 K desk light, a teal reflection and darkness beyond. It is only
 * what the camera sees for the second it takes to walk through the doorway, until the chamber's
 * own scene appears behind the jamb; it matches the Office's own staging (the lamp on the desk
 * ahead and to the left, the teal machine ahead and to the right) so the hand-over is seamless.
 *
 * Door-local space (see plan.ts): the room lies behind the wall, so z is negative.
 */

const FLOOR: Rgb = [0.012, 0.019, 0.02];
const WALL: Rgb = [0.006, 0.009, 0.01];
const CEILING: Rgb = [0.004, 0.006, 0.007];
const UV: readonly [readonly [number, number], readonly [number, number], readonly [number, number], readonly [number, number]] = [[0, 0], [1, 0], [1, 1], [0, 1]];

/** A soft elliptical pool on the floor, of the given colour, centred at (x, z) with half-sizes (rx, rz). */
function pool(b: Buckets, x: number, z: number, rx: number, rz: number, colour: Rgb, yaw = 0): void {
  const y = 0.004;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const p = (dx: number, dz: number): [number, number, number] => [x + dx * c - dz * s, y, z + dx * s + dz * c];
  quad(b.glow, p(-rx, rz), p(rx, rz), p(rx, -rz), p(-rx, -rz), { colour }, [0, 1, 0], UV);
}

/** A soft glow standing upright, facing the doorway (+z), for a lamp seen at a distance. */
function glow(b: Buckets, x: number, y: number, z: number, r: number, colour: Rgb): void {
  quad(b.glow, [x - r, y - r, z], [x + r, y - r, z], [x + r, y + r, z], [x - r, y + r, z], { colour }, [0, 0, 1], UV);
}

export function buildInterior(spec: DoorSpec): Buckets {
  const b = createBuckets();
  const kelvin = spec.spill?.kelvin ?? 2900;
  const warm = kelvinToLinear(kelvin);
  const teal: Rgb = [0.08, 0.34, 0.32];
  const x0 = -3.6;
  const x1 = 3.6;
  const zFront = -(FRAME.reveal + 0.01);
  const zBack = -7;
  const h = 3.2;

  // The room: floor, ceiling, two side walls and a back wall, faces inward, unlit and very dark.
  quad(b.lamp, [x0, 0, zFront], [x1, 0, zFront], [x1, 0, zBack], [x0, 0, zBack], { colour: FLOOR }, [0, 1, 0]);
  quad(b.lamp, [x0, h, zBack], [x1, h, zBack], [x1, h, zFront], [x0, h, zFront], { colour: CEILING }, [0, -1, 0]);
  quad(b.lamp, [x0, 0, zBack], [x0, 0, zFront], [x0, h, zFront], [x0, h, zBack], { colour: WALL }, [1, 0, 0]);
  quad(b.lamp, [x1, 0, zFront], [x1, 0, zBack], [x1, h, zBack], [x1, h, zFront], { colour: WALL }, [-1, 0, 0]);
  quad(b.lamp, [x0, 0, zBack], [x1, 0, zBack], [x1, h, zBack], [x0, h, zBack], { colour: WALL }, [0, 0, 1]);

  // The desk lamp's light on the floor: a long pool from the lamp ahead and to the left stretching
  // toward the doorway (a wedge, as seen through a door), with a hot core where the lamp stands.
  pool(b, -0.55, -2.15, 0.7, 1.95, mulRgb(warm, 0.42), -0.27);
  pool(b, -0.95, -3.7, 1.0, 0.75, mulRgb(warm, 0.6), 0.12);
  pool(b, -1.0, -3.85, 0.45, 0.35, mulRgb(warm, 0.8), 0.12);
  glow(b, -1.78, 1.12, -4.34, 0.34, mulRgb(warm, 1.5));
  glow(b, -1.78, 1.12, -4.34, 0.12, mulRgb(warm, 3.2));
  // The teal machine ahead on the right: only its colour is seen, as a soft glow and a reflection.
  glow(b, 1.02, 0.78, -4.54, 0.8, mulRgb(teal, 0.16));
  pool(b, 1.02, -4.1, 0.95, 0.95, mulRgb(teal, 0.28), -0.2);
  return b;
}
