import { contains, extent, nearestWalkable, segmentInside, slide, type Bounds, type Vec2 } from './bounds.ts';
import {
  polygonContains,
  polygonExtent,
  polygonNearest,
  polygonSegmentInside,
  polygonSlide,
  type Polygon,
} from './polygon.ts';

/**
 * The ground a visitor may stand on, as the controller asks about it. A room made of rectangles
 * (the Office's furniture-shaped floor) and a stage's polygon (ADR 0007) both answer the same five
 * questions, so the controller does not care which it was given.
 */
export interface Walkable {
  contains(p: Vec2): boolean;
  /** The walkable point nearest to `p`. */
  nearest(p: Vec2): Vec2;
  /** How far one can walk from `p` along an axis, either way, before the edge of the ground. */
  extent(p: Vec2, axis: 'x' | 'z'): { lo: number; hi: number };
  /** Moves `from` by `delta` and stays on the ground, sliding along an edge it meets. */
  slide(from: Vec2, delta: Vec2): Vec2;
  /** True when the straight segment between two points stays on the ground. */
  segmentInside(a: Vec2, b: Vec2): boolean;
}

export const rectWalkable = (bounds: Bounds): Walkable => ({
  contains: (p) => contains(bounds, p),
  nearest: (p) => nearestWalkable(bounds, p),
  extent: (p, axis) => extent(bounds, p, axis),
  slide: (from, delta) => slide(bounds, from, delta),
  segmentInside: (a, b) => segmentInside(bounds, a, b),
});

export const polygonWalkable = (polygon: Polygon): Walkable => ({
  contains: (p) => polygonContains(polygon, p),
  nearest: (p) => polygonNearest(polygon, p),
  extent: (p, axis) => polygonExtent(polygon, p, axis),
  slide: (from, delta) => polygonSlide(polygon, from, delta),
  segmentInside: (a, b) => polygonSegmentInside(polygon, a, b),
});
