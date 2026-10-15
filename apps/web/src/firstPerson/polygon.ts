import type { Vec2 } from './bounds.ts';

/**
 * A walkable floor as a simple polygon on the (x, z) plane, in metres (ADR 0007: "a walkable area, a
 * polygon on the floor"). Vertices in order, either winding; the last joins the first. The polygon may
 * be concave (a lobby that narrows into a corridor is one outline). Everything here is plain geometry.
 */
export type Polygon = readonly Vec2[];

const EPS = 1e-9;

/** The closest point to `p` on the segment from `a` to `b`. */
function closestOnSegment(a: Vec2, b: Vec2, p: Vec2): Vec2 {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const lengthSq = abx * abx + abz * abz;
  if (lengthSq === 0) return a;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / lengthSq));
  return { x: a.x + abx * t, z: a.z + abz * t };
}

/** The point on the polygon's outline nearest to `p`. */
export function nearestOnOutline(polygon: Polygon, p: Vec2): Vec2 {
  let best: Vec2 = polygon[0] ?? p;
  let bestSq = Infinity;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i] as Vec2;
    const b = polygon[(i + 1) % polygon.length] as Vec2;
    const q = closestOnSegment(a, b, p);
    const sq = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
    if (sq < bestSq) {
      bestSq = sq;
      best = q;
    }
  }
  return best;
}

/** True when `p` is on the outline (within a hair). */
function onOutline(polygon: Polygon, p: Vec2): boolean {
  const q = nearestOnOutline(polygon, p);
  return (q.x - p.x) ** 2 + (q.z - p.z) ** 2 <= EPS * EPS;
}

/** True when `p` is inside the polygon or on its outline. */
export function polygonContains(polygon: Polygon, p: Vec2): boolean {
  if (polygon.length < 3) return false;
  if (onOutline(polygon, p)) return true;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i] as Vec2;
    const b = polygon[j] as Vec2;
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * The stretch of the line (`axis` varying, the other coordinate at `level`) that is inside the
 * polygon and contains `at`, by the even-odd rule over where the line crosses the outline. An edge
 * counts as crossed when its ends are on opposite sides of the line (half-open, so a vertex on the
 * line is counted once). Null when `at` is in none.
 */
function stretchAt(polygon: Polygon, axis: 'x' | 'z', level: number, at: number): { lo: number; hi: number } | null {
  const across = axis === 'x' ? 'z' : 'x';
  const hits: number[] = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i] as Vec2;
    const b = polygon[(i + 1) % polygon.length] as Vec2;
    if (a[across] > level === b[across] > level) continue;
    const t = (level - a[across]) / (b[across] - a[across]);
    hits.push(a[axis] + (b[axis] - a[axis]) * t);
  }
  hits.sort((m, n) => m - n);
  for (let i = 0; i + 1 < hits.length; i += 2) {
    const lo = hits[i] as number;
    const hi = hits[i + 1] as number;
    if (at >= lo - 1e-6 && at <= hi + 1e-6) return { lo, hi };
  }
  return null;
}

/**
 * How far the polygon extends from `p` along an axis in each direction before its outline: the
 * ends of the stretch of the line through `p` that is inside. A point outside reports none. A
 * point on the outline (the starting view stands on the lobby's back edge) is measured on both
 * sides of it, so the way back into the room is still seen.
 */
export function polygonExtent(polygon: Polygon, p: Vec2, axis: 'x' | 'z'): { lo: number; hi: number } {
  const at = p[axis];
  if (!polygonContains(polygon, p)) return { lo: at, hi: at };
  const level = axis === 'x' ? p.z : p.x;
  let best: { lo: number; hi: number } | null = null;
  for (const nudge of [0, 1e-7, -1e-7]) {
    const stretch = stretchAt(polygon, axis, level + nudge, at);
    if (stretch && (!best || stretch.hi - stretch.lo > best.hi - best.lo)) best = stretch;
  }
  return best ?? { lo: at, hi: at };
}

/** The point of the polygon (inside or on its outline) nearest to `p`. */
export function polygonNearest(polygon: Polygon, p: Vec2): Vec2 {
  return polygonContains(polygon, p) ? p : nearestOnOutline(polygon, p);
}

/**
 * Moves `from` by `delta` and stays on the floor: the whole step if it lands on it, otherwise as far
 * as the step goes before the outline and then the rest of it along that edge (a slide, not a stop).
 * At a corner the edge ends and so does the slide. The result is on the floor (unless `from` was not),
 * and never further from `from` than the step asked.
 */
export function polygonSlide(polygon: Polygon, from: Vec2, delta: Vec2): Vec2 {
  const full = { x: from.x + delta.x, z: from.z + delta.z };
  if (polygonContains(polygon, full)) return full;
  // Standing off the floor (a scripted walk through a doorway ends past the wall): no step lands on it, so none is taken.
  if (!polygonContains(polygon, from)) return from;
  // The last point of the step that is still on the floor.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (polygonContains(polygon, { x: from.x + delta.x * mid, z: from.z + delta.z * mid })) lo = mid;
    else hi = mid;
  }
  const hit = { x: from.x + delta.x * lo, z: from.z + delta.z * lo };
  // The edge (or edges, at a vertex) it ran into: those the hit point lies on. Slide along whichever
  // lets the rest of the step go furthest while staying on the floor.
  let best = hit;
  let bestMoved = 0;
  let nearest = Infinity;
  const distances = polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length] as Vec2;
    const q = closestOnSegment(a, b, hit);
    return Math.hypot(q.x - hit.x, q.z - hit.z);
  });
  for (const d of distances) nearest = Math.min(nearest, d);
  for (let i = 0; i < polygon.length; i += 1) {
    if ((distances[i] as number) > nearest + 1e-6) continue;
    const a = polygon[i] as Vec2;
    const b = polygon[(i + 1) % polygon.length] as Vec2;
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const length = Math.hypot(ex, ez);
    if (length === 0) continue;
    const along = ((full.x - hit.x) * ex + (full.z - hit.z) * ez) / length;
    const slid = { x: hit.x + (ex / length) * along, z: hit.z + (ez / length) * along };
    const moved = Math.abs(along);
    if (moved > bestMoved && polygonContains(polygon, slid)) {
      best = slid;
      bestMoved = moved;
    }
  }
  return best;
}

/** True when the straight segment from `a` to `b` stays on the floor (sampled every `step` m). */
export function polygonSegmentInside(polygon: Polygon, a: Vec2, b: Vec2, step = 0.1): boolean {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(length / step));
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    if (!polygonContains(polygon, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false;
  }
  return true;
}

/** The area of the polygon (positive whichever way it winds). */
export function polygonArea(polygon: Polygon): number {
  let twice = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i] as Vec2;
    const b = polygon[(i + 1) % polygon.length] as Vec2;
    twice += a.x * b.z - b.x * a.z;
  }
  return Math.abs(twice) / 2;
}
