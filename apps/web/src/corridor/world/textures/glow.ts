import type { CanvasTexture } from 'three';
import { context2d, createCanvas, makeTexture } from './canvas.ts';

/** Soft-edged gradients: contact shadows, light pools and the faint sheen on glass. */

/** Black whose alpha falls from `peak` at v = 0 to nothing at v = 1, along a smooth curve. */
export function drawRamp(peak = 1): CanvasTexture {
  const w = 4;
  const h = 128;
  const canvas = createCanvas(w, h);
  const ctx = context2d(canvas);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (let i = 0; i <= 16; i += 1) {
    const t = i / 16;
    g.addColorStop(t, `rgba(0,0,0,${(peak * Math.pow(1 - t, 2.2)).toFixed(4)})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return makeTexture(canvas, { mipmaps: false });
}

/** White radial falloff (alpha and colour both), for additive pools and halos. */
export function drawRadial(): CanvasTexture {
  const size = 128;
  const canvas = createCanvas(size, size);
  const ctx = context2d(canvas);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (let i = 0; i <= 14; i += 1) {
    const t = i / 14;
    const a = Math.pow(1 - t, 2.4);
    g.addColorStop(t, `rgba(${Math.round(255 * a)},${Math.round(255 * a)},${Math.round(255 * a)},1)`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return makeTexture(canvas, { mipmaps: false });
}

/**
 * A pale diagonal band, as a lamp glances off a pane of glass. Used additively over framed
 * pictures and the directory; it carries no detail, only the suggestion of a surface.
 */
export function drawSheen(): CanvasTexture {
  const size = 128;
  const canvas = createCanvas(size, size);
  const ctx = context2d(canvas);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  const g = ctx.createLinearGradient(0, size, size, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.32, 'rgba(255,255,255,0)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.48, 'rgba(255,255,255,0.16)');
  g.addColorStop(0.54, 'rgba(255,255,255,0.42)');
  g.addColorStop(0.64, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return makeTexture(canvas, { mipmaps: true });
}

/**
 * A wedge of light on a floor, as it falls from a doorway: bright at the top edge (the door),
 * widening and fading toward the bottom, with soft sides. White on black, for additive use.
 */
export function drawWedge(): CanvasTexture {
  const w = 128;
  const h = 128;
  const canvas = createCanvas(w, h);
  const ctx = context2d(canvas);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    const v = y / (h - 1);
    // Half-width grows from 38% to 50% of the texture as the light falls away.
    const half = 0.34 + 0.16 * v;
    const fall = Math.pow(1 - v, 1.5);
    for (let x = 0; x < w; x += 1) {
      const u = (x / (w - 1) - 0.5) / half;
      const side = Math.max(0, 1 - u * u);
      const c = Math.round(255 * fall * Math.pow(side, 1.6));
      const i = (y * w + x) * 4;
      img.data[i] = c;
      img.data[i + 1] = c;
      img.data[i + 2] = c;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return makeTexture(canvas, { mipmaps: false });
}
