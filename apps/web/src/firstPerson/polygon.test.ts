import { describe, expect, it } from 'vitest';
import type { Vec2 } from './bounds.ts';
import {
  nearestOnOutline,
  polygonArea,
  polygonContains,
  polygonExtent,
  polygonNearest,
  polygonSegmentInside,
  polygonSlide,
  type Polygon,
} from './polygon.ts';

/** A lobby 4.3 m wide opening into a corridor 2.5 m wide: one outline, concave at the opening. */
const T: Polygon = [
  { x: -2.15, z: 9.8 },
  { x: 2.15, z: 9.8 },
  { x: 2.15, z: 1.35 },
  { x: 1.25, z: 1.35 },
  { x: 1.25, z: -19 },
  { x: -1.25, z: -19 },
  { x: -1.25, z: 1.35 },
  { x: -2.15, z: 1.35 },
];

describe('a point in a polygon', () => {
  it('is inside the lobby, inside the corridor, and outside beyond a wall', () => {
    expect(polygonContains(T, { x: 0, z: 5 })).toBe(true);
    expect(polygonContains(T, { x: 0, z: -10 })).toBe(true);
    expect(polygonContains(T, { x: 2, z: 5 })).toBe(true);
    expect(polygonContains(T, { x: 2, z: 0 })).toBe(false);
    expect(polygonContains(T, { x: 0, z: -19.5 })).toBe(false);
    expect(polygonContains(T, { x: 3, z: 5 })).toBe(false);
  });

  it('counts the outline itself as ground', () => {
    expect(polygonContains(T, { x: 1.25, z: -5 })).toBe(true);
    expect(polygonContains(T, { x: -2.15, z: 9.8 })).toBe(true);
    expect(polygonContains(T, { x: 1.6, z: 1.35 })).toBe(true);
  });

  it('works whichever way the vertices go round', () => {
    const reversed = [...T].reverse();
    for (const p of [{ x: 0, z: 5 }, { x: 2, z: 0 }, { x: 1.2, z: -3 }, { x: 1.3, z: -3 }]) {
      expect(polygonContains(reversed, p)).toBe(polygonContains(T, p));
    }
  });

  it('measures the area of the lobby and the corridor, either winding', () => {
    const area = 4.3 * (9.8 - 1.35) + 2.5 * (1.35 + 19);
    expect(polygonArea(T)).toBeCloseTo(area, 9);
    expect(polygonArea([...T].reverse())).toBeCloseTo(area, 9);
  });
});

describe('the nearest ground', () => {
  it('is the point itself when it is on the ground', () => {
    const p = { x: 0.3, z: -4 };
    expect(polygonNearest(T, p)).toEqual(p);
  });

  it('is the foot of the perpendicular on the nearest edge when it is off it', () => {
    expect(polygonNearest(T, { x: 3, z: 5 })).toEqual({ x: 2.15, z: 5 });
    expect(polygonNearest(T, { x: 0, z: -20 })).toEqual({ x: 0, z: -19 });
  });

  it('is a corner when the point is past one', () => {
    const q = polygonNearest(T, { x: 1.4, z: 1.2 });
    expect(q.x).toBeGreaterThanOrEqual(1.25 - 1e-9);
    expect(polygonContains(T, q)).toBe(true);
    expect(nearestOnOutline(T, { x: 5, z: 12 })).toEqual({ x: 2.15, z: 9.8 });
  });
});

describe('how far one can walk along an axis', () => {
  it('stops at the corridor walls from inside the corridor', () => {
    const e = polygonExtent(T, { x: 0, z: -5 }, 'x');
    expect(e.lo).toBeCloseTo(-1.25, 9);
    expect(e.hi).toBeCloseTo(1.25, 9);
    const z = polygonExtent(T, { x: 0, z: -5 }, 'z');
    expect(z.lo).toBeCloseTo(-19, 9);
    expect(z.hi).toBeCloseTo(9.8, 9);
  });

  it('is wider in the lobby, and ends at the corridor mouth from the lobby’s sides', () => {
    const wide = polygonExtent(T, { x: 0, z: 5 }, 'x');
    expect(wide.lo).toBeCloseTo(-2.15, 9);
    expect(wide.hi).toBeCloseTo(2.15, 9);
    const side = polygonExtent(T, { x: 1.9, z: 5 }, 'z');
    expect(side.lo).toBeCloseTo(1.35, 9);
    expect(side.hi).toBeCloseTo(9.8, 9);
  });

  it('measures from a point on the outline too, on the side the ground is: the starting view stands on the lobby\u2019s back edge', () => {
    const back = polygonExtent(T, { x: 0, z: 9.8 }, 'z');
    expect(back.lo).toBeCloseTo(-19, 9);
    expect(back.hi).toBeCloseTo(9.8, 9);
    const wall = polygonExtent(T, { x: -1.25, z: -5 }, 'x');
    expect(wall.lo).toBeCloseTo(-1.25, 9);
    expect(wall.hi).toBeCloseTo(1.25, 9);
    // Along the edge itself: the whole of that edge.
    const along = polygonExtent(T, { x: 0, z: 9.8 }, 'x');
    expect(along.lo).toBeCloseTo(-2.15, 9);
    expect(along.hi).toBeCloseTo(2.15, 9);
    // At a corner, both ways in.
    const corner = polygonExtent(T, { x: 2.15, z: 9.8 }, 'z');
    expect(corner.hi).toBeCloseTo(9.8, 9);
    expect(corner.lo).toBeCloseTo(1.35, 9);
  });

  it('reports none for a point off the ground', () => {
    expect(polygonExtent(T, { x: 2, z: 0 }, 'x')).toEqual({ lo: 2, hi: 2 });
  });
});

describe('moving on the ground', () => {
  it('takes the whole step when it lands on the ground', () => {
    expect(polygonSlide(T, { x: 0, z: 0 }, { x: 0.02, z: -0.03 })).toEqual({ x: 0.02, z: -0.03 });
  });

  it('slides along a wall instead of sticking: the part of the step along it is kept', () => {
    const from = { x: 1.24, z: -5 };
    const next = polygonSlide(T, from, { x: 0.05, z: -0.05 });
    expect(next.z).toBeLessThan(from.z - 0.04);
    expect(next.x).toBeLessThanOrEqual(1.25 + 1e-9);
    expect(polygonContains(T, next)).toBe(true);
  });

  it('never leaves the ground, whatever the step, and never moves further than it was asked', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296) * 2 - 1;
    let p: Vec2 = { x: 0, z: 5 };
    for (let i = 0; i < 4000; i += 1) {
      const d = { x: rand() * 0.06, z: rand() * 0.06 };
      const next = polygonSlide(T, p, d);
      expect(polygonContains(T, next), `step ${i}`).toBe(true);
      expect(Math.hypot(next.x - p.x, next.z - p.z)).toBeLessThanOrEqual(Math.hypot(d.x, d.z) + 1e-9);
      p = next;
    }
  });

  it('does not move a visitor who is off the floor, so a scripted walk through a doorway is not pulled back', () => {
    const through: Vec2 = { x: 1.8, z: -5 };
    expect(polygonSlide(T, through, { x: 0.02, z: -0.02 })).toEqual(through);
    // But a step back onto the floor is taken.
    expect(polygonSlide(T, through, { x: -0.8, z: 0 })).toEqual({ x: 1, z: -5 });
  });

  it('slides round the corner of the corridor mouth, in and out of the lobby', () => {
    let p: Vec2 = { x: 2, z: 5 };
    // Walk toward the lobby end wall's inside corner, then along it.
    for (let i = 0; i < 400; i += 1) p = polygonSlide(T, p, { x: 0, z: -0.02 });
    expect(p.z).toBeCloseTo(1.35, 2);
    // Diagonally along the end wall: it slides sideways to the mouth, and then the way is open into the corridor.
    let atMouth = false;
    for (let i = 0; i < 200; i += 1) {
      p = polygonSlide(T, p, { x: -0.02, z: -0.02 });
      if (p.z < 1.3) atMouth = true;
      expect(polygonContains(T, p)).toBe(true);
    }
    expect(atMouth).toBe(true);
    expect(Math.abs(p.x)).toBeLessThanOrEqual(1.25 + 1e-9);
  });
});

describe('a straight line over the ground', () => {
  it('stays on it down the corridor and leaves it through a side wall', () => {
    expect(polygonSegmentInside(T, { x: 0, z: 9 }, { x: 0, z: -10 })).toBe(true);
    expect(polygonSegmentInside(T, { x: 2, z: 5 }, { x: 0.5, z: -5 })).toBe(false);
  });
});
