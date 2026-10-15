import { describe, expect, it } from 'vitest';
import { LOBBY } from '../layout.ts';
import { boardPoint, project, type Lens } from './framing.ts';
import { BOARD_HIT_GROW, boardQuad, onBoard, quadContains } from './hit.ts';
import { handoverPose } from './viewpoints.ts';

const LENS: Lens = { vfovDeg: 48, aspect: 1280 / 720 };
const SQUARE = [
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
];

describe('a point in a quad', () => {
  it('is inside the middle, and outside beyond an edge, whichever way the quad is wound', () => {
    expect(quadContains(SQUARE, { x: 0, y: 0 })).toBe(true);
    expect(quadContains(SQUARE, { x: 1.2, y: 0 })).toBe(false);
    expect(quadContains(SQUARE, { x: 0, y: -1.2 })).toBe(false);
    expect(quadContains([...SQUARE].reverse(), { x: 0.5, y: 0.5 })).toBe(true);
    expect(quadContains([...SQUARE].reverse(), { x: 2, y: 0.5 })).toBe(false);
  });

  it('counts a point just outside once the quad is grown, and not before', () => {
    expect(quadContains(SQUARE, { x: 1.05, y: 0 })).toBe(false);
    expect(quadContains(SQUARE, { x: 1.05, y: 0 }, 0.1)).toBe(true);
  });

  it('works for a quad that is not a rectangle (a board seen at an angle)', () => {
    const slanted = [
      { x: -1, y: -0.5 },
      { x: 1, y: -1 },
      { x: 1, y: 1 },
      { x: -1, y: 0.5 },
    ];
    expect(quadContains(slanted, { x: 0, y: 0 })).toBe(true);
    expect(quadContains(slanted, { x: -0.9, y: 0.9 })).toBe(false);
    expect(quadContains(slanted, { x: 0.9, y: 0.9 })).toBe(true);
  });
});

describe('the notice board on screen', () => {
  const view = handoverPose(false);

  it('is picked at its middle and at its corners, and not just off its edge', () => {
    const middle = project(view, LENS, boardPoint(0, 0))!;
    expect(onBoard(view, LENS, middle)).toBe(true);
    for (const [u, v] of [
      [-0.6, -0.4],
      [0.6, -0.4],
      [0.6, 0.4],
      [-0.6, 0.4],
    ] as const) {
      const p = project(view, LENS, boardPoint(u, v))!;
      expect(onBoard(view, LENS, p), `${u},${v}`).toBe(true);
    }
    const beyond = project(view, LENS, boardPoint(LOBBY.board.width / 2 + 1.0, 0))!;
    expect(onBoard(view, LENS, beyond)).toBe(false);
  });

  it('is not picked on the corridor, the floor or the ceiling', () => {
    expect(onBoard(view, LENS, { x: 0.3, y: 0 })).toBe(false);
    expect(onBoard(view, LENS, { x: -0.5, y: -0.8 })).toBe(false);
    expect(onBoard(view, LENS, { x: -0.5, y: 0.9 })).toBe(false);
  });

  it('is generous: a small margin around the frame still counts', () => {
    const quad = boardQuad(view, LENS)!;
    const xs = quad.map((q) => q.x);
    const right = Math.max(...xs);
    const width = right - Math.min(...xs);
    const mid = quad.reduce((a, q) => a + q.y, 0) / quad.length;
    expect(onBoard(view, LENS, { x: right + (BOARD_HIT_GROW * width) / 4, y: mid })).toBe(true);
    expect(onBoard(view, LENS, { x: right + width, y: mid })).toBe(false);
  });

  it('is nothing when the board is behind the eye', () => {
    expect(boardQuad({ ...view, yawDeg: 180 }, LENS)).toBeNull();
    expect(onBoard({ ...view, yawDeg: 180 }, LENS, { x: 0, y: 0 })).toBe(false);
  });
});
