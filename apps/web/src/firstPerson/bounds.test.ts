import { describe, expect, it } from 'vitest';
import { contains, extent, nearestWalkable, segmentInside, slide, type Bounds } from './bounds.ts';

/** A lobby opening into a narrower corridor through an overlap, as in the Corridor. */
const LOBBY_AND_CORRIDOR: Bounds = [
  { minX: -2, maxX: 2, minZ: 1.5, maxZ: 6 },
  { minX: -1, maxX: 1, minZ: -19, maxZ: 1.8 },
];

describe('contains / nearestWalkable', () => {
  it('is the union of its rectangles, edges included', () => {
    expect(contains(LOBBY_AND_CORRIDOR, { x: 0, z: 3 })).toBe(true);
    expect(contains(LOBBY_AND_CORRIDOR, { x: 1.9, z: 3 })).toBe(true);
    expect(contains(LOBBY_AND_CORRIDOR, { x: 0.9, z: -10 })).toBe(true);
    expect(contains(LOBBY_AND_CORRIDOR, { x: 1, z: -19 })).toBe(true);
    expect(contains(LOBBY_AND_CORRIDOR, { x: 1.9, z: 0 })).toBe(false);
    expect(contains(LOBBY_AND_CORRIDOR, { x: 0, z: -19.01 })).toBe(false);
  });

  it('puts a point outside on the nearest walkable ground', () => {
    expect(nearestWalkable(LOBBY_AND_CORRIDOR, { x: 1.9, z: 0 })).toEqual({ x: 1, z: 0 });
    expect(nearestWalkable(LOBBY_AND_CORRIDOR, { x: 0, z: 9 })).toEqual({ x: 0, z: 6 });
    expect(nearestWalkable(LOBBY_AND_CORRIDOR, { x: 0.3, z: 2 })).toEqual({ x: 0.3, z: 2 });
  });
});

describe('extent', () => {
  it('runs to the walls of the room the line is in', () => {
    expect(extent(LOBBY_AND_CORRIDOR, { x: 0.2, z: -5 }, 'z')).toEqual({ lo: -19, hi: 6 });
    expect(extent(LOBBY_AND_CORRIDOR, { x: 0.2, z: -5 }, 'x')).toEqual({ lo: -1, hi: 1 });
  });

  it('stops at the lobby wall when the line is outside the corridor opening', () => {
    expect(extent(LOBBY_AND_CORRIDOR, { x: 1.6, z: 4 }, 'z')).toEqual({ lo: 1.5, hi: 6 });
    expect(extent(LOBBY_AND_CORRIDOR, { x: 0, z: 4 }, 'x')).toEqual({ lo: -2, hi: 2 });
  });

  it('is empty for a point that is not on the ground', () => {
    expect(extent(LOBBY_AND_CORRIDOR, { x: 1.6, z: -3 }, 'z')).toEqual({ lo: -3, hi: -3 });
  });
});

describe('slide', () => {
  it('takes the whole step when it stays on the ground', () => {
    expect(slide(LOBBY_AND_CORRIDOR, { x: 0, z: 0 }, { x: 0.2, z: -0.3 })).toEqual({ x: 0.2, z: -0.3 });
  });

  it('keeps the part of a step that runs along the wall', () => {
    const next = slide(LOBBY_AND_CORRIDOR, { x: 0.95, z: 0 }, { x: 0.2, z: -0.3 });
    expect(next).toEqual({ x: 0.95, z: -0.3 });
  });

  it('goes nowhere when blocked in both axes', () => {
    expect(slide(LOBBY_AND_CORRIDOR, { x: 1, z: -19 }, { x: 0.1, z: -0.1 })).toEqual({ x: 1, z: -19 });
  });
});

describe('segmentInside', () => {
  it('is true inside a room and across the opening', () => {
    expect(segmentInside(LOBBY_AND_CORRIDOR, { x: 0, z: 5 }, { x: 0, z: -10 })).toBe(true);
  });

  it('is false when the straight line would cut the lobby corner', () => {
    expect(segmentInside(LOBBY_AND_CORRIDOR, { x: 1.9, z: 4 }, { x: 0.5, z: -2 })).toBe(false);
  });
});
