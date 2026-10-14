/**
 * Walkable ground as a union of axis-aligned rectangles on the floor plane (x, z), in metres.
 * A single room is one rectangle; a lobby that opens into a narrower corridor is two that
 * overlap where the opening is. Margins from walls are baked into the rectangles by whoever
 * builds them, so nothing here knows what a wall is.
 */
export interface Vec2 {
  x: number;
  z: number;
}

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type Bounds = readonly Rect[];

const EPS = 1e-9;

const inside = (r: Rect, p: Vec2): boolean =>
  p.x >= r.minX - EPS && p.x <= r.maxX + EPS && p.z >= r.minZ - EPS && p.z <= r.maxZ + EPS;

export function contains(bounds: Bounds, p: Vec2): boolean {
  return bounds.some((r) => inside(r, p));
}

/** The point of the walkable ground nearest to `p`. */
export function nearestWalkable(bounds: Bounds, p: Vec2): Vec2 {
  let best: Vec2 = p;
  let bestSq = Infinity;
  for (const r of bounds) {
    const q = { x: Math.min(r.maxX, Math.max(r.minX, p.x)), z: Math.min(r.maxZ, Math.max(r.minZ, p.z)) };
    const sq = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
    if (sq < bestSq) {
      bestSq = sq;
      best = q;
    }
  }
  return best;
}

/**
 * How far one can walk from `p` along an axis, in either direction, without leaving the
 * ground: the ends of the connected stretch of the line through `p` that is walkable. The
 * line of a point just outside the ground has no stretch, and reports none.
 */
export function extent(bounds: Bounds, p: Vec2, axis: 'x' | 'z'): { lo: number; hi: number } {
  const at = axis === 'x' ? p.x : p.z;
  const across = axis === 'x' ? p.z : p.x;
  const spans = bounds
    .filter((r) =>
      axis === 'x'
        ? r.minZ - EPS <= across && across <= r.maxZ + EPS
        : r.minX - EPS <= across && across <= r.maxX + EPS,
    )
    .map((r) => (axis === 'x' ? { lo: r.minX, hi: r.maxX } : { lo: r.minZ, hi: r.maxZ }))
    .sort((a, b) => a.lo - b.lo);
  let lo = at;
  let hi = at;
  let found = false;
  // Grow outward from the span that holds `at` through every span that touches it.
  for (const span of spans) {
    if (!found && span.lo - EPS <= at && at <= span.hi + EPS) {
      lo = span.lo;
      hi = span.hi;
      found = true;
    }
  }
  if (!found) return { lo: at, hi: at };
  for (let grew = true; grew;) {
    grew = false;
    for (const span of spans) {
      if (span.lo < lo - EPS && span.hi >= lo - EPS) {
        lo = span.lo;
        grew = true;
      }
      if (span.hi > hi + EPS && span.lo <= hi + EPS) {
        hi = span.hi;
        grew = true;
      }
    }
  }
  return { lo, hi };
}

/**
 * Moves `from` by `delta` and stays on the ground: the whole step if it lands on walkable
 * ground, otherwise the part of it along one axis (sliding along a wall), otherwise nothing.
 */
export function slide(bounds: Bounds, from: Vec2, delta: Vec2): Vec2 {
  const full = { x: from.x + delta.x, z: from.z + delta.z };
  if (contains(bounds, full)) return full;
  const alongX = { x: full.x, z: from.z };
  const alongZ = { x: from.x, z: full.z };
  const xOk = contains(bounds, alongX);
  const zOk = contains(bounds, alongZ);
  if (xOk && zOk) return Math.abs(delta.x) >= Math.abs(delta.z) ? alongX : alongZ;
  if (xOk) return alongX;
  if (zOk) return alongZ;
  return from;
}

/** True when the straight segment from `a` to `b` stays on the ground (sampled every `step` m). */
export function segmentInside(bounds: Bounds, a: Vec2, b: Vec2, step = 0.1): boolean {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(length / step));
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    if (!contains(bounds, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false;
  }
  return true;
}
