import type { CanvasTexture } from 'three';
import { VISIBLE_CHAMBERS } from '../../../chambers/registry.ts';
import { ART, ART_ATLAS, NUMERAL_4, NUMERAL_ATLAS, PLAQUE_ATLAS, type PlaqueLayout, type Rect } from '../artLayout.ts';
import { mulberry32 } from '../math.ts';
import { context2d, createCanvas, makeTexture } from './canvas.ts';
import { drawTracked, FONTS, fitFont, trackedWidth } from './text.ts';

/**
 * The corridor's lettered art, typeset with the app's own fonts and drawn from code: door
 * plaques (all one format: bone enamel, Sans Condensed title, Mono code), a brass numeral, and
 * an atlas of framed drawings, a directory and a pressure gauge. Nothing here is generated
 * text: every string is either a chamber's own plaque or a drawing's draughtsman's label.
 */

const INK = '#1d2326';

/* ------------------------------------------------------------------------------------------ */
/* Plaques                                                                                    */
/* ------------------------------------------------------------------------------------------ */

export function drawPlaqueAtlas(layout: PlaqueLayout, anisotropy: number): CanvasTexture {
  const { width, height, slot } = PLAQUE_ATLAS;
  const canvas = createCanvas(width, height);
  const ctx = context2d(canvas);
  ctx.fillStyle = '#d8cfc0';
  ctx.fillRect(0, 0, width, height);
  const rng = mulberry32(0x91a2);
  for (const plaque of layout.all) {
    const r = layout.rect(plaque.text);
    drawPlaque(ctx, r, plaque.text, plaque.code, rng);
  }
  void slot;
  return makeTexture(canvas, { anisotropy });
}

function drawPlaque(ctx: CanvasRenderingContext2D, r: Rect, title: string, code: string | undefined, rng: () => number): void {
  ctx.save();
  ctx.translate(r.x, r.y);
  const { w, h } = r;
  // Enamel: a faint top-to-bottom gradient, never flat.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#e6dfd2');
  g.addColorStop(0.5, '#ddd5c8');
  g.addColorStop(1, '#d3cabb');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // The rim: a slightly darker edge where the enamel thins, then a fine black keyline inset.
  ctx.strokeStyle = 'rgba(96,84,64,0.55)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, w - 6, h - 6);
  ctx.strokeStyle = 'rgba(29,35,38,0.92)';
  ctx.lineWidth = 3;
  ctx.strokeRect(13, 13, w - 26, h - 26);

  const hasCode = Boolean(code);
  ctx.fillStyle = INK;
  ctx.textBaseline = 'alphabetic';
  const maxW = w - 78;
  const size = fitFont(ctx, title, (s) => `600 ${s}px ${FONTS.cond}`, maxW, hasCode ? 58 : 66, 0.07, 18);
  const baseline = hasCode ? h * 0.52 : h * 0.6;
  drawTracked(ctx, title, w / 2, baseline, 0.07 * size, 'center');
  if (code) {
    ctx.strokeStyle = 'rgba(29,35,38,0.55)';
    ctx.lineWidth = 1.4;
    const rule = Math.min(maxW, trackedWidth(ctx, title, 0.07 * size)) * 0.5;
    ctx.beginPath();
    ctx.moveTo(w / 2 - rule, h * 0.63);
    ctx.lineTo(w / 2 + rule, h * 0.63);
    ctx.stroke();
    ctx.font = `400 22px ${FONTS.mono}`;
    ctx.fillStyle = 'rgba(29,35,38,0.78)';
    drawTracked(ctx, code, w / 2, h * 0.81, 3.2, 'center');
  }
  // A century of handling: a few chips in the corners and one soft scuff.
  ctx.fillStyle = 'rgba(40,34,26,0.55)';
  for (let i = 0; i < 7; i += 1) {
    const cx = rng() < 0.5 ? 4 + rng() * 14 : w - 4 - rng() * 14;
    const cy = rng() < 0.5 ? 4 + rng() * 14 : h - 4 - rng() * 14;
    ctx.beginPath();
    ctx.arc(cx, cy, 0.8 + rng() * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  const scuff = ctx.createLinearGradient(w * 0.3, 0, w * 0.55, h);
  scuff.addColorStop(0, 'rgba(255,255,255,0)');
  scuff.addColorStop(0.5, 'rgba(255,255,255,0.1)');
  scuff.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = scuff;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/* ------------------------------------------------------------------------------------------ */
/* Brass numeral                                                                              */
/* ------------------------------------------------------------------------------------------ */

/** A brass "4" for the Apartment's door, cut out by alpha, with a bevelled look. */
export function drawNumeralAtlas(anisotropy: number): CanvasTexture {
  const canvas = createCanvas(NUMERAL_ATLAS.width, NUMERAL_ATLAS.height);
  const ctx = context2d(canvas);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const r = NUMERAL_4;
  const cx = r.x + r.w / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 184px ${FONTS.serif}`;
  const base = r.y + r.h - 18;
  // Shadow edge, body in a brass gradient, a thin highlight along the upper-left of each stroke.
  ctx.fillStyle = 'rgb(58,44,22)';
  ctx.fillText('4', cx + 2.2, base + 2.2);
  const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
  g.addColorStop(0, 'rgb(236,208,150)');
  g.addColorStop(0.5, 'rgb(190,150,84)');
  g.addColorStop(1, 'rgb(140,104,52)');
  ctx.fillStyle = g;
  ctx.fillText('4', cx, base);
  ctx.strokeStyle = 'rgba(255,240,200,0.55)';
  ctx.lineWidth = 1.4;
  ctx.strokeText('4', cx - 0.8, base - 0.8);
  return makeTexture(canvas, { anisotropy });
}

/* ------------------------------------------------------------------------------------------ */
/* Framed drawings, directory, gauge                                                          */
/* ------------------------------------------------------------------------------------------ */

function paper(ctx: CanvasRenderingContext2D, r: Rect, rng: () => number): void {
  const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
  g.addColorStop(0, '#e9e0c9');
  g.addColorStop(1, '#ddd2b6');
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  // Age: a foxed edge and a few brown flecks.
  const edge = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, Math.min(r.w, r.h) * 0.32, r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h) * 0.72);
  edge.addColorStop(0, 'rgba(120,88,44,0)');
  edge.addColorStop(1, 'rgba(120,88,44,0.32)');
  ctx.fillStyle = edge;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  for (let i = 0; i < r.w * 0.09; i += 1) {
    ctx.fillStyle = `rgba(110,80,40,${(0.06 + rng() * 0.12).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(r.x + rng() * r.w, r.y + rng() * r.h, 0.5 + rng() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A building section, drawn as a draughtsman would: poche walls, floor slabs, stair, dimension line. */
function drawSection(ctx: CanvasRenderingContext2D, r: Rect, rng: () => number): void {
  paper(ctx, r, rng);
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.strokeStyle = '#2b241c';
  ctx.fillStyle = '#2b241c';
  ctx.lineWidth = 1.6;
  const L = 46;
  const R = r.w - 46;
  const ground = r.h - 74;
  const storey = 78;
  // Ground line with hatching beneath.
  ctx.beginPath();
  ctx.moveTo(L - 24, ground);
  ctx.lineTo(R + 24, ground);
  ctx.stroke();
  ctx.lineWidth = 0.8;
  for (let x = L - 24; x < R + 24; x += 9) {
    ctx.beginPath();
    ctx.moveTo(x, ground);
    ctx.lineTo(x - 8, ground + 9);
    ctx.stroke();
  }
  // Walls (poche): solid blocks with diagonal hatching, three storeys.
  const wallW = 18;
  const top = ground - storey * 3;
  const hatch = (x: number, y: number, w: number, h: number) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = 'rgba(43,36,28,0.12)';
    ctx.fillRect(x, y, w, h);
    ctx.lineWidth = 0.7;
    for (let k = -h; k < w + h; k += 4) {
      ctx.beginPath();
      ctx.moveTo(x + k, y + h);
      ctx.lineTo(x + k + h, y);
      ctx.stroke();
    }
    ctx.restore();
    ctx.lineWidth = 1.6;
    ctx.strokeRect(x, y, w, h);
  };
  hatch(L, top, wallW, ground - top);
  hatch(R - wallW, top, wallW, ground - top);
  const spine = (L + R) / 2;
  hatch(spine - 9, top + storey * 0.4, 18, ground - top - storey * 0.4);
  // Floor slabs.
  for (let i = 0; i <= 3; i += 1) {
    const y = ground - storey * i;
    hatch(L, y - 7, R - L, 7);
  }
  // Roof: pitched, with a king-post truss over the middle bay.
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(L - 10, top - 7);
  ctx.lineTo(spine, top - 62);
  ctx.lineTo(R + 10, top - 7);
  ctx.stroke();
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(spine, top - 62);
  ctx.lineTo(spine, top - 7);
  ctx.moveTo(spine, top - 40);
  ctx.lineTo(L + 44, top - 7);
  ctx.moveTo(spine, top - 40);
  ctx.lineTo(R - 44, top - 7);
  ctx.stroke();
  // Stair in the left bay: a zigzag of flights between landings.
  ctx.lineWidth = 1.2;
  for (let f = 0; f < 3; f += 1) {
    const y0 = ground - storey * f - 7;
    const dir = f % 2 === 0 ? 1 : -1;
    const x0 = dir > 0 ? L + wallW + 8 : spine - 22;
    ctx.beginPath();
    for (let s = 0; s <= 8; s += 1) {
      const x = x0 + dir * s * 11;
      const y = y0 - s * ((storey - 7) / 8);
      if (s === 0) ctx.moveTo(x, y);
      else {
        ctx.lineTo(x, y + (storey - 7) / 8);
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }
  // Openings and arches in the right bay.
  ctx.lineWidth = 1.1;
  for (let f = 0; f < 3; f += 1) {
    const yb = ground - storey * f - 7;
    for (const x of [spine + 38, spine + 88, spine + 138]) {
      ctx.beginPath();
      ctx.moveTo(x, yb);
      ctx.lineTo(x, yb - 40);
      ctx.arc(x + 11, yb - 40, 11, Math.PI, 0);
      ctx.lineTo(x + 22, yb);
      ctx.stroke();
    }
  }
  // Dimension line with ticks and figures, on the right.
  ctx.lineWidth = 0.9;
  ctx.font = `400 11px ${FONTS.mono}`;
  ctx.textAlign = 'left';
  const dx = R + 24;
  ctx.beginPath();
  ctx.moveTo(dx, ground);
  ctx.lineTo(dx, top);
  ctx.stroke();
  for (let i = 0; i <= 3; i += 1) {
    const y = ground - storey * i;
    ctx.beginPath();
    ctx.moveTo(dx - 5, y + 3);
    ctx.lineTo(dx + 5, y - 3);
    ctx.stroke();
    if (i > 0) ctx.fillText('3.6', dx + 8, y + storey / 2 + 4);
  }
  // Title block.
  ctx.lineWidth = 1.2;
  ctx.strokeRect(r.w - 174, r.h - 54, 150, 38);
  ctx.textAlign = 'left';
  ctx.font = `italic 400 15px ${FONTS.serif}`;
  ctx.fillText('SECTION A-A', r.w - 164, r.h - 34);
  ctx.font = `400 10px ${FONTS.mono}`;
  ctx.fillText('SCALE 1:100', r.w - 164, r.h - 21);
  ctx.restore();
}

/** A floor plan: wall outlines, a corridor spine, rooms numbered in Mono, door swings. */
function drawPlan(ctx: CanvasRenderingContext2D, r: Rect, rng: () => number): void {
  paper(ctx, r, rng);
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.strokeStyle = '#2b241c';
  ctx.fillStyle = '#2b241c';
  const m = 34;
  const w = r.w - 2 * m;
  const h = r.h - 2 * m - 30;
  ctx.lineWidth = 3.2;
  ctx.strokeRect(m, m, w, h);
  // The spine: two long walls with a corridor between them.
  const cw = 38;
  const cx = m + w / 2;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - cw / 2, m);
  ctx.lineTo(cx - cw / 2, m + h);
  ctx.moveTo(cx + cw / 2, m);
  ctx.lineTo(cx + cw / 2, m + h);
  ctx.stroke();
  ctx.font = `400 12px ${FONTS.mono}`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 1.2;
  const rooms = 6;
  const bay = h / rooms;
  for (let i = 0; i < rooms; i += 1) {
    const y = m + i * bay;
    for (const side of [-1, 1]) {
      const wallX = cx + side * (cw / 2);
      const outer = side < 0 ? m : m + w;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(wallX, y);
      ctx.lineTo(outer, y);
      ctx.stroke();
      // A door: a gap in the corridor wall, its leaf open at right angles, and the swing arc.
      const dy = y + bay * 0.42;
      ctx.fillStyle = '#e1d7bb';
      ctx.fillRect(wallX - 2, dy, 4, 14);
      ctx.fillStyle = '#2b241c';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(wallX, dy);
      ctx.lineTo(wallX + side * 14, dy);
      ctx.moveTo(wallX + side * 14, dy);
      ctx.arc(wallX, dy, 14, side > 0 ? 0 : Math.PI, Math.PI / 2, side < 0);
      ctx.stroke();
      const label = String(i * 2 + (side < 0 ? 1 : 2)).padStart(2, '0');
      ctx.fillText(label, (wallX + outer) / 2, y + bay * 0.56);
    }
  }
  ctx.textAlign = 'left';
  ctx.font = `italic 400 14px ${FONTS.serif}`;
  ctx.fillText('FIRST FLOOR', m, r.h - 26);
  ctx.font = `400 10px ${FONTS.mono}`;
  ctx.fillText('SCALE 1:200', m + 108, r.h - 26);
  ctx.restore();
}

/** The glazed directory board: black felt, a brass header, one row per department, empty channels. */
function drawDirectory(ctx: CanvasRenderingContext2D, r: Rect, rng: () => number): void {
  ctx.save();
  ctx.translate(r.x, r.y);
  const g = ctx.createLinearGradient(0, 0, 0, r.h);
  g.addColorStop(0, '#1b1e1f');
  g.addColorStop(1, '#141718');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, r.w, r.h);
  for (let i = 0; i < r.w * 3; i += 1) {
    ctx.fillStyle = `rgba(255,255,255,${(rng() * 0.05).toFixed(3)})`;
    ctx.fillRect(rng() * r.w, rng() * r.h, 1.3, 1.3);
  }
  // Header.
  ctx.fillStyle = '#9a8052';
  ctx.font = `600 28px ${FONTS.cond}`;
  ctx.textBaseline = 'alphabetic';
  drawTracked(ctx, 'DIRECTORY', r.w / 2, 58, 9, 'center');
  ctx.fillStyle = 'rgba(154,128,82,0.6)';
  ctx.fillRect(34, 76, r.w - 68, 2);
  // Rows: department name left, code right.
  const rowH = 70;
  const rows = VISIBLE_CHAMBERS.length + 3;
  for (let i = 0; i < rows; i += 1) {
    const y = 96 + i * rowH;
    // The channel the letters slide into.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(28, y, r.w - 56, rowH - 14);
    const entry = VISIBLE_CHAMBERS[i];
    if (!entry) continue;
    ctx.fillStyle = '#e3dac8';
    ctx.font = `600 25px ${FONTS.cond}`;
    drawTracked(ctx, entry.title.toUpperCase(), 44, y + 28, 2.2, 'left');
    ctx.fillStyle = '#b9ae95';
    ctx.font = `400 14px ${FONTS.mono}`;
    drawTracked(ctx, entry.status === 'open' ? 'OPEN' : 'NOT YET OPEN', 44, y + 49, 1.8, 'left');
  }
  ctx.restore();
}

/** A pressure gauge dial: cream face, ticks, Mono numerals, a dark arc at the top, a resting needle. */
function drawGauge(ctx: CanvasRenderingContext2D, r: Rect): void {
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  const R = r.w / 2 - 2;
  const face = ctx.createRadialGradient(0, -R * 0.2, R * 0.1, 0, 0, R);
  face.addColorStop(0, '#efe6d0');
  face.addColorStop(1, '#d8cdb0');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2a251d';
  ctx.fillStyle = '#2a251d';
  const a0 = Math.PI * 0.75;
  const a1 = Math.PI * 2.25;
  // The danger arc.
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(112,44,36,0.85)';
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.8, a0 + (a1 - a0) * 0.8, a1);
  ctx.stroke();
  ctx.strokeStyle = '#2a251d';
  for (let i = 0; i <= 50; i += 1) {
    const a = a0 + ((a1 - a0) * i) / 50;
    const major = i % 5 === 0;
    ctx.lineWidth = major ? 2.4 : 1.2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9);
    ctx.lineTo(Math.cos(a) * R * (major ? 0.74 : 0.82), Math.sin(a) * R * (major ? 0.74 : 0.82));
    ctx.stroke();
  }
  ctx.font = `600 17px ${FONTS.mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 10; i += 1) {
    const a = a0 + ((a1 - a0) * i) / 10;
    ctx.fillText(String(i), Math.cos(a) * R * 0.58, Math.sin(a) * R * 0.58);
  }
  ctx.font = `400 12px ${FONTS.mono}`;
  ctx.fillText('BAR', 0, R * 0.32);
  // Needle resting at about 3 bar, with a hub.
  const an = a0 + (a1 - a0) * 0.31;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-Math.cos(an) * R * 0.14, -Math.sin(an) * R * 0.14);
  ctx.lineTo(Math.cos(an) * R * 0.74, Math.sin(an) * R * 0.74);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A station-clock dial: ivory with a minute track, black Arabic numerals and no maker's name. */
function drawClockDial(ctx: CanvasRenderingContext2D, r: Rect): void {
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  const R = r.w / 2 - 1;
  const face = ctx.createRadialGradient(0, -R * 0.15, R * 0.1, 0, 0, R);
  face.addColorStop(0, '#f1e9d3');
  face.addColorStop(1, '#ddd2b4');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#231f18';
  ctx.fillStyle = '#231f18';
  for (let k = 0; k < 60; k += 1) {
    const a = (k / 60) * Math.PI * 2;
    const long = k % 5 === 0;
    ctx.lineWidth = long ? 3.2 : 1.2;
    ctx.beginPath();
    ctx.moveTo(Math.sin(a) * (R - 3), -Math.cos(a) * (R - 3));
    ctx.lineTo(Math.sin(a) * (R - (long ? 15 : 9)), -Math.cos(a) * (R - (long ? 15 : 9)));
    ctx.stroke();
  }
  ctx.font = `600 ${Math.round(R * 0.2)}px ${FONTS.cond}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let h = 1; h <= 12; h += 1) {
    const a = (h / 12) * Math.PI * 2;
    ctx.fillText(String(h), Math.sin(a) * R * 0.72, -Math.cos(a) * R * 0.72 + 1);
  }
  ctx.restore();
}

export function drawArtAtlas(anisotropy: number): CanvasTexture {
  const canvas = createCanvas(ART_ATLAS.width, ART_ATLAS.height);
  const ctx = context2d(canvas);
  ctx.fillStyle = '#6a604c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const rng = mulberry32(0x3d17);
  drawSection(ctx, ART.section, rng);
  drawPlan(ctx, ART.plan, rng);
  drawDirectory(ctx, ART.directory, rng);
  drawGauge(ctx, ART.gauge);
  drawClockDial(ctx, ART.clock);
  return makeTexture(canvas, { anisotropy });
}
