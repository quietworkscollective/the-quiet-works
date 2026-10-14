import { atlasUvs } from '../atlasLayout.ts';
import { IVORY, linear, METAL, wood } from '../colours.ts';
import type { PropModel } from '../model.ts';
import { moved, ramp, type PoseSet } from '../motion.ts';
import type { Assembly } from '../parts.ts';

/**
 * The chess position (play): a fold-down board shelf in bay 5, a quiet endgame left on it, one
 * black pawn missing and a coat button standing in. The white bishop is the piece on offer: choosing
 * the board slides it two squares across the board, lifting a little as it goes, holds it there,
 * and brings it back. No victory, no score: a thought left half-finished by someone who will return.
 */

const SQUARE = 0.0375;
const BOARD = { half: 0.15, z0: 0.03, z1: 0.33 } as const;

/** Centre of a square: file 0..7 (a..h) left to right, rank 1..8 from the visitor's side. */
export function squareCentre(file: number, rank: number): readonly [number, number] {
  return [-BOARD.half + SQUARE * (file + 0.5), BOARD.z1 - SQUARE * (rank - 0.5)];
}

/** The offered bishop moves from c3 to e5 and back. */
export const BISHOP_FROM = squareCentre(2, 3);
export const BISHOP_TO = squareCentre(4, 5);
export const HOP = 0.016;

const SET_BLACK = linear('#3B2518');

function lathePiece(a: Assembly, x: number, y: number, z: number, white: boolean, profile: readonly (readonly [number, number])[], seg = 7): void {
  a.lathe('enamel', { at: [x, y, z] }, profile, seg, white ? IVORY : SET_BLACK);
}

const PAWN: [number, number][] = [[0, 0], [0.012, 0], [0.008, 0.008], [0.0055, 0.016], [0.009, 0.019], [0.0085, 0.028], [0.0035, 0.0345], [0, 0.0355]];
const ROOK: [number, number][] = [[0, 0], [0.0135, 0], [0.0095, 0.011], [0.0085, 0.028], [0.0125, 0.03], [0.0125, 0.038], [0.0095, 0.038], [0.0095, 0.0345], [0, 0.0345]];
const BISHOP: [number, number][] = [[0, 0], [0.0135, 0], [0.0085, 0.012], [0.0065, 0.026], [0.0105, 0.029], [0.0105, 0.04], [0.0085, 0.048], [0.0035, 0.0585], [0, 0.0595]];
const KING: [number, number][] = [[0, 0], [0.0145, 0], [0.01, 0.012], [0.007, 0.028], [0.0115, 0.032], [0.012, 0.046], [0.0095, 0.054], [0.0045, 0.057], [0, 0.058]];

export const chess: PropModel = {
  id: 'chess',

  parts: (placement) => [{ name: 'bishop', pivot: [BISHOP_FROM[0], placement.height, BISHOP_FROM[1]] }],

  build(a, placement) {
    const H = placement.height;
    const bishop = a.part('bishop');

    // The shelf: a hinged board on two struts, a raised rim round the playing area.
    const pine = wood('#7C5C3A');
    const dark = wood('#4E3624');
    a.span('wood', [-0.17, 0.17], [H - 0.02, H], [0.012, 0.34], 0.003, pine);
    a.span('wood', [-0.17, -BOARD.half], [H, H + 0.007], [0.012, 0.34], 0.002, dark);
    a.span('wood', [BOARD.half, 0.17], [H, H + 0.007], [0.012, 0.34], 0.002, dark);
    a.span('wood', [-BOARD.half, BOARD.half], [H, H + 0.007], [0.012, BOARD.z0], 0.002, dark);
    a.span('wood', [-BOARD.half, BOARD.half], [H, H + 0.007], [BOARD.z1, 0.34], 0.002, dark);
    // The board: a printed face laid on the shelf, a hair above it.
    a.quad('print', [-BOARD.half, H + 0.001, BOARD.z1], [BOARD.half, H + 0.001, BOARD.z1], [BOARD.half, H + 0.001, BOARD.z0], [-BOARD.half, H + 0.001, BOARD.z0], [0, 1, 0], undefined, atlasUvs('chess'));
    // Hinges on the wall edge, and two struts folding out to the underside.
    for (const x of [-0.12, 0.12]) {
      a.span('brass', [x - 0.025, x + 0.025], [H - 0.018, H - 0.002], [0.0, 0.006], 0.001, METAL.polished);
      a.cyl('brass', { at: [x, H - 0.01, 0.012], rot: [0, 0, Math.PI / 2] }, 0.0052, 0.0052, 0.05, 8, METAL.polished);
      a.rod('wood', [x, H - 0.2, 0.012], [x, H - 0.02, 0.28], 0.0085, 4, dark);
      a.span('brass', [x - 0.012, x + 0.012], [H - 0.215, H - 0.19], [0, 0.005], 0.001, METAL.brass);
    }

    // The game. White: a king, a rook, three pawns, and the bishop on offer.
    const put = (file: number, rank: number, white: boolean, profile: readonly (readonly [number, number])[], seg = 8): void => {
      const [x, z] = squareCentre(file, rank);
      lathePiece(a, x, H + 0.001, z, white, profile, seg);
    };
    put(6, 1, true, KING);
    put(5, 1, true, ROOK);
    put(0, 2, true, PAWN, 7);
    put(5, 2, true, PAWN, 7);
    put(7, 2, true, PAWN, 7);
    // Black: a king, a rook, three pawns, and a coat button standing in for the fourth.
    put(6, 8, false, KING);
    put(5, 8, false, ROOK);
    put(0, 7, false, PAWN, 7);
    put(6, 7, false, PAWN, 7);
    put(7, 6, false, PAWN, 7);
    const [bx, bz] = squareCentre(3, 6);
    a.cyl('enamel', { at: [bx, H + 0.003, bz] }, 0.0115, 0.0115, 0.0035, 14, linear('#2A3B52'));
    a.cyl('enamel', { at: [bx, H + 0.0052, bz] }, 0.0075, 0.0075, 0.0006, 12, linear('#1C2A3C'));
    for (const [dx, dz] of [[-0.0028, -0.0028], [0.0028, -0.0028], [-0.0028, 0.0028], [0.0028, 0.0028]] as const) a.cyl('matte', { at: [bx + dx, H + 0.0054, bz + dz] }, 0.0012, 0.0012, 0.0004, 4, linear('#07090C'));

    // The bishop on offer: white, ivory, and the fitting a hand finds.
    a.on(bishop, () => {
      a.ivory(() => {
        a.lathe('enamel', { at: [BISHOP_FROM[0], H + 0.001, BISHOP_FROM[1]] }, BISHOP, 10, IVORY);
      });
    });
    a.hit([-0.17, H - 0.02, 0.01], [0.17, H + 0.075, 0.345]);
  },

  pose(motion) {
    const set: PoseSet = {};
    const t = motion.action;
    // Across over the rise and held there; the fall is the same move run back: it resets.
    const s = ramp(t, 0.04, 1.0);
    const dx = (BISHOP_TO[0] - BISHOP_FROM[0]) * s;
    const dz = (BISHOP_TO[1] - BISHOP_FROM[1]) * s;
    const lift = HOP * Math.sin(Math.PI * s);
    if (dx !== 0 || dz !== 0 || lift !== 0) set['bishop'] = moved(dx, lift, dz);
    return set;
  },
};
