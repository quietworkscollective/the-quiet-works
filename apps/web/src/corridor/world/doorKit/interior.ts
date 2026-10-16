import { quad } from '../builder.ts';
import { createBuckets, type Buckets } from '../buckets.ts';
import { kelvinToLinear, mulRgb, type Rgb } from '../colour.ts';
import type { DoorSpec } from '../../doorKit.ts';
import { FRAME } from './frame.ts';

/**
 * A proxy for the room behind a chamber's door: dark walls, a dim floor, a pool of 2900 K desk
 * light, a teal reflection and darkness beyond. It fills the wired glazing and the fine reveal
 * gaps while the leaf is closed, and remains behind the swinging door until the chamber's own
 * scene appears at the jamb. Its staging (the lamp ahead and to the left, the teal machine ahead
 * and to the right) makes the hand-over seamless.
 *
 * Door-local space (see plan.ts): the room lies behind the wall, so z is negative.
 */

const FLOOR: Rgb = [0.012, 0.019, 0.02];
const WALL: Rgb = [0.006, 0.009, 0.01];
const CEILING: Rgb = [0.004, 0.006, 0.007];
const OUTLINE_FLOOR: Rgb = [0.105, 0.072, 0.043];
const OUTLINE_WALL: Rgb = [0.12, 0.082, 0.047];
const OUTLINE_CEILING: Rgb = [0.062, 0.044, 0.028];
const OUTLINE_WOOD: Rgb = [0.028, 0.022, 0.018];
const OUTLINE_BRASS: Rgb = [0.26, 0.18, 0.08];
const OUTLINE_JOINT: Rgb = [0.025, 0.025, 0.023];
const OUTLINE_GLASS: Rgb = [0.055, 0.09, 0.095];
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

/** A narrow, flat strip in the open doorway's workshop silhouette. */
function stroke(b: Buckets, start: readonly [number, number], end: readonly [number, number], width: number, z: number, colour: Rgb): void {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy) || 1;
  const ox = (-dy / length) * width / 2;
  const oy = (dx / length) * width / 2;
  quad(
    b.lamp,
    [start[0] + ox, start[1] + oy, z],
    [end[0] + ox, end[1] + oy, z],
    [end[0] - ox, end[1] - oy, z],
    [start[0] - ox, start[1] - oy, z],
    { colour },
    [0, 0, 1],
  );
}

export function buildInterior(spec: DoorSpec, style: 'default' | 'outline-room' = 'default'): Buckets {
  const b = createBuckets();
  const floor = style === 'outline-room' ? OUTLINE_FLOOR : FLOOR;
  const wall = style === 'outline-room' ? OUTLINE_WALL : WALL;
  const ceiling = style === 'outline-room' ? OUTLINE_CEILING : CEILING;
  const kelvin = spec.spill?.kelvin ?? 2900;
  const warm = kelvinToLinear(kelvin);
  const teal: Rgb = [0.08, 0.34, 0.32];
  const x0 = -3.6;
  const x1 = 3.6;
  const zFront = -(FRAME.reveal + 0.01);
  const zBack = -7;
  const h = 3.2;

  // The room proxy stays visibly warm and softly finished as the door opens; it never becomes a
  // black or blue void while the room scene takes over behind it.
  quad(b.lamp, [x0, 0, zFront], [x1, 0, zFront], [x1, 0, zBack], [x0, 0, zBack], { colour: floor }, [0, 1, 0]);
  quad(b.lamp, [x0, h, zBack], [x1, h, zBack], [x1, h, zFront], [x0, h, zFront], { colour: ceiling }, [0, -1, 0]);
  quad(b.lamp, [x0, 0, zBack], [x0, 0, zFront], [x0, h, zFront], [x0, h, zBack], { colour: wall }, [1, 0, 0]);
  quad(b.lamp, [x1, 0, zFront], [x1, 0, zBack], [x1, h, zBack], [x1, h, zFront], { colour: wall }, [-1, 0, 0]);
  quad(b.lamp, [x0, 0, zBack], [x1, 0, zBack], [x1, h, zBack], [x0, h, zBack], { colour: wall }, [0, 0, 1]);

  if (style === 'outline-room') {
    // The open aperture shows a dim, warm workshop silhouette while the live room loads: bench,
    // ground-glass leaf, brass pantograph and its small oxblood follower grip.
    quad(b.lamp, [-1.4, 0.98, -4.55], [1.4, 0.98, -4.55], [1.4, 1.98, -4.55], [-1.4, 1.98, -4.55], { colour: OUTLINE_GLASS }, [0, 0, 1]);
    stroke(b, [-1.42, 0.96], [1.42, 0.96], 0.035, -4.52, OUTLINE_BRASS);
    stroke(b, [-1.42, 2.0], [1.42, 2.0], 0.035, -4.52, OUTLINE_BRASS);
    stroke(b, [-1.42, 0.96], [-1.42, 2.0], 0.035, -4.52, OUTLINE_BRASS);
    stroke(b, [1.42, 0.96], [1.42, 2.0], 0.035, -4.52, OUTLINE_BRASS);

    const pivots = [[-0.55, 1.12], [0.55, 1.12], [-0.55, 1.72], [0.55, 1.72]] as const;
    stroke(b, pivots[0], pivots[3], 0.055, -4.48, OUTLINE_BRASS);
    stroke(b, pivots[1], pivots[2], 0.055, -4.48, OUTLINE_BRASS);
    stroke(b, pivots[0], pivots[1], 0.045, -4.48, OUTLINE_BRASS);
    stroke(b, pivots[2], pivots[3], 0.045, -4.48, OUTLINE_BRASS);
    for (const [x, y] of pivots) {
      quad(b.lamp, [x - 0.075, y - 0.075, -4.46], [x + 0.075, y - 0.075, -4.46], [x + 0.075, y + 0.075, -4.46], [x - 0.075, y + 0.075, -4.46], { colour: OUTLINE_JOINT }, [0, 0, 1]);
      quad(b.lamp, [x - 0.027, y - 0.027, -4.44], [x + 0.027, y - 0.027, -4.44], [x + 0.027, y + 0.027, -4.44], [x - 0.027, y + 0.027, -4.44], { colour: OUTLINE_BRASS }, [0, 0, 1]);
    }
    stroke(b, [0.55, 1.73], [0.55, 1.9], 0.08, -4.42, [0.12, 0.028, 0.043]);

    // A shallow drawing bench anchors the instrument and catches a restrained pool of warm spill.
    quad(b.lamp, [-1.5, 0.86, -3.35], [1.5, 0.86, -3.35], [1.5, 0.86, -4.2], [-1.5, 0.86, -4.2], { colour: OUTLINE_WOOD }, [0, 1, 0]);
    quad(b.lamp, [-1.43, 0.48, -3.38], [1.43, 0.48, -3.38], [1.43, 0.82, -3.38], [-1.43, 0.82, -3.38], { colour: OUTLINE_WOOD }, [0, 0, 1]);
    stroke(b, [-1.35, 0.84], [1.35, 0.84], 0.025, -3.33, OUTLINE_BRASS);
    const ivory: Rgb = [0.2, 0.19, 0.17];
    quad(b.lamp, [-0.65, 0.875, -3.62], [-0.25, 0.875, -3.62], [-0.25, 0.89, -3.82], [-0.65, 0.89, -3.82], { colour: ivory }, [0, 1, 0]);

    // The proxy carries the real room's task lamp and warm bounce, rather than a grey hold screen.
    const lampX = 0.82;
    const lampY = 2.63;
    const lampZ = -4.12;
    stroke(b, [lampX, 3.08], [lampX, 2.82], 0.028, lampZ, OUTLINE_BRASS);
    stroke(b, [lampX - 0.22, lampY + 0.11], [lampX + 0.22, lampY + 0.11], 0.045, lampZ + 0.025, OUTLINE_WOOD);
    quad(b.lamp,
      [lampX - 0.2, lampY - 0.07, lampZ + 0.03],
      [lampX + 0.2, lampY - 0.07, lampZ + 0.03],
      [lampX + 0.2, lampY + 0.07, lampZ + 0.03],
      [lampX - 0.2, lampY + 0.07, lampZ + 0.03],
      { colour: [0.78, 0.64, 0.42] }, [0, 0, 1]);
    stroke(b, [lampX - 0.26, lampY - 0.1], [lampX + 0.26, lampY - 0.1], 0.018, lampZ + 0.035, OUTLINE_BRASS);
    glow(b, lampX, lampY, lampZ + 0.04, 0.34, mulRgb(warm, 1.4));
    glow(b, lampX, lampY, lampZ + 0.05, 0.13, mulRgb(warm, 2.8));
    glow(b, 0.2, 1.85, zBack + 0.02, 1.45, mulRgb(warm, 0.42));
    pool(b, 0.48, -4.15, 1.25, 1.55, mulRgb(warm, 0.36), -0.08);
  }

  // The desk lamp's light on the floor: a long pool from the lamp ahead and to the left stretching
  // toward the doorway (a wedge, as seen through a door), with a hot core where the lamp stands.
  pool(b, -0.55, -2.15, 0.7, 1.95, mulRgb(warm, 0.42), -0.27);
  pool(b, -0.95, -3.7, 1.0, 0.75, mulRgb(warm, 0.6), 0.12);
  pool(b, -1.0, -3.85, 0.45, 0.35, mulRgb(warm, 0.8), 0.12);
  glow(b, -1.78, 1.12, -4.34, 0.34, mulRgb(warm, 1.5));
  glow(b, -1.78, 1.12, -4.34, 0.12, mulRgb(warm, 3.2));
  if (style === 'default') {
    // The teal machine is a specific Office signature; other rooms use their own neutral proxy.
    glow(b, 1.02, 0.78, -4.54, 0.8, mulRgb(teal, 0.16));
    pool(b, 1.02, -4.1, 0.95, 0.95, mulRgb(teal, 0.28), -0.2);
  } else {
    glow(b, 0.82, 1.18, -4.24, 0.28, mulRgb(warm, 0.58));
  }
  return b;
}
