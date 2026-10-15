import { quad } from '../builder.ts';
import type { Buckets } from '../buckets.ts';
import { LOBBY } from '../../layout.ts';
import { BRASS_TINT } from '../palette.ts';
import { cylinder, stud } from '../shapes.ts';
import { LOBBY_FRAMES } from './lobby.ts';
import { HALL_TABLE } from './lobbyPlan.ts';
import { at, wallBox } from './wall.ts';

/**
 * Fixed furniture of the lobby that is not a door and not the board: the lettered fascia over
 * the inner doors, and the brass picture light that rakes it.
 */

/** The lettering sits at LOBBY.lettering: its centre height and the plane just off the end wall. */
export const FASCIA = {
  width: 1.9,
  /** Frame bar width, and the depth the frame stands off the wall. */
  bar: 0.032,
  depth: 0.05,
} as const;

/** The fascia's lacquer panel: its width and the height that matches the lettering canvas. */
export function fasciaPanel(aspect: number): { width: number; height: number } {
  return { width: FASCIA.width, height: FASCIA.width / aspect };
}

export function buildFascia(b: Buckets, aspect: number): void {
  const f = LOBBY_FRAMES.end;
  const { width, height } = fasciaPanel(aspect);
  const cy = LOBBY.lettering.y;
  const bar = FASCIA.bar;
  const s0 = -width / 2 - bar;
  const s1 = width / 2 + bar;
  const y0 = cy - height / 2 - bar;
  const y1 = cy + height / 2 + bar;
  const d: readonly [number, number] = [0, FASCIA.depth];
  const oak = { colour: [1.5, 1.28, 1.05] as const };
  wallBox(b.oak, f, [s0, s1], [y0, y0 + bar], d, 0.004, oak);
  wallBox(b.oak, f, [s0, s1], [y1 - bar, y1], d, 0.004, oak);
  wallBox(b.oak, f, [s0, s0 + bar], [y0 + bar, y1 - bar], d, 0.004, oak);
  wallBox(b.oak, f, [s1 - bar, s1], [y0 + bar, y1 - bar], d, 0.004, oak);
  // The panel sits just behind the frame's face; LOBBY.lettering.z is the plane it is read on.
  const depth = LOBBY.lettering.z - f.origin[2];
  const p = (s: number, y: number) => at(f, depth, y, s);
  quad(b.lettering, p(-width / 2, cy - height / 2), p(width / 2, cy - height / 2), p(width / 2, cy + height / 2), p(-width / 2, cy + height / 2), undefined, f.normal, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  // A narrow cap moulding over the frame, so the fascia reads as a made object.
  wallBox(b.oak, f, [s0 - 0.02, s1 + 0.02], [y1, y1 + 0.022], [0, FASCIA.depth + 0.02], 0.003, oak);

  // The picture light: a brass tube on two swan arms, over the cap moulding.
  const metal = { colour: BRASS_TINT };
  const ly = y1 + 0.17;
  const lz = f.origin[2] + 0.19;
  cylinder(b.brass, { at: [0, ly, lz], rot: [0, 0, Math.PI / 2] }, 0.0155, 0.0155, 0.56, 18, metal);
  for (const sx of [-0.27, 0.27]) {
    stud(b.brass, [sx, ly - 0.05, f.origin[2] + 0.1], 0.0075, 0.0075, 0.2, 8, metal);
    cylinder(b.brass, { at: [sx, ly - 0.085, f.origin[2] + 0.01] }, 0.012, 0.012, 0.16, 10, metal);
    stud(b.brass, [sx, ly, lz], 0.021, 0.021, 0.02, 14, metal);
  }
}

/** A narrow oak hall table, fixed against the left wall below the banker lamp. */
export function buildHallTable(b: Buckets): void {
  const f = LOBBY_FRAMES.left;
  const oak = { colour: [1.65, 1.4, 1.15] as const };
  const { z0, z1, depth, topY } = HALL_TABLE;
  wallBox(b.oak, f, [z0, z1], [topY - 0.045, topY], [0.035, depth], 0.003, oak);
  wallBox(b.oak, f, [z0 + 0.035, z1 - 0.035], [topY - 0.18, topY - 0.045], [0.09, depth - 0.05], 0.003, oak);
  for (const s of [z0 + 0.065, z1 - 0.065]) {
    for (const [d0, d1] of [[0.055, 0.115], [depth - 0.11, depth - 0.05]] as const) {
      wallBox(b.oak, f, [s - 0.025, s + 0.025], [0, topY - 0.045], [d0, d1], 0.002, oak);
    }
  }
}
