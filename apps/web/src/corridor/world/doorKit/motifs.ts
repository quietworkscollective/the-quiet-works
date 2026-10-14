import { quad, type Bucket, type Style } from '../builder.ts';
import type { DoorCharacter } from '../../doorKit.ts';
import { archOutline, band, ellipseOutline, extrude, insetOutline } from '../shapes2d.ts';
import { bar, stud, torus } from '../shapes.ts';
import { bevelOf, span, zFace, type Ctx, type Member } from './ctx.ts';

/**
 * The seven design motifs (ADR 0004) as ways to fill a rectangular region of a leaf. A family
 * decides where its panels, lights and fields are; the motif decides what goes in them:
 * inset panels, an arched panel, an oval one, vertical ribs, a glazed grid, diagonal bracing, a
 * round aperture. Every builder works in door-local metres with the leaf face at `zFace`.
 *
 * Each field is built by `fieldWith`, which also records the depth of what it built in the
 * ctx's relief list, so marks and wear laid over the leaf later sit on the surface instead of
 * floating over a recess.
 */

export type Motif = NonNullable<DoorCharacter['motif']>;

export type { Member };

/** A leaf's extents and the depth range of its frame members. */
export interface Frame {
  xl: number;
  xr: number;
  y0: number;
  y1: number;
  z: readonly [number, number];
}

export interface Region {
  x: readonly [number, number];
  y: readonly [number, number];
}

/** Depths the fields are built to, measured from the leaf face. */
export const DEPTH = {
  field: 0.014,
  raised: 0.0085,
  bead: 0.004,
} as const;

/** A raised-and-fielded rectangular panel: a recessed field, a raised centre and a small bead around it. */
export function rectField(c: Ctx, field: Member, bead: Member, r: Region, f: Frame): void {
  const bv = bevelOf(c, 0.002);
  const fieldFront = zFace - DEPTH.field;
  span(field.bucket, r.x, r.y, [f.z[0] + 0.008, fieldFront], bv, field.style);
  c.relief.push({ x: r.x, y: r.y, z: fieldFront });
  if (c.lod !== 'near') return;
  const w = r.x[1] - r.x[0];
  const h = r.y[1] - r.y[0];
  const b = 0.02;
  const bz: readonly [number, number] = [fieldFront - 0.002, zFace - DEPTH.bead];
  span(bead.bucket, [r.x[0], r.x[1]], [r.y[0], r.y[0] + b], bz, 0.003, bead.style);
  span(bead.bucket, [r.x[0], r.x[1]], [r.y[1] - b, r.y[1]], bz, 0.003, bead.style);
  span(bead.bucket, [r.x[0], r.x[0] + b], [r.y[0] + b, r.y[1] - b], bz, 0.003, bead.style);
  span(bead.bucket, [r.x[1] - b, r.x[1]], [r.y[0] + b, r.y[1] - b], bz, 0.003, bead.style);
  if (w > 0.2 && h > 0.2) {
    const inner = { x: [r.x[0] + 0.05, r.x[1] - 0.05] as const, y: [r.y[0] + 0.05, r.y[1] - 0.05] as const };
    span(field.bucket, inner.x, inner.y, [fieldFront - 0.002, zFace - 0.0085], 0.004, field.style);
    c.relief.push({ x: inner.x, y: inner.y, z: zFace - 0.0085 });
  }
}

/** An arched panel: a recessed rectangular field with a raised arched panel in it, beaded round the arch. */
export function archField(c: Ctx, field: Member, bead: Member, r: Region, f: Frame): void {
  const bv = bevelOf(c, 0.002);
  const fieldFront = zFace - DEPTH.field;
  span(field.bucket, r.x, r.y, [f.z[0] + 0.008, fieldFront], bv, field.style);
  c.relief.push({ x: r.x, y: r.y, z: fieldFront });
  const w = r.x[1] - r.x[0];
  const m = 0.03;
  if (w < 0.2) return;
  const x0 = r.x[0] + m;
  const x1 = r.x[1] - m;
  const rise = Math.min((x1 - x0) / 2, (r.y[1] - r.y[0]) * 0.42);
  const outline = archOutline(x0, x1, r.y[0] + m, r.y[1] - m, rise, c.lod === 'near' ? 14 : 7);
  extrude(field.bucket, outline, fieldFront - 0.002, zFace - DEPTH.raised, field.style, bevelOf(c, 0.003));
  c.relief.push({ x: [x0, x1], y: [r.y[0] + m, r.y[1] - m], z: zFace - DEPTH.raised });
  if (c.lod === 'near') {
    const ring = insetOutline(outline, 0.022);
    band(bead.bucket, outline, ring, zFace - DEPTH.raised, zFace - 0.0045, bead.style);
  }
}

/** An oval panel: a recessed field with a raised oval boss and a beaded ring. */
export function ovalField(c: Ctx, field: Member, bead: Member, r: Region, f: Frame): void {
  const bv = bevelOf(c, 0.002);
  const fieldFront = zFace - DEPTH.field;
  span(field.bucket, r.x, r.y, [f.z[0] + 0.008, fieldFront], bv, field.style);
  c.relief.push({ x: r.x, y: r.y, z: fieldFront });
  const cx = (r.x[0] + r.x[1]) / 2;
  const cy = (r.y[0] + r.y[1]) / 2;
  const rx = (r.x[1] - r.x[0]) / 2 - 0.03;
  const ry = (r.y[1] - r.y[0]) / 2 - 0.03;
  if (rx < 0.06 || ry < 0.06) return;
  c.ovals.push({ cx, cy, rx, ry });
  const outline = ellipseOutline(cx, cy, rx, ry, c.lod === 'near' ? 32 : 14);
  extrude(field.bucket, outline, fieldFront - 0.002, zFace - DEPTH.raised, field.style, bevelOf(c, 0.003));
  c.relief.push({ x: [cx - rx, cx + rx], y: [cy - ry, cy + ry], z: zFace - DEPTH.raised });
  if (c.lod === 'near') band(bead.bucket, outline, insetOutline(outline, 0.02), zFace - DEPTH.raised, zFace - 0.0045, bead.style);
}

/** Vertical ribs: a recessed backing with half-round battens, as a ribbed or reeded leaf. */
export function ribField(c: Ctx, field: Member, r: Region, f: Frame): void {
  const fieldFront = zFace - 0.02;
  span(field.bucket, r.x, r.y, [f.z[0] + 0.008, fieldFront], 0, field.style);
  c.relief.push({ x: r.x, y: r.y, z: zFace - 0.006 });
  const w = r.x[1] - r.x[0];
  const pitch = c.lod === 'near' ? 0.036 : 0.09;
  const n = Math.max(2, Math.floor(w / pitch));
  const rib = (w - 0.012) / n;
  for (let i = 0; i < n; i += 1) {
    const x0 = r.x[0] + 0.006 + i * rib + rib * 0.1;
    const x1 = r.x[0] + 0.006 + (i + 1) * rib - rib * 0.1;
    // Three faces only: the back, the top and the bottom never show.
    span(field.bucket, [x0, x1], r.y, [fieldFront - 0.001, zFace - 0.006], bevelOf(c, 0.0025), field.style, ['-z', '+y', '-y']);
  }
}

/** A grid of glazing bars over a pane: bars about every `pitch` metres each way. */
export function glazingBars(c: Ctx, bar: Member, x: readonly [number, number], y: readonly [number, number], z: number, pitchX = 0.3, pitchY = 0.3, w = 0.016): void {
  if (c.lod !== 'near') return;
  const nx = Math.max(1, Math.round((x[1] - x[0]) / pitchX));
  const ny = Math.max(1, Math.round((y[1] - y[0]) / pitchY));
  const zr: readonly [number, number] = [z - 0.003, z + 0.012];
  for (let i = 1; i < nx; i += 1) {
    const px = x[0] + ((x[1] - x[0]) * i) / nx;
    span(bar.bucket, [px - w / 2, px + w / 2], y, zr, bevelOf(c, 0.0015), bar.style);
  }
  for (let j = 1; j < ny; j += 1) {
    const py = y[0] + ((y[1] - y[0]) * j) / ny;
    span(bar.bucket, x, [py - w / 2, py + w / 2], zr, bevelOf(c, 0.0015), bar.style);
  }
}

/**
 * Diagonal bracing over a steel panel: a Z of flat bar (top, diagonal, bottom) or an X, riveted
 * at the ends, standing proud of the sheet as a reinforcement welded on later.
 */
export function bracing(c: Ctx, brace: Member, rivets: Member, r: Region, z: number, cross: boolean): void {
  const [x0, x1] = r.x;
  const [y0, y1] = r.y;
  const t = 0.05;
  const depth = 0.009;
  const flat = (a: [number, number], b: [number, number]): void => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    bar(brace.bucket, { at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z + depth / 2], rot: [0, 0, ang] }, [len, t, depth], brace.style);
  };
  const m = 0.03;
  if (cross) {
    flat([x0 + m, y0 + m], [x1 - m, y1 - m]);
    flat([x0 + m, y1 - m], [x1 - m, y0 + m]);
  } else {
    flat([x0 + m, y0 + m], [x1 - m, y1 - m]);
    span(brace.bucket, [x0 + m, x1 - m], [y1 - m - t / 2, y1 - m + t / 2], [z, z + depth], 0.002, brace.style);
    span(brace.bucket, [x0 + m, x1 - m], [y0 + m - t / 2, y0 + m + t / 2], [z, z + depth], 0.002, brace.style);
  }
  if (c.lod !== 'near') return;
  const ends: [number, number][] = cross
    ? [[x0 + m, y0 + m], [x1 - m, y1 - m], [x0 + m, y1 - m], [x1 - m, y0 + m]]
    : [[x0 + m + 0.02, y0 + m], [x1 - m - 0.02, y0 + m], [x0 + m + 0.02, y1 - m], [x1 - m - 0.02, y1 - m]];
  for (const [px, py] of ends) stud(rivets.bucket, [px, py, z + depth + 0.002], 0.009, 0.0075, 0.005, 8, rivets.style);
  c.relief.push({ x: r.x, y: r.y, z: z + depth });
}

/** A round inspection cover: a flanged rim, a disc painted over, eight bolts, one with its head chewed by a spanner. */
export function roundCover(c: Ctx, disc: Member, rim: Member, bolts: Member, cx: number, cy: number, radius: number, z: number): void {
  stud(disc.bucket, [cx, cy, z + 0.004], radius * 0.96, radius * 0.96, 0.008, c.lod === 'near' ? 36 : 14, disc.style);
  if (c.lod === 'near') torus(rim.bucket, { at: [cx, cy, z + 0.008] }, radius, 0.011, 6, 40, rim.style);
  else torus(rim.bucket, { at: [cx, cy, z + 0.008] }, radius, 0.011, 4, 16, rim.style);
  if (c.lod === 'near') {
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2 + 0.3;
      stud(bolts.bucket, [cx + Math.cos(a) * (radius * 0.8), cy + Math.sin(a) * (radius * 0.8), z + 0.012], 0.0085, 0.0085, 0.008, 6, bolts.style);
    }
  }
  c.relief.push({ x: [cx - radius, cx + radius], y: [cy - radius, cy + radius], z: z + 0.008 });
}

/**
 * The right field builder for a motif: inset panels for the default, an arch for curved joinery,
 * an oval, or ribs. Glazed grids, bracing and apertures are placed by the families that own the
 * glass and the sheet.
 */
export function panelField(c: Ctx, motif: Motif | undefined, field: Member, bead: Member, r: Region, f: Frame): void {
  switch (motif) {
    case 'curved-joinery':
      return archField(c, field, bead, r, f);
    case 'oval-panels':
      return ovalField(c, field, bead, r, f);
    case 'vertical-ribs':
      return ribField(c, field, r, f);
    default:
      return rectField(c, field, bead, r, f);
  }
}

/** The relief height of the leaf at a point: the front-most field or panel that covers it, else the leaf face. */
export function surfaceZ(c: Ctx, x: number, y: number): number {
  let z = zFace;
  let found = false;
  for (const r of c.relief) {
    if (x >= r.x[0] && x <= r.x[1] && y >= r.y[0] && y <= r.y[1]) {
      // Later (inner, raised) entries override earlier (outer, recessed) ones.
      z = r.z;
      found = true;
    }
  }
  return found ? z : zFace;
}

/** The highest surface under a rectangle: where a mark of that size must sit to touch the leaf everywhere it matters. */
export function surfaceUnder(c: Ctx, x: readonly [number, number], y: readonly [number, number]): number {
  let top = -Infinity;
  const samples: [number, number][] = [[x[0], y[0]], [x[1], y[0]], [x[0], y[1]], [x[1], y[1]], [(x[0] + x[1]) / 2, (y[0] + y[1]) / 2]];
  for (const [sx, sy] of samples) top = Math.max(top, surfaceZ(c, sx, sy));
  return Number.isFinite(top) ? top : zFace;
}

/** A flat quad for something printed on the surface (used by builders that draw outlines as paint). */
export function printed(b: Bucket, x: readonly [number, number], y: readonly [number, number], z: number, style?: Style): void {
  quad(b, [x[0], y[0], z], [x[1], y[0], z], [x[1], y[1], z], [x[0], y[1], z], style, [0, 0, 1]);
}

