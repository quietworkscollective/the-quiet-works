import { tri } from '../builder.ts';
import type { Vec2 } from '../math.ts';
import { archOutline, band, cap, insetOutline } from '../shapes2d.ts';
import { bar, stud } from '../shapes.ts';
import { bevelOf, glassBucket, member, span, zFace, type Ctx } from './ctx.ts';

/**
 * A segmental fanlight over a pair of doors: a shallow arch of glass in a painted frame, the
 * corners above it filled in, and slim bars radiating from a brass boss at the springing. It
 * turns the flat transom into a silhouette, so the door is the one with the arched head even
 * from the far end of the corridor.
 */
export function buildFanlight(c: Ctx): void {
  const tr = c.plan.transom;
  if (!tr) return;
  const b = c.fixed;
  const rail = member(c, b, 'rail', true);
  const bars = member(c, b, 'bead', true);
  const half = c.spec.width / 2;
  const railH = 0.05;
  const y0 = tr.bottom + railH;
  const y1 = tr.bottom + tr.height;
  const rise = y1 - y0;
  const z: readonly [number, number] = [zFace - 0.04, zFace];
  const near = c.lod === 'near';
  span(rail.bucket, [-half, half], [tr.bottom, y0], z, bevelOf(c), rail.style);

  const outline = archOutline(-half, half, y0, y1, rise, near ? 22 : 10);
  // The arc, from the right springing over the crown to the left one (the outline's tail).
  const arc: Vec2[] = outline.slice(2);
  const crown = arc.reduce((best, p, i) => (p[1] > (arc[best] as Vec2)[1] ? i : best), 0);
  const zs = zFace - 0.006;
  // Spandrels: the corners between the arch and the frame, as painted panels a little behind its face.
  const left = arc.slice(crown);
  const right = arc.slice(0, crown + 1).reverse();
  for (const [corner, pts] of [
    [[-half, y1], left],
    [[half, y1], right],
  ] as const) {
    for (let i = 0; i + 1 < pts.length; i += 1) tri(rail.bucket, [corner[0], corner[1], zs], [(pts[i] as Vec2)[0], (pts[i] as Vec2)[1], zs], [(pts[i + 1] as Vec2)[0], (pts[i + 1] as Vec2)[1], zs], rail.style, [0, 0, 1]);
  }
  cap(glassBucket(b, c.plan.parts.find((p) => p.kind === 'transom')?.glazing ?? 'clear'), outline, zFace - 0.014);
  if (!near) return;
  band(bars.bucket, outline, insetOutline(outline, 0.016), zFace - 0.016, zFace - 0.002, bars.style);
  // Radiating bars from the boss at the springing's centre to the arc.
  const hub: Vec2 = [0, y0];
  const n = 7;
  for (let k = 1; k < n; k += 1) {
    const target = arc[Math.round((k / n) * (arc.length - 1))] as Vec2;
    const dx = target[0] - hub[0];
    const dy = target[1] - hub[1];
    const len = Math.hypot(dx, dy);
    bar(bars.bucket, { at: [hub[0] + dx / 2, hub[1] + dy / 2, zFace - 0.01], rot: [0, 0, Math.atan2(dy, dx)] }, [len, 0.012, 0.014], bars.style);
  }
  stud(b.brass, [hub[0], hub[1] + 0.012, zFace - 0.002], 0.03, 0.03, 0.014, 18, { colour: c.tints.metal });
}
