import type { CanvasTexture } from 'three';
import type { ChamberEntry } from '@tqw/engine';
import { VISIBLE_CHAMBERS } from '../../../chambers/registry.ts';
import { nth, mulberry32 } from '../math.ts';
import { context2d, createCanvas, makeTexture } from './canvas.ts';
import { drawTracked, FONTS, wrapLines } from './text.ts';

/**
 * One newspaper clipping per chamber, on the three stocks the art direction names: bone, buff
 * and grey-green. Each is typeset (Newsreader headline and dek, Sans Condensed stamps, a Mono
 * dateline), cut with a slightly uneven edge, foxed at the borders and pierced at the pin.
 * Sealed chambers carry a "NOT YET OPEN" rubber stamp across the foot: status is always text.
 * The words are the chamber registry's own clipping copy.
 */

export const CLIPPING_ATLAS = { width: 1024, height: 1536, cell: 512 } as const;

export const STOCKS = [
  { name: 'bone', hex: '#DDD5C8', edge: '#b9ad94' },
  { name: 'buff', hex: '#C8B78F', edge: '#a5925f' },
  { name: 'grey-green', hex: '#BDC3B5', edge: '#9aa28c' },
] as const;

/** Which stock a chamber's clipping is printed on, by registry order. */
export function stockOf(index: number): (typeof STOCKS)[number] {
  const order = [0, 1, 2] as const;
  return nth(STOCKS, nth(order, index % order.length));
}

/** The pixel rectangle of chamber `index`'s clipping in the atlas. */
export function clippingCell(index: number): { x: number; y: number; w: number; h: number } {
  const c = CLIPPING_ATLAS.cell;
  return { x: (index % 2) * c, y: Math.floor(index / 2) * c, w: c, h: c };
}

const INK = '#1f2224';

export function drawClippingAtlas(anisotropy: number): CanvasTexture {
  const canvas = createCanvas(CLIPPING_ATLAS.width, CLIPPING_ATLAS.height);
  const ctx = context2d(canvas);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  VISIBLE_CHAMBERS.forEach((entry, i) => drawClipping(ctx, clippingCell(i), entry, i));
  return makeTexture(canvas, { anisotropy });
}

function drawClipping(ctx: CanvasRenderingContext2D, cell: { x: number; y: number; w: number; h: number }, entry: ChamberEntry, index: number): void {
  const rng = mulberry32(0xc11b + index * 977);
  const stock = stockOf(index);
  ctx.save();
  ctx.translate(cell.x, cell.y);
  const m = 12;
  const { w, h } = cell;

  // The cut edge: straight runs with a small wander, one corner clipped.
  ctx.beginPath();
  const edge = (x0: number, y0: number, x1: number, y1: number, wander: number): void => {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 18));
    for (let i = 1; i <= n; i += 1) {
      const t = i / n;
      const nx = (y1 - y0) / Math.hypot(x1 - x0, y1 - y0);
      const ny = -(x1 - x0) / Math.hypot(x1 - x0, y1 - y0);
      const jitter = (rng() - 0.5) * wander;
      ctx.lineTo(x0 + (x1 - x0) * t + nx * jitter, y0 + (y1 - y0) * t + ny * jitter);
    }
  };
  ctx.moveTo(m + 8, m + 2);
  edge(m + 8, m + 2, w - m, m, 3.2);
  edge(w - m, m, w - m - 3, h - m - 14, 2.6);
  edge(w - m - 3, h - m - 14, w - m - 24, h - m, 2.4);
  edge(w - m - 24, h - m, m + 2, h - m - 2, 3.4);
  edge(m + 2, h - m - 2, m + 8, m + 2, 2.6);
  ctx.closePath();
  ctx.save();
  ctx.clip();

  // Stock with a gentle gradient, then grain, fibres and foxing.
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, stock.hex);
  g.addColorStop(1, shade(stock.hex, -10));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i += 1) {
    ctx.fillStyle = `rgba(${rng() > 0.5 ? '255,250,238' : '70,58,40'},${(rng() * 0.08).toFixed(3)})`;
    ctx.fillRect(rng() * w, rng() * h, 1.4, 1.4);
  }
  for (let i = 0; i < 40; i += 1) {
    const x = rng() * w;
    const y = rng() * h;
    ctx.strokeStyle = `rgba(255,250,240,${(0.05 + rng() * 0.08).toFixed(3)})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 30, y + (rng() - 0.5) * 30);
    ctx.stroke();
  }
  for (let i = 0; i < 9; i += 1) {
    const x = rng() * w;
    const y = rng() * h;
    const r = 8 + rng() * 26;
    const f = ctx.createRadialGradient(x, y, 0, x, y, r);
    f.addColorStop(0, 'rgba(120,86,40,0.10)');
    f.addColorStop(1, 'rgba(120,86,40,0)');
    ctx.fillStyle = f;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Age at the edges: darker, yellower, where hands and the pins have worked on it.
  const age = ctx.createRadialGradient(w / 2, h / 2, w * 0.26, w / 2, h / 2, w * 0.74);
  age.addColorStop(0, 'rgba(110,84,40,0)');
  age.addColorStop(1, 'rgba(110,84,40,0.34)');
  ctx.fillStyle = age;
  ctx.fillRect(0, 0, w, h);

  // Type.
  const left = 40;
  const width = w - 2 * left;
  ctx.fillStyle = INK;
  ctx.textBaseline = 'alphabetic';
  const [notice, department] = entry.clipping.dateline.split(' · ');
  ctx.font = `400 15px ${FONTS.mono}`;
  drawTracked(ctx, (notice ?? '').toUpperCase(), left, 54, 1.5, 'left');
  drawTracked(ctx, (department ?? '').toUpperCase(), left, 73, 1.5, 'left');
  ctx.fillRect(left, 84, width, 2.4);
  ctx.fillRect(left, 90, width, 0.9);

  let size = 54;
  let lines: string[] = [];
  for (; size >= 34; size -= 2) {
    ctx.font = `600 ${size}px ${FONTS.serif}`;
    lines = wrapLines(ctx, entry.clipping.headline, width);
    if (lines.length <= 4) break;
  }
  let y = 94 + size * 0.98;
  for (const line of lines) {
    ctx.fillText(line, left, y);
    y += size * 1.02;
  }
  ctx.fillRect(left, y - size * 0.62, 64, 2.2);
  ctx.font = `italic 400 23px ${FONTS.serif}`;
  y += size * 0.12;
  for (const line of wrapLines(ctx, entry.clipping.dek, width)) {
    ctx.fillText(line, left, y + 18);
    y += 29;
  }
  ctx.restore();

  // The pin: a hole near the top edge with a ring of lighter, rubbed paper around it.
  const px = w / 2 + (rng() - 0.5) * 30;
  ctx.fillStyle = 'rgba(40,32,22,0.5)';
  ctx.beginPath();
  ctx.arc(px, 28, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,248,230,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px, 28, 6, 0, Math.PI * 2);
  ctx.stroke();

  // The status, in the words and not in colour: a rubber stamp across the foot.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  const sealed = entry.status === 'sealed';
  const label = sealed ? 'NOT YET OPEN' : 'OPEN';
  const ink = sealed ? 'rgba(112,50,42,0.8)' : 'rgba(36,98,94,0.82)';
  ctx.translate(w * (sealed ? 0.56 : 0.74), h - 62);
  ctx.rotate(sealed ? -0.1 : 0.07);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 3;
  ctx.font = `700 ${sealed ? 30 : 28}px ${FONTS.cond}`;
  const tw = label.length * (sealed ? 18.5 : 18);
  ctx.strokeRect(-tw / 2 - 12, -26, tw + 24, 40);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-tw / 2 - 7, -21, tw + 14, 30);
  drawTracked(ctx, label, 0, 4, 3, 'center');
  // The stamp never inks evenly: speckle it back toward the paper.
  ctx.fillStyle = stock.hex;
  for (let i = 0; i < 60; i += 1) {
    ctx.globalAlpha = 0.25 + rng() * 0.5;
    ctx.fillRect((rng() - 0.5) * (tw + 24), (rng() - 0.5) * 40 - 6, 1 + rng() * 2, 1 + rng() * 2);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.restore();
}

function shade(hex: string, amount: number): string {
  const v = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, ((v >> s) & 255) + amount));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}
