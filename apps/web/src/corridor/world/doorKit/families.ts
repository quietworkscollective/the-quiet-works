import { quad, type Bucket, type Style } from '../builder.ts';
import type { Buckets } from '../buckets.ts';
import { mulRgb } from '../colour.ts';
import { DOOR_GRAMMAR, type Glazing } from '../../doorKit.ts';
import { cylinder, stud, torus } from '../shapes.ts';
import { bevelOf, body, glassBucket, member, span, zFace, type Ctx, type Member } from './ctx.ts';
import { buildFanlight } from './fanlight.ts';
import { bracing, glazingBars, panelField, roundCover, type Frame } from './motifs.ts';
import { LEAF_GAP, LEAF_THICKNESS } from './plan.ts';
import { nth } from '../math.ts';

/**
 * The four silhouette families. Each builds its leaf body (and a transom, where the spec has one)
 * from rails, stiles, panels and glass; they differ in proportion, construction and mechanism,
 * and share the mounting, plaque and light that make them one building. What fills a panel is
 * the door's motif (motifs.ts); which paint a member takes is its role in the door's look.
 */

function frameOf(c: Ctx, leaf: number, family: keyof typeof LEAF_THICKNESS): Frame {
  const l = nth(c.plan.leaves, leaf);
  const t = LEAF_THICKNESS[family];
  return {
    xl: Math.min(l.x0, l.x1),
    xr: Math.max(l.x0, l.x1),
    y0: LEAF_GAP.bottom,
    y1: LEAF_GAP.bottom + l.height,
    z: [zFace - t, zFace],
  };
}

/** A pane of glass with a bead (a slim frame) around it, in the plane just inside the frame face. */
function pane(c: Ctx, lb: Buckets, glazing: Glazing, x: readonly [number, number], y: readonly [number, number], z: number, bead: Bucket, beadStyle: Style, beadW = 0.016): void {
  const b = glassBucket(lb, glazing);
  quad(b, [x[0], y[0], z], [x[1], y[0], z], [x[1], y[1], z], [x[0], y[1], z], undefined, [0, 0, 1]);
  if (c.lod !== 'near') return;
  const zr: readonly [number, number] = [z - 0.002, z + 0.011];
  span(bead, [x[0], x[1]], [y[0], y[0] + beadW], zr, 0.002, beadStyle);
  span(bead, [x[0], x[1]], [y[1] - beadW, y[1]], zr, 0.002, beadStyle);
  span(bead, [x[0], x[0] + beadW], [y[0] + beadW, y[1] - beadW], zr, 0.002, beadStyle);
  span(bead, [x[1] - beadW, x[1]], [y[0] + beadW, y[1] - beadW], zr, 0.002, beadStyle);
}

/** The glazing-bar member: brass where the door's metal is its secondary colour, paint otherwise. */
function barMember(c: Ctx, lb: Buckets): Member {
  const m = member(c, lb, 'bar', false, c.look.roles.bar ?? 'secondary');
  const metallic = c.spec.material.secondary !== undefined && c.spec.material.secondary === c.spec.material.metal;
  return metallic ? { bucket: lb.brass, style: { colour: c.tints.secondary } } : m;
}

/* ------------------------------------------------------------------------------------------ */
/* Panelled timber                                                                            */
/* ------------------------------------------------------------------------------------------ */

export function buildPanelled(c: Ctx): void {
  const lb = nth(c.leaf, 0);
  const f = frameOf(c, 0, 'panelled-timber');
  const motif = c.spec.character?.motif;
  // Curved joinery is rounded all over: the members' edges are eased, not mitred.
  const bv = bevelOf(c, motif === 'curved-joinery' ? 0.007 : 0.003);
  const stile = member(c, lb, 'stile', false);
  const rail = member(c, lb, 'rail', true);
  const kick = member(c, lb, 'kick', true);
  const field = member(c, lb, 'panel', false);
  const bead = member(c, lb, 'bead', false);
  const [stileW, top, bot, lockH] = [0.11, 0.14, 0.22, 0.17];
  const lockMid = DOOR_GRAMMAR.handleCentreY;
  span(stile.bucket, [f.xl, f.xl + stileW], [f.y0, f.y1], f.z, bv, stile.style);
  span(stile.bucket, [f.xr - stileW, f.xr], [f.y0, f.y1], f.z, bv, stile.style);
  const ix: [number, number] = [f.xl + stileW, f.xr - stileW];
  span(rail.bucket, ix, [f.y1 - top, f.y1], f.z, bv, rail.style);
  span(kick.bucket, ix, [f.y0, f.y0 + bot], f.z, bv, kick.style);
  span(rail.bucket, ix, [lockMid - lockH / 2, lockMid + lockH / 2], f.z, bv, rail.style);

  const rows: [number, number][] = [
    [f.y0 + bot, lockMid - lockH / 2],
    [lockMid + lockH / 2, f.y1 - top],
  ];
  const inner = ix[1] - ix[0];
  const twoColumns = inner >= 0.75;
  const muntin = 0.09;
  const mid = (ix[0] + ix[1]) / 2;
  const columns: [number, number][] = twoColumns ? [[ix[0], mid - muntin / 2], [mid + muntin / 2, ix[1]]] : [ix];
  if (twoColumns) for (const [y0, y1] of rows) span(stile.bucket, [mid - muntin / 2, mid + muntin / 2], [y0, y1], f.z, bv, stile.style);
  const glazing = c.spec.material.glazing;
  rows.forEach(([y0, y1], r) => {
    for (const [x0, x1] of columns) {
      if (r === 1 && glazing !== 'none') {
        pane(c, lb, glazing, [x0, x1], [y0, y1], zFace - 0.016, rail.bucket, rail.style);
        if (motif === 'gridded-glazing') glazingBars(c, barMember(c, lb), [x0, x1], [y0, y1], zFace - 0.016);
      } else {
        panelField(c, motif, field, bead, { x: [x0, x1], y: [y0, y1] }, f);
      }
    }
  });
}

/* ------------------------------------------------------------------------------------------ */
/* Glazed office door                                                                         */
/* ------------------------------------------------------------------------------------------ */

export function buildGlazedOffice(c: Ctx): void {
  const lb = nth(c.leaf, 0);
  const f = frameOf(c, 0, 'glazed-office');
  const motif = c.spec.character?.motif;
  const bv = bevelOf(c);
  const stile = member(c, lb, 'stile', false);
  const rail = member(c, lb, 'rail', true);
  const kick = member(c, lb, 'kick', true);
  const field = member(c, lb, 'panel', false);
  const bead = member(c, lb, 'bead', false);
  const [stileW, top, bot, lockH] = [0.075, 0.095, 0.14, 0.14];
  const lockMid = DOOR_GRAMMAR.handleCentreY;
  span(stile.bucket, [f.xl, f.xl + stileW], [f.y0, f.y1], f.z, bv, stile.style);
  span(stile.bucket, [f.xr - stileW, f.xr], [f.y0, f.y1], f.z, bv, stile.style);
  const ix: [number, number] = [f.xl + stileW, f.xr - stileW];
  span(rail.bucket, ix, [f.y1 - top, f.y1], f.z, bv, rail.style);
  span(kick.bucket, ix, [f.y0, f.y0 + bot], f.z, bv, kick.style);
  span(rail.bucket, ix, [lockMid - lockH / 2, lockMid + lockH / 2], f.z, bv, rail.style);
  panelField(c, motif, field, bead, { x: ix, y: [f.y0 + bot, lockMid - lockH / 2] }, f);
  const g0 = lockMid + lockH / 2;
  const g1 = f.y1 - top;
  const glazing = c.spec.material.glazing === 'none' ? 'frosted' : c.spec.material.glazing;
  // Privacy glass in two textures: the upper light reeded, the lower one frosted.
  const lowerGlazing: Glazing = glazing === 'reeded' ? 'frosted' : glazing;
  const barY = (g0 + g1) / 2;
  const barW = 0.032;
  span(rail.bucket, ix, [barY - barW / 2, barY + barW / 2], [f.z[0] + 0.004, zFace - 0.006], bevelOf(c, 0.002), rail.style);
  pane(c, lb, lowerGlazing, [ix[0], ix[1]], [g0, barY - barW / 2], zFace - 0.016, rail.bucket, rail.style, 0.012);
  pane(c, lb, glazing, [ix[0], ix[1]], [barY + barW / 2, g1], zFace - 0.016, rail.bucket, rail.style, 0.012);
  if (motif === 'gridded-glazing') {
    const bars = barMember(c, lb);
    glazingBars(c, bars, ix, [g0, barY - barW / 2], zFace - 0.016, 0.26, 0.2, 0.012);
    glazingBars(c, bars, ix, [barY + barW / 2, g1], zFace - 0.016, 0.26, 0.2, 0.012);
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Steel industrial insertion                                                                 */
/* ------------------------------------------------------------------------------------------ */

export function buildSteel(c: Ctx): void {
  const lb = nth(c.leaf, 0);
  const f = frameOf(c, 0, 'steel-insertion');
  const motif = c.spec.character?.motif;
  const bv = bevelOf(c, 0.003);
  const t = c.tints;
  const frameStyle: Style = { colour: c.look.roles.frame === 'primary' ? t.primary : c.spec.material.secondary ? t.secondary : mulRgb(t.primary, 0.78) };
  const panelBucket = c.spec.material.secondary ? lb.enamel : lb.paint;
  // Painted iron and enamel read darker than their hex under dim light; lift the leaf's own tint a little.
  const panelStyle: Style = { colour: c.spec.material.secondary ? t.primary : mulRgb(t.primary, 1.7) };
  const glazing = c.spec.material.glazing;
  const bar = 0.05;

  // The frame: a box-section steel perimeter.
  span(lb.paint, [f.xl, f.xl + bar], [f.y0, f.y1], f.z, bv, frameStyle);
  span(lb.paint, [f.xr - bar, f.xr], [f.y0, f.y1], f.z, bv, frameStyle);
  const ix: [number, number] = [f.xl + bar, f.xr - bar];
  span(lb.paint, ix, [f.y1 - bar, f.y1], f.z, bv, frameStyle);
  span(lb.paint, ix, [f.y0, f.y0 + bar], f.z, bv, frameStyle);

  const split = glazing === 'wired' ? f.y0 + 0.733 * (f.y1 - f.y0) : f.y1 - bar;
  const lowerTop = glazing === 'wired' ? split - 0.025 : f.y1 - bar;
  if (glazing === 'wired') span(lb.paint, ix, [split - 0.025, split + 0.025], f.z, bv, frameStyle);

  // Lower panel: pressed sheet, recessed in the frame, with a shallow raised margin.
  const panelFront = zFace - 0.006;
  span(panelBucket, ix, [f.y0 + bar, lowerTop], [f.z[0] + 0.012, panelFront], bevelOf(c, 0.002), panelStyle);
  c.relief.push({ x: ix, y: [f.y0 + bar, lowerTop], z: panelFront });
  if (c.lod === 'near') {
    const m = 0.04;
    span(panelBucket, [ix[0] + m, ix[1] - m], [f.y0 + bar + m, lowerTop - m], [panelFront - 0.002, zFace - 0.0035], 0.003, panelStyle);
    c.relief.push({ x: [ix[0] + m, ix[1] - m], y: [f.y0 + bar + m, lowerTop - m], z: zFace - 0.0035 });
  }
  if (glazing === 'wired') {
    pane(c, lb, 'wired', [ix[0], ix[1]], [split + 0.025, f.y1 - bar], zFace - 0.014, lb.paint, frameStyle, 0.014);
    if (motif === 'gridded-glazing') {
      glazingBars(c, { bucket: lb.paint, style: frameStyle }, ix, [split + 0.025, f.y1 - bar], zFace - 0.014, 0.3, 0.2, 0.016);
    }
  }
  if (glazing === 'porthole') {
    const cy = f.y0 + 0.74 * (f.y1 - f.y0);
    const cx = (f.xl + f.xr) / 2;
    const metal = { colour: t.metal };
    if (c.spec.character?.history === 'neglected') {
      // An inspection cover, painted shut: the same ring, with the disc painted over like the leaf.
      roundCover(c, { bucket: panelBucket, style: panelStyle }, { bucket: lb.brass, style: metal }, { bucket: lb.paint, style: frameStyle }, cx, cy, 0.142, zFace - 0.004);
    } else {
      cylinder(lb.glass, { at: [cx, cy, zFace - 0.006], rot: [Math.PI / 2, 0, 0] }, 0.142, 0.142, 0.004, 28);
      torus(lb.brass, { at: [cx, cy, zFace + 0.004] }, 0.152, 0.015, 6, c.lod === 'near' ? 32 : 14, metal);
      if (c.lod === 'near') {
        for (let k = 0; k < 8; k += 1) {
          const a = (k / 8) * Math.PI * 2 + 0.2;
          stud(lb.brass, [cx + Math.cos(a) * 0.152, cy + Math.sin(a) * 0.152, zFace + 0.0185], 0.0085, 0.0085, 0.008, 8, metal);
        }
      }
    }
  }
  if (motif === 'diagonal-bracing') {
    bracing(c, { bucket: lb.paint, style: frameStyle }, { bucket: lb.iron, style: { colour: [0.5, 0.5, 0.5] } }, { x: ix, y: [f.y0 + bar, lowerTop] }, zFace - 0.0035, false);
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Tall double ceremonial doors                                                               */
/* ------------------------------------------------------------------------------------------ */

export function buildCeremonial(c: Ctx): void {
  const glazing = c.spec.material.glazing;
  const motif = c.spec.character?.motif;
  const bv = bevelOf(c, motif === 'curved-joinery' ? 0.005 : 0.003);
  c.plan.leaves.forEach((leaf, i) => {
    const lb = nth(c.leaf, i);
    const f = frameOf(c, i, 'ceremonial-double');
    const outerIsLeft = leaf.hinge === 'left';
    const stile = member(c, lb, 'stile', false);
    const rail = member(c, lb, 'rail', true);
    const kick = member(c, lb, 'kick', true);
    const field = member(c, lb, 'panel', false);
    const bead = member(c, lb, 'bead', false);
    const [outer, meeting, top, bot] = [0.14, 0.11, 0.18, 0.3];
    const xo: [number, number] = outerIsLeft ? [f.xl, f.xl + outer] : [f.xr - outer, f.xr];
    const xm: [number, number] = outerIsLeft ? [f.xr - meeting, f.xr] : [f.xl, f.xl + meeting];
    span(stile.bucket, xo, [f.y0, f.y1], f.z, bv, stile.style);
    span(stile.bucket, xm, [f.y0, f.y1], f.z, bv, stile.style);
    const ix: [number, number] = outerIsLeft ? [xo[1], xm[0]] : [xm[1], xo[0]];
    span(rail.bucket, ix, [f.y1 - top, f.y1], f.z, bv, rail.style);
    span(kick.bucket, ix, [f.y0, f.y0 + bot], f.z, bv, kick.style);
    const midLow = 1.12;
    const midHigh = 1.28;
    span(rail.bucket, ix, [midLow, midHigh], f.z, bv, rail.style);
    panelField(c, motif, field, bead, { x: ix, y: [f.y0 + bot, midLow] }, f);
    const g0 = midHigh;
    const g1 = f.y1 - top;
    if (glazing !== 'none') {
      pane(c, lb, glazing, [ix[0], ix[1]], [g0, g1], zFace - 0.016, rail.bucket, rail.style, 0.02);
      const bars = barMember(c, lb);
      // Glazing bars: one upright, and a bar about every third of a metre.
      if (motif === 'gridded-glazing' || motif === undefined) glazingBars(c, bars, ix, [g0, g1], zFace - 0.016, Math.max(0.3, (ix[1] - ix[0]) / 2), 0.36, 0.024);
    } else {
      if (motif === 'oval-panels') {
        // One tall oval above the lock rail: the grace of the door.
        panelField(c, motif, field, bead, { x: ix, y: [g0, g1] }, f);
      } else {
        const split = (g0 + g1) / 2;
        const railW = 0.12;
        span(rail.bucket, ix, [split - railW / 2, split + railW / 2], f.z, bv, rail.style);
        panelField(c, motif, field, bead, { x: ix, y: [g0, split - railW / 2] }, f);
        panelField(c, motif, field, bead, { x: ix, y: [split + railW / 2, g1] }, f);
      }
    }
  });
}

/* ------------------------------------------------------------------------------------------ */
/* Transom                                                                                    */
/* ------------------------------------------------------------------------------------------ */

/** A fixed light above the leaf: a bottom rail, glass, and muntins at about 0.45 m. */
export function buildTransom(c: Ctx): void {
  const tr = c.plan.transom;
  if (!tr) return;
  if (c.look.signature === 'fanlight') {
    buildFanlight(c);
    return;
  }
  const b = c.fixed;
  const x: [number, number] = [-c.spec.width / 2, c.spec.width / 2];
  const glazing = c.plan.parts.find((p) => p.kind === 'transom')?.glazing ?? 'clear';
  const steel = c.spec.family === 'steel-insertion';
  const railM = steel ? null : body(c, b, true);
  const style: Style = steel ? { colour: c.spec.material.secondary ? c.tints.secondary : mulRgb(c.tints.primary, 0.78) } : (railM as Member).style;
  const bucket = steel ? b.paint : (railM as Member).bucket;
  const z: readonly [number, number] = [zFace - 0.04, zFace];
  const rail = 0.05;
  const bv = bevelOf(c);
  const y0 = tr.bottom;
  const y1 = tr.bottom + tr.height;
  span(bucket, x, [y0, y0 + rail], z, bv, style);
  if (steel) {
    span(bucket, x, [y1 - 0.04, y1], z, bv, style);
    span(bucket, [x[0], x[0] + 0.04], [y0 + rail, y1 - 0.04], z, bv, style);
    span(bucket, [x[1] - 0.04, x[1]], [y0 + rail, y1 - 0.04], z, bv, style);
  }
  const gy0 = y0 + rail;
  const gy1 = steel ? y1 - 0.04 : y1;
  const gx0 = steel ? x[0] + 0.04 : x[0];
  const gx1 = steel ? x[1] - 0.04 : x[1];
  const n = Math.max(1, Math.round((gx1 - gx0) / 0.45));
  const mun = 0.034;
  for (let k = 0; k < n; k += 1) {
    const a = gx0 + ((gx1 - gx0) * k) / n + (k === 0 ? 0 : mun / 2);
    const bb = gx0 + ((gx1 - gx0) * (k + 1)) / n - (k === n - 1 ? 0 : mun / 2);
    pane(c, b, glazing, [a, bb], [gy0, gy1], zFace - 0.014, bucket, style, 0.012);
    if (k > 0) span(bucket, [a - mun / 2 - 0.0, a + mun / 2], [gy0, gy1], z, bevelOf(c, 0.002), style);
  }
  if (c.lod === 'near' && !steel) span(bucket, x, [y0 + rail, y0 + rail + 0.016], [zFace - 0.02, zFace + 0.004], 0.002, style);
}
