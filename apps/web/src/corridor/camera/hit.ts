import { boardCorners, project, type Lens, type View } from './framing.ts';

/**
 * Picking the notice board's surface (ADR 0004: the board's whole surface reads as the board, not
 * only its clippings). The board is a flat quad on a wall, so a point on screen is on it when it is
 * inside the quad its corners project to, grown a little so it is never a precision target.
 */
export interface Point2 {
  x: number;
  y: number;
}

/** True when `p` is inside the convex quad (either winding), the quad grown about its centre by `grow` (a fraction). */
export function quadContains(quad: readonly Point2[], p: Point2, grow = 0): boolean {
  if (quad.length < 3) return false;
  const cx = quad.reduce((a, q) => a + q.x, 0) / quad.length;
  const cy = quad.reduce((a, q) => a + q.y, 0) / quad.length;
  const q = quad.map((v) => ({ x: cx + (v.x - cx) * (1 + grow), y: cy + (v.y - cy) * (1 + grow) }));
  let sign = 0;
  for (let i = 0; i < q.length; i += 1) {
    const a = q[i] as Point2;
    const b = q[(i + 1) % q.length] as Point2;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** The board's frame as it lands on screen from `view`, or null if any corner is behind the eye. */
export function boardQuad(view: View, lens: Lens): Point2[] | null {
  const out: Point2[] = [];
  for (const corner of boardCorners()) {
    const p = project(view, lens, corner);
    if (!p) return null;
    out.push(p);
  }
  return out;
}

/** How much larger than the board the area that counts as it is. */
export const BOARD_HIT_GROW = 0.06;

/** True when the screen point (normalised, -1..1) is on the notice board as seen from `view`. */
export function onBoard(view: View, lens: Lens, ndc: Point2): boolean {
  const quad = boardQuad(view, lens);
  return quad !== null && quadContains(quad, ndc, BOARD_HIT_GROW);
}
