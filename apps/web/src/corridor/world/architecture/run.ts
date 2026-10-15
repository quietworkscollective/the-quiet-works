import { breaks, type Style } from '../builder.ts';
import type { Buckets } from '../buckets.ts';
import { nth, hash2 } from '../math.ts';
import { wallBox, wallGrid, type WallFrame, type WallHole } from './wall.ts';

/**
 * One solid stretch of wall between openings: plaster above the dado and oak panelling and
 * skirting below it (the cornice runs over the openings, so it is built separately). Detail steps down for the far corridor, where
 * the fog and distance hide mouldings: the geometry is still there, the beads are not.
 */
export interface RunOptions {
  frame: WallFrame;
  /** Ceiling height above the floor. */
  ceiling: number;
  dado: number;
  plasterStyle: Style;
  oakStyle: (grainAlong: boolean) => Style;
  /** Seed for this run's panel rhythm; runs differ in rhythm but not in construction. */
  index: number;
  detail: 'full' | 'far';
  /** Openings through the plaster above the dado (a high window); the panelling below is never cut. */
  holes?: readonly WallHole[];
}

const SKIRTING = 0.17;
const RAIL_LOW = 0.3;
const STILE = 0.07;
const PANEL_TARGET = 0.9;
const PLASTER_TRIM_OVERLAP = 0.025;
export const WALL_CEILING_OVERLAP = 0.04;

export function buildWallRun(b: Buckets, s0: number, s1: number, o: RunOptions): void {
  const length = s1 - s0;
  if (length < 0.02) return;
  const f = o.frame;
  const full = o.detail === 'full';
  // Far runs are seen from tens of metres in fog: no chamfers, which would only cost triangles.
  const bevel = (b: number): number => (full ? b : 0);

  // Plaster above the dado: breakpoints near the ceiling so the cove's contact shading has vertices.
  // Let the plaster sit just behind the oak cap instead of meeting it edge-to-edge. The overlap
  // closes a grazing-angle raster seam without changing the visible trim line.
  const ys = [o.dado - PLASTER_TRIM_OVERLAP, o.dado, o.dado + 0.35, o.dado + 1.0, o.ceiling - 1.0, o.ceiling - 0.55, o.ceiling - 0.28, o.ceiling + WALL_CEILING_OVERLAP];
  const holes = o.holes ?? [];
  // Grid lines fall on the edges of every opening, so its reveal and the plaster meet cleanly.
  const sBreaks = breaks(s0, s1, 1.0, holes.flatMap((h) => [h.s[0], h.s[1]]));
  const yEdges = [...ys, ...holes.flatMap((h) => [h.y[0], h.y[1]])].sort((p, q) => p - q);
  wallGrid(b.plaster, f, 0, sBreaks, yEdges.filter((y, i) => i === 0 || y > nth(yEdges, i - 1) + 1e-6), o.plasterStyle, holes);

  // Skirting: a plain board with a bead on its top edge.
  const long = o.oakStyle(true);
  wallBox(b.oak, f, [s0, s1], [0, SKIRTING], [0, 0.026], bevel(0.003), long);
  wallBox(b.oak, f, [s0, s1], [SKIRTING - 0.022, SKIRTING], [0, 0.036], bevel(0.003), long);

  // Dado cap rail and the small bead under it.
  const capY = o.dado;
  wallBox(b.oak, f, [s0, s1], [capY - 0.05, capY], [0, 0.05], bevel(0.004), long);
  wallBox(b.oak, f, [s0, s1], [capY - 0.07, capY - 0.05], [0, 0.034], bevel(0.003), long);

  // Panelling between the skirting and the cap: rails above and below, stiles between panels.
  const railTop = capY - 0.07;
  const panelBottom = RAIL_LOW;
  const upperRail = 0.12;
  const panelTop = railTop - upperRail;
  const upright = o.oakStyle(false);

  if (length < 0.32) {
    wallBox(b.oak, f, [s0, s1], [SKIRTING, railTop], [0, 0.03], bevel(0.003), upright);
    return;
  }
  let n = Math.max(1, Math.round(length / PANEL_TARGET));
  while (n > 1 && (length - STILE * (n + 1)) / n < 0.18) n -= 1;
  const panelWidth = (length - STILE * (n + 1)) / n;
  wallBox(b.oak, f, [s0, s1], [SKIRTING, panelBottom], [0, 0.03], bevel(0.003), long);
  wallBox(b.oak, f, [s0, s1], [panelTop, railTop], [0, 0.03], bevel(0.003), long);
  for (let i = 0; i <= n; i += 1) {
    const a = s0 + i * (STILE + panelWidth);
    wallBox(b.oak, f, [a, a + STILE], [panelBottom, panelTop], [0, 0.03], bevel(0.003), upright);
  }
  for (let i = 0; i < n; i += 1) {
    const a = s0 + STILE + i * (STILE + panelWidth);
    const c = a + panelWidth;
    // The field sits behind the frame; a tiny height jitter keeps panels from reading as stamped.
    const jitter = (hash2(o.index * 13 + i, 5) - 0.5) * 0.004;
    wallBox(b.oak, f, [a, c], [panelBottom, panelTop], [0, 0.012 + jitter], bevel(0.002), long);
    if (full) {
      const bead = 0.014;
      wallBox(b.oak, f, [a, c], [panelBottom, panelBottom + bead], [0, 0.024], bevel(0.002), long);
      wallBox(b.oak, f, [a, c], [panelTop - bead, panelTop], [0, 0.024], bevel(0.002), long);
      wallBox(b.oak, f, [a, a + bead], [panelBottom + bead, panelTop - bead], [0, 0.024], bevel(0.002), upright);
      wallBox(b.oak, f, [c - bead, c], [panelBottom + bead, panelTop - bead], [0, 0.024], bevel(0.002), upright);
    }
  }
}
