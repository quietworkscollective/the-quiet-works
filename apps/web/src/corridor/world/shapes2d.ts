import { quad, tri, type Bucket, type Style } from './builder.ts';
import type { Vec2, Vec3 } from './math.ts';

/**
 * Flat outlines extruded along z: the arched head of a panel, an oval field, a fan light, a
 * fleuron. A door leaf is a set of such things in door-local space (x across, y up, z out of the
 * wall), so these take 2D outlines in x and y and a z range. Outlines must be convex or
 * star-shaped about their centre; every motif the doors use is.
 */

export type Outline = readonly Vec2[];

export function signedArea(o: Outline): number {
  let a = 0;
  for (let i = 0; i < o.length; i += 1) {
    const p = o[i] as Vec2;
    const q = o[(i + 1) % o.length] as Vec2;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function centroid(o: Outline): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of o) {
    x += p[0];
    y += p[1];
  }
  return [x / o.length, y / o.length];
}

/** An ellipse, counter-clockwise. */
export function ellipseOutline(cx: number, cy: number, rx: number, ry: number, segments = 28): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

/**
 * A rectangle with a round head: straight sides from `y0` up to where the arch springs, then an
 * arc of `rise` over the full width (a semicircle when rise = width / 2), counter-clockwise from
 * the bottom left.
 */
export function archOutline(x0: number, x1: number, y0: number, y1: number, rise: number, segments = 12): Vec2[] {
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const spring = y1 - rise;
  const out: Vec2[] = [
    [x0, y0],
    [x1, y0],
  ];
  // The arc is half an ellipse with semi-axes (w / 2, rise) springing at y = spring, walked from
  // the right spring point over the crown to the left one.
  for (let i = 0; i <= segments; i += 1) {
    const a = (i / segments) * Math.PI;
    out.push([cx + Math.cos(a) * (w / 2), spring + Math.sin(a) * rise]);
  }
  return dedupe(out);
}

function dedupe(o: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of o) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 1e-6) out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (first && last && out.length > 1 && Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-6) out.pop();
  return out;
}

/**
 * A convex outline offset inward by `d` (outward when negative): each vertex moves along the
 * bisector of its two edges' normals by the mitre length, so every edge ends up `d` from where it
 * was, whatever the shape's proportions.
 */
export function insetOutline(o: Outline, d: number): Vec2[] {
  const ccw = signedArea(o) >= 0 ? o : [...o].reverse();
  const n = ccw.length;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = ccw[(i + n - 1) % n] as Vec2;
    const p = ccw[i] as Vec2;
    const next = ccw[(i + 1) % n] as Vec2;
    const norm = (a: Vec2, b: Vec2): Vec2 => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      // Inward for a counter-clockwise outline.
      return [-dy / l, dx / l];
    };
    const n0 = norm(prev, p);
    const n1 = norm(p, next);
    const k = d / Math.max(0.2, 1 + n0[0] * n1[0] + n0[1] * n1[1]);
    out.push([p[0] + (n0[0] + n1[0]) * k, p[1] + (n0[1] + n1[1]) * k]);
  }
  return out;
}

/** A solid: side walls from z0 to z1 and a flat cap at z1 (the face toward the visitor), with an optional bevel. */
export function extrude(b: Bucket, outline: Outline, z0: number, z1: number, style?: Style, bevel = 0): void {
  const o = signedArea(outline) >= 0 ? outline : [...outline].reverse();
  const n = o.length;
  const bv = Math.min(bevel, (z1 - z0) / 2);
  const zSide = z1 - bv;
  const capOutline = bv > 0 ? insetOutline(o, bv) : o;
  for (let i = 0; i < n; i += 1) {
    const p = o[i] as Vec2;
    const q = o[(i + 1) % n] as Vec2;
    const out: Vec3 = [q[1] - p[1], -(q[0] - p[0]), 0];
    quad(b, [p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], zSide], [p[0], p[1], zSide], style, out);
    if (bv > 0) {
      const pi = capOutline[i] as Vec2;
      const qi = capOutline[(i + 1) % n] as Vec2;
      quad(b, [p[0], p[1], zSide], [q[0], q[1], zSide], [qi[0], qi[1], z1], [pi[0], pi[1], z1], style, [out[0], out[1], 0.8]);
    }
  }
  const [cx, cy] = centroid(capOutline);
  for (let i = 0; i < n; i += 1) {
    const p = capOutline[i] as Vec2;
    const q = capOutline[(i + 1) % n] as Vec2;
    tri(b, [cx, cy, z1], [p[0], p[1], z1], [q[0], q[1], z1], style, [0, 0, 1]);
  }
}

/** A flat cap only: the face of a recessed field or a pane, with no walls. */
export function cap(b: Bucket, outline: Outline, z: number, style?: Style, facing: Vec3 = [0, 0, 1]): void {
  const [cx, cy] = centroid(outline);
  for (let i = 0; i < outline.length; i += 1) {
    const p = outline[i] as Vec2;
    const q = outline[(i + 1) % outline.length] as Vec2;
    tri(b, [cx, cy, z], [p[0], p[1], z], [q[0], q[1], z], style, facing);
  }
}

/**
 * A raised band between two matching outlines (outer first), from z0 to z1: a bead or moulding
 * following a curved panel. Its top is flat; its walls face outward and inward.
 */
export function band(b: Bucket, outer: Outline, inner: Outline, z0: number, z1: number, style?: Style): void {
  const n = outer.length;
  if (inner.length !== n) throw new Error('a band needs matching outlines');
  const flip = signedArea(outer) < 0;
  const a = flip ? [...outer].reverse() : outer;
  const c = flip ? [...inner].reverse() : inner;
  for (let i = 0; i < n; i += 1) {
    const p = a[i] as Vec2;
    const q = a[(i + 1) % n] as Vec2;
    const pi = c[i] as Vec2;
    const qi = c[(i + 1) % n] as Vec2;
    quad(b, [p[0], p[1], z1], [q[0], q[1], z1], [qi[0], qi[1], z1], [pi[0], pi[1], z1], style, [0, 0, 1]);
    quad(b, [p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1], style, [q[1] - p[1], -(q[0] - p[0]), 0]);
    quad(b, [pi[0], pi[1], z0], [qi[0], qi[1], z0], [qi[0], qi[1], z1], [pi[0], pi[1], z1], style, [-(qi[1] - pi[1]), qi[0] - pi[0], 0]);
  }
}

/** The outline grown outward by `d` metres. */
export function growOutline(o: Outline, d: number): Vec2[] {
  return insetOutline(o, -d);
}
