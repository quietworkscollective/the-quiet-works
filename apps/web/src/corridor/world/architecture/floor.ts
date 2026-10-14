import { breaks, grid, quad, type Style } from '../builder.ts';
import type { Buckets } from '../buckets.ts';
import type { Rgb } from '../colour.ts';
import { CORRIDOR } from '../../layout.ts';
import { BRASS_TINT } from '../palette.ts';

/**
 * Terrazzo floors with a restrained border: a darker band along the walls, a single thin brass
 * inlay between band and field, and brass expansion joints across the bays. No runner. The
 * floor is a grid with breakpoints close to the walls so the baked contact shading has somewhere
 * to fall off.
 */

const UP: readonly [number, number, number] = [0, 1, 0];
/**
 * The terrazzo's contract colour (#535954) is a grey-green; in the shade of a lit room it read as
 * cold teal. Multiplied by this, it becomes a warm grey-brown (founder feedback: shadows are amber
 * or brown, never blue-grey or green). The material's own colour is untouched.
 */
export const FLOOR_WARMTH: Rgb = [1.18, 1.0, 0.78];

/** The border band is this much darker than the field. */
export const BORDER_TONE = 0.64;
const BORDER_WIDTH = 0.34;
const INLAY = 0.008;

/** A floor rectangle: x0..x1 by z0..z1 (z1 < z0 is fine: the corridor runs toward -z). */
function floorRect(
  b: Buckets,
  x: readonly [number, number],
  z: readonly [number, number],
  tone: number,
  shade: Style['shade'],
  zStep: number,
  nearEdges: readonly number[],
): void {
  const colour: Rgb = [tone * FLOOR_WARMTH[0], tone * FLOOR_WARMTH[1], tone * FLOOR_WARMTH[2]];
  const zLo = Math.min(z[0], z[1]);
  const zHi = Math.max(z[0], z[1]);
  const xs = breaks(x[0], x[1], 0.5, nearEdges);
  const zs = breaks(zLo, zHi, zStep);
  const style: Style = { colour, ...(shade ? { shade } : {}) };
  // Axes chosen so the normal is +y: x then z gives x cross z = -y, so run z then x.
  grid(b.terrazzo, [0, 0, 0], [0, 0, 1], [1, 0, 0], zs, xs, style);
}

function brassStrip(b: Buckets, x: readonly [number, number], z: readonly [number, number]): void {
  const y = 0.0015;
  quad(b.brass, [x[0], y, z[0]], [x[1], y, z[0]], [x[1], y, z[1]], [x[0], y, z[1]], { colour: BRASS_TINT }, UP);
}

export interface FloorOptions {
  shade: Style['shade'];
}

/** The corridor floor from the lobby's end wall to the far fog. */
export function buildCorridorFloor(b: Buckets, o: FloorOptions): void {
  const hw = CORRIDOR.width / 2;
  const zNear = CORRIDOR.innerDoorZ;
  const zFar = CORRIDOR.farZ;
  const edge = [-hw + 0.06, -hw + 0.15, -hw + 0.26, hw - 0.26, hw - 0.15, hw - 0.06];
  floorRect(b, [-hw, -hw + BORDER_WIDTH], [zNear, zFar], BORDER_TONE, o.shade, 1.8, edge);
  floorRect(b, [hw - BORDER_WIDTH, hw], [zNear, zFar], BORDER_TONE, o.shade, 1.8, edge);
  floorRect(b, [-hw + BORDER_WIDTH, hw - BORDER_WIDTH], [zNear, zFar], 1, o.shade, 1.8, []);
  // The inlay between band and field, and a joint across every bay boundary.
  brassStrip(b, [-hw + BORDER_WIDTH - INLAY / 2, -hw + BORDER_WIDTH + INLAY / 2], [zNear, zFar]);
  brassStrip(b, [hw - BORDER_WIDTH - INLAY / 2, hw - BORDER_WIDTH + INLAY / 2], [zNear, zFar]);
  for (let k = 1; zNear - CORRIDOR.bay * k > zFar; k += 1) {
    const z = zNear - CORRIDOR.bay * k;
    brassStrip(b, [-hw, hw], [z + 0.003, z - 0.003]);
  }
}

/** The lobby floor: a field inside a border band, joined to the corridor at the inner doors. */
export function buildLobbyFloor(b: Buckets, o: FloorOptions, halfWidth: number, zNear: number, zFar: number): void {
  const w = halfWidth;
  const band = 0.42;
  const edge = [-w + 0.06, -w + 0.16, -w + 0.3, w - 0.3, w - 0.16, w - 0.06];
  // Side bands, then the end bands, then the field.
  floorRect(b, [-w, -w + band], [zNear, zFar], BORDER_TONE, o.shade, 1.6, edge);
  floorRect(b, [w - band, w], [zNear, zFar], BORDER_TONE, o.shade, 1.6, edge);
  floorRect(b, [-w + band, w - band], [zFar - band, zFar], BORDER_TONE, o.shade, 1.6, []);
  floorRect(b, [-w + band, w - band], [zNear + band, zFar - band], 1, o.shade, 1.6, []);
  // Near end: the band stops at the inner-door opening so the floor runs on into the corridor.
  floorRect(b, [-w + band, w - band], [zNear, zNear + band], BORDER_TONE, o.shade, 1.6, []);
  brassStrip(b, [-w + band - INLAY / 2, -w + band + INLAY / 2], [zNear, zFar]);
  brassStrip(b, [w - band - INLAY / 2, w - band + INLAY / 2], [zNear, zFar]);
  brassStrip(b, [-w + band, w - band], [zFar - band - INLAY / 2, zFar - band + INLAY / 2]);
  brassStrip(b, [-w + band, w - band], [zNear + band - INLAY / 2, zNear + band + INLAY / 2]);
}
