import { quad } from '../builder.ts';
import type { Buckets } from '../buckets.ts';
import { LOBBY } from '../../layout.ts';
import { BRASS_TINT } from '../palette.ts';
import { cylinder, stud } from '../shapes.ts';
import { LOBBY_FRAMES } from './lobby.ts';
import { BENCH_ZONE } from './lobbyPlan.ts';
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

/**
 * A long oak waiting bench against the lobby's right wall by the entrance, under a sconce: slatted seat,
 * a low slatted back, cast-iron end frames. It is the one piece of furniture in the lobby, and the
 * only sign that people have ever waited here.
 */
export const BENCH = { ...BENCH_ZONE, seatY: 0.46, depth: 0.46 } as const;

export function buildBench(b: Buckets): void {
  const f = LOBBY_FRAMES.right;
  const oak = { colour: [1.65, 1.4, 1.15] as const };
  const iron = { colour: [1, 1, 1] as const };
  const { z0, z1, seatY, depth } = BENCH;
  const front = 0.06 + depth;
  // Seat: five slats with a finger's gap between them.
  const slats = 5;
  const gap = 0.012;
  const slat = (depth - gap * (slats - 1)) / slats;
  for (let i = 0; i < slats; i += 1) {
    const d0 = 0.06 + i * (slat + gap);
    wallBox(b.oak, f, [z0, z1], [seatY - 0.034, seatY], [d0, d0 + slat], 0.003, oak);
  }
  // Back: three slats leaning against the wall's dado cap.
  for (let i = 0; i < 3; i += 1) {
    const y0 = seatY + 0.1 + i * 0.105;
    wallBox(b.oak, f, [z0 + 0.02, z1 - 0.02], [y0, y0 + 0.088], [0.055, 0.088], 0.003, oak);
  }
  // End frames: a cast side, two legs and a bracket up to the back.
  for (const s of [z0 + 0.06, z1 - 0.06]) {
    wallBox(b.iron, f, [s - 0.018, s + 0.018], [0, seatY - 0.034], [0.07, 0.1], 0.003, iron);
    wallBox(b.iron, f, [s - 0.018, s + 0.018], [0, seatY - 0.034], [front - 0.07, front - 0.04], 0.003, iron);
    wallBox(b.iron, f, [s - 0.018, s + 0.018], [seatY - 0.07, seatY - 0.034], [0.07, front - 0.04], 0.003, iron);
    wallBox(b.iron, f, [s - 0.018, s + 0.018], [seatY, seatY + 0.34], [0.05, 0.075], 0.003, iron);
  }
}
