import { Matrix4 } from 'three';
import { quad } from './builder.ts';
import { ART, ART_ATLAS, quadUvs, uvRect } from './artLayout.ts';
import { placeLocal, type Buckets } from './buckets.ts';
import { LOBBY } from '../layout.ts';
import { at, wallBox, wallQuad, type WallFrame } from './architecture/wall.ts';
import { cylinder, sphere } from './shapes.ts';
import { BRASS_TINT } from './palette.ts';
import { BOARD_HINGE_CLEARANCE_M } from '../boardGeometry.ts';

/**
 * The notice board in the lobby (contract: LOBBY.board): a 1.25 x 0.85 m oak frame, 35 mm, round
 * olive felt, brass pins, one glazed archival sleeve and one clipping per chamber. It is hinged
 * at its entrance-side edge and swivelled `swivelDeg` toward the entrance (ADR 0004), so it faces
 * the visitor who has just come in; its free edge stands off the wall and is closed by an oak
 * plank, which makes the whole thing a canted cabinet door of a board. This module holds the
 * layout and the static geometry; Board.tsx makes the clippings clickable and moves the paper.
 *
 * Board coordinates: u along the board to the visitor's right, v up, both from the board's
 * centre; depth out of the board's own back plane. The board-local frame (depth, y, s) is
 * `BOARD_FRAME`, where s runs along the board toward the entrance (s = -u); `boardMatrix` takes it
 * to the world.
 */

/** Depths from the board's back plane. The frame stands 35 mm out; clippings lie on the felt. */
export const BOARD_DEPTH = { back: 0, felt: 0.014, clipping: 0.0158, frontOfFrame: 0.035 } as const;

/** The back of the board stands this far off the lobby wall at its hinged end (the dado cap is 50 mm). */
export const HINGE_CLEARANCE = BOARD_HINGE_CLEARANCE_M;

export const CLIPPING_SIZE = 0.22;

export interface ClippingPlacement {
  /** Index into CHAMBERS. */
  chamberIndex: number;
  u: number;
  v: number;
  /** Rotation about the board's normal, degrees; within +-2 by the art direction. */
  tiltDeg: number;
}

export const CLIPPINGS: readonly ClippingPlacement[] = [
  { chamberIndex: 0, u: -0.43, v: 0.25, tiltDeg: 1.4 },
  { chamberIndex: 1, u: -0.17, v: 0.25, tiltDeg: -1.1 },
  { chamberIndex: 2, u: -0.43, v: 0, tiltDeg: -1.7 },
  { chamberIndex: 3, u: -0.17, v: 0, tiltDeg: 1.9 },
  { chamberIndex: 4, u: -0.43, v: -0.25, tiltDeg: -0.8 },
  { chamberIndex: 5, u: -0.17, v: -0.25, tiltDeg: 0.9 },
];

/** The glazed archival sleeve holding a plan, on the right of the board. */
export const SLEEVE = { u: 0.355, v: 0.035, w: 0.3, h: 0.4 } as const;

/**
 * The office-hours card pinned under the sleeve (ADR 0004): it says whether the Office is open by
 * the visitor's own clock, so it is lettered in two states and one is shown.
 */
export const HOURS_CARD = { u: 0.355, v: -0.31, w: 0.3, h: 0.1 } as const;

/** The pin that carries the idle highlight at hand-over: the top pin of the first clipping. */
export const GLINT_PIN = { clipping: 0 } as const;

/** The board's own frame: normal out of the face, `along` toward the entrance, origin at the back plane's centre. */
export const BOARD_FRAME: WallFrame = { normal: [1, 0, 0], along: [0, 0, 1], origin: [0, 0, 0] };

export const BOARD_SWIVEL = (LOBBY.board.swivelDeg * Math.PI) / 180;

/**
 * Where the board's local origin is in the world. The hinged edge (s = +w/2, toward the entrance)
 * keeps `HINGE_CLEARANCE` from the wall; the board turns about it, so the free edge (s = -w/2)
 * stands off by w sin(swivel).
 */
export const BOARD_ORIGIN: readonly [number, number, number] = [
  -LOBBY.width / 2 + HINGE_CLEARANCE + (LOBBY.board.width / 2) * Math.sin(BOARD_SWIVEL),
  LOBBY.board.y,
  LOBBY.board.z,
];

/** Board-local (depth, y, s) to world: the swivel about the vertical, then the origin. */
export function boardMatrix(): Matrix4 {
  return new Matrix4().makeRotationY(-BOARD_SWIVEL).setPosition(...BOARD_ORIGIN);
}

/** A point at (u, v) on the board, `depth` out of its back plane, in the world. */
export function boardToWorld(u: number, v: number, depth: number): [number, number, number] {
  const p = at(BOARD_FRAME, depth, v, -u);
  const m = boardMatrix().elements;
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
  const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
  return [x, y, z];
}

/** The same point in board-local (depth, y, s), for geometry built in the board's own frame. */
const local = (u: number, v: number, depth: number): [number, number, number] => {
  const p = at(BOARD_FRAME, depth, v, -u);
  return [p[0], p[1], p[2]];
};

/** How far the free edge stands off the wall, along the board's normal: the plank that closes it. */
export const FREE_EDGE_STANDOFF = (LOBBY.board.width * Math.sin(BOARD_SWIVEL) + HINGE_CLEARANCE) / Math.cos(BOARD_SWIVEL) + 0.03;

/** Static parts: frame, felt, the sleeve, brass pins (but the glint pin), hinges, the closing plank, the picture light. */
export function buildBoardStatic(b: Buckets): void {
  placeLocal(b, boardMatrix(), buildLocal);
}

function buildLocal(b: Buckets): void {
  const f = BOARD_FRAME;
  const { width, height, frame } = LOBBY.board;
  const s0 = -width / 2;
  const s1 = width / 2;
  const y0 = -height / 2;
  const y1 = height / 2;
  const d: readonly [number, number] = [BOARD_DEPTH.back, BOARD_DEPTH.frontOfFrame];
  const oak = { colour: [1.5, 1.28, 1.05] as const };
  // Oak frame: four bars, bevelled; an inner lip keeps the felt a few mm behind its face.
  wallBox(b.oak, f, [s0, s1], [y0, y0 + frame], d, 0.004, oak);
  wallBox(b.oak, f, [s0, s1], [y1 - frame, y1], d, 0.004, oak);
  wallBox(b.oak, f, [s0, s0 + frame], [y0 + frame, y1 - frame], d, 0.004, oak);
  wallBox(b.oak, f, [s1 - frame, s1], [y0 + frame, y1 - frame], d, 0.004, oak);
  const lip = 0.008;
  const lipD: readonly [number, number] = [BOARD_DEPTH.back, BOARD_DEPTH.felt + 0.004];
  wallBox(b.oak, f, [s0 + frame, s1 - frame], [y0 + frame, y0 + frame + lip], lipD, 0.002, oak);
  wallBox(b.oak, f, [s0 + frame, s1 - frame], [y1 - frame - lip, y1 - frame], lipD, 0.002, oak);
  wallBox(b.oak, f, [s0 + frame, s0 + frame + lip], [y0 + frame + lip, y1 - frame - lip], lipD, 0.002, oak);
  wallBox(b.oak, f, [s1 - frame - lip, s1 - frame], [y0 + frame + lip, y1 - frame - lip], lipD, 0.002, oak);
  // Felt: it faces out of the board (the frame's own normal), seen from the entrance side.
  wallQuad(b.felt, f, BOARD_DEPTH.felt, [s0 + frame, s1 - frame], [y0 + frame, y1 - frame], { uv: { du: 0.13, dv: 0.41 } });

  // The free edge, at s = -w/2, is closed by a plank running back to the wall; the hinged edge is
  // 56 mm off the wall and needs none. Two more planks (top and bottom) are hidden above and below the eye.
  const plank = FREE_EDGE_STANDOFF;
  wallBox(b.oak, f, [s0 - 0.014, s0 + 0.002], [y0, y1], [-plank, BOARD_DEPTH.frontOfFrame], 0.003, oak);

  // Hinges at the entrance edge: two brass knuckles on the back corner, leaves on board and wall.
  const metal = { colour: BRASS_TINT };
  for (const v of [-0.27, 0.27]) {
    cylinder(b.brass, { at: [-0.012, v, s1 + 0.004] }, 0.0095, 0.0095, 0.12, 10, metal);
    wallBox(b.brass, f, [s1 - 0.03, s1 + 0.006], [v - 0.06, v + 0.06], [-0.004, 0.0], 0.001, metal);
    wallBox(b.brass, f, [s1 + 0.004, s1 + 0.034], [v - 0.06, v + 0.06], [-0.052, -0.048], 0.001, metal);
  }

  // The sleeve: a plan drawing behind a clear polyester pane, held by four brass corner pins.
  const sleeve = SLEEVE;
  const corner = (u: number, v: number, depth: number) => local(sleeve.u + u, sleeve.v + v, depth);
  const hw = sleeve.w / 2;
  const hh = sleeve.h / 2;
  const artDepth = BOARD_DEPTH.clipping;
  const planUv = quadUvs(uvRect(ART.plan, ART_ATLAS.width, ART_ATLAS.height));
  // Viewer's right is -s, so a quad listed (left, right) in u is listed (+s, -s) in the board frame.
  quad(b.art, corner(-hw, -hh, artDepth), corner(hw, -hh, artDepth), corner(hw, hh, artDepth), corner(-hw, hh, artDepth), undefined, f.normal, planUv);
  const paneDepth = BOARD_DEPTH.clipping + 0.0052;
  quad(b.pane, corner(-hw, -hh, paneDepth), corner(hw, -hh, paneDepth), corner(hw, hh, paneDepth), corner(-hw, hh, paneDepth), undefined, f.normal, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  // A slim frosted edge where the sleeve's heat-sealed seam is.
  const seam = 0.012;
  quad(b.frosted, corner(-hw, -hh, paneDepth), corner(hw, -hh, paneDepth), corner(hw, -hh + seam, paneDepth), corner(-hw, -hh + seam, paneDepth), undefined, f.normal);
  quad(b.frosted, corner(-hw, hh - seam, paneDepth), corner(hw, hh - seam, paneDepth), corner(hw, hh, paneDepth), corner(-hw, hh, paneDepth), undefined, f.normal);
  quad(b.frosted, corner(-hw, -hh, paneDepth), corner(-hw + seam, -hh, paneDepth), corner(-hw + seam, hh, paneDepth), corner(-hw, hh, paneDepth), undefined, f.normal);
  quad(b.frosted, corner(hw - seam, -hh, paneDepth), corner(hw, -hh, paneDepth), corner(hw, hh, paneDepth), corner(hw - seam, hh, paneDepth), undefined, f.normal);

  // Brass pins: one at each sleeve corner and one at the top of every clipping (the first one is
  // its own mesh, so it can carry the idle highlight).
  const pin = (position: readonly [number, number, number]): void => {
    sphere(b.brass, { at: [position[0], position[1], position[2]], rot: [0, 0, -Math.PI / 2] }, 0.0058, 10, 5, { colour: BRASS_TINT }, Math.PI * 2, Math.PI / 2);
  };
  for (const [su, sv] of [[-hw + 0.012, -hh + 0.012], [hw - 0.012, -hh + 0.012], [-hw + 0.012, hh - 0.012], [hw - 0.012, hh - 0.012]] as const) {
    pin(corner(su, sv, paneDepth + 0.0004));
  }
  CLIPPINGS.forEach((_c, i) => {
    if (i === GLINT_PIN.clipping) return;
    pin(pinPosition(i));
  });
  // The office-hours card's two pins, and a stray pin of its own where something was taken down.
  for (const su of [-HOURS_CARD.w / 2 + 0.02, HOURS_CARD.w / 2 - 0.02]) pin(local(HOURS_CARD.u + su, HOURS_CARD.v + HOURS_CARD.h / 2 - 0.014, BOARD_DEPTH.clipping + 0.0006));
  pin(local(0.28, -0.4, BOARD_DEPTH.felt + 0.0004));
  buildBoardLight(b);
}

/** The pin at the top of clipping `i` as (u, v, depth) on the board. */
export function pinUV(i: number): [number, number, number] {
  const c = CLIPPINGS[i];
  if (!c) throw new RangeError(`no clipping ${i}`);
  const top = c.v + CLIPPING_SIZE / 2 - 0.0164;
  return [c.u + Math.sin((c.tiltDeg * Math.PI) / 180) * 0.0164 * -1, top, BOARD_DEPTH.clipping + 0.0006];
}

/** The same pin in board-local (depth, y, s) coordinates, for geometry built in the board's own frame. */
export function pinPosition(i: number): [number, number, number] {
  const [u, v, depth] = pinUV(i);
  return local(u, v, depth);
}

/**
 * Cues for the board that the interaction lane may write (ADR 0004: "the board's brass pin carries
 * the idle highlight"): `glint` is 0..1, a soft highlight on the glint pin. The world also shows
 * one itself early in the hero (the ambient 'board-pin' window), so the pin catches the light
 * whether or not the lane drives it; the brighter of the two wins.
 */
export const BOARD_CUES = { glint: 0 };

/** Where the board's picture light hangs: above the frame, standing out from the board. */
export const BOARD_LIGHT = { rise: 0.17, depth: 0.2, length: 0.56 } as const;

/** A brass picture light over the board: a tube on two arms, carried by the board's top rail. Its lamp is a static shader lamp. */
function buildBoardLight(b: Buckets): void {
  const metal = { colour: BRASS_TINT };
  const top = LOBBY.board.height / 2;
  const y = top + BOARD_LIGHT.rise;
  // The tube runs along the board (s).
  cylinder(b.brass, { at: [BOARD_LIGHT.depth, y, 0], rot: [Math.PI / 2, 0, 0] }, 0.0155, 0.0155, BOARD_LIGHT.length, 18, metal);
  for (const s of [-0.26, 0.26]) {
    // A post up from the top rail, an arm out over the board, and a cap where it meets the tube.
    cylinder(b.brass, { at: [0.03, top + (BOARD_LIGHT.rise - 0.02) / 2, s] }, 0.0085, 0.0085, BOARD_LIGHT.rise - 0.02, 8, metal);
    cylinder(b.brass, { at: [BOARD_LIGHT.depth / 2 + 0.015, y - 0.02, s], rot: [0, 0, Math.PI / 2] }, 0.0075, 0.0075, BOARD_LIGHT.depth - 0.03, 8, metal);
    cylinder(b.brass, { at: [0.03, top + 0.004, s], rot: [0, 0, 0] }, 0.014, 0.014, 0.02, 10, metal);
    cylinder(b.brass, { at: [BOARD_LIGHT.depth, y, s], rot: [Math.PI / 2, 0, 0] }, 0.021, 0.021, 0.02, 14, metal);
  }
}

/** The picture light's static lamp: out in front of the tube, a little above it. */
export function boardLampPosition(): [number, number, number] {
  return boardToWorld(0, LOBBY.board.height / 2 + BOARD_LIGHT.rise - 0.06, 0.36);
}
