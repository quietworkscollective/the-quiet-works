import type { CanvasTexture } from 'three';
import { clamp, mulberry32 } from '../math.ts';
import { context2d, createCanvas, fbmField, makeTexture, TileNoise } from './canvas.ts';
import { averageLinear, type RoughSurface, type Surface } from './surfaces.ts';

/** Small tiling textures for glass and matting. Same rules as surfaces.ts: seeded, tiling, near-neutral. */

/**
 * Wired glass: a dark pane with a diamond mesh of fine wire pressed into it. One tile is 2 in
 * square and holds two diamonds (the classic 1 in mesh).
 */
export function drawWired(anisotropy: number): Surface {
  const size = 64;
  const canvas = createCanvas(size, size);
  const ctx = context2d(canvas);
  // Glass is mostly clear (alpha 0.74 over its dark backing); the wire is opaque.
  ctx.fillStyle = 'rgba(34,46,46,0.74)';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgb(205,214,206)';
  ctx.lineWidth = 2.2;
  // Two families of diagonals, every half tile along x, so the tile repeats seamlessly.
  const half = size / 2;
  for (let k = -size; k <= size * 2; k += half) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k + size, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(k, size);
    ctx.lineTo(k + size, 0);
    ctx.stroke();
  }
  return { map: makeTexture(canvas, { repeat: true, anisotropy }), mean: averageLinear(canvas) };
}

/**
 * Vertical flutes for reeded glass, as a tangent-space normal map: four half-round reeds across one
 * tile. A normal map (not a bump map) so the mip chain averages the flutes toward a flat normal at
 * a distance instead of aliasing into moire arcs across a wide leaf seen at a slant.
 */
export function drawReeded(anisotropy = 1): CanvasTexture {
  const w = 128;
  const h = 4;
  const canvas = createCanvas(w, h);
  const ctx = context2d(canvas);
  const img = ctx.createImageData(w, h);
  const steepness = 0.55;
  for (let x = 0; x < w; x += 1) {
    const t = (((x + 0.5) / w) * 4) % 1;
    // Each reed is a half-round: its slope runs from -steepness at one edge to +steepness at the other.
    const slope = steepness * Math.cos(t * Math.PI * 2 - Math.PI) * -1;
    const len = Math.hypot(slope, 1);
    const nx = -slope / len;
    const nz = 1 / len;
    for (let y = 0; y < h; y += 1) {
      const i = (y * w + x) * 4;
      img.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      img.data[i + 1] = 128;
      img.data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return makeTexture(canvas, { colorData: false, repeat: true, anisotropy });
}

/** Frosted (acid-etched) glass: fine, even grain, pale. */
export function drawFrost(anisotropy: number, seed = 0xf205): Surface {
  const rng = mulberry32(seed);
  const size = 128;
  const canvas = createCanvas(size, size);
  const ctx = context2d(canvas);
  const grain = new TileNoise(size, rng);
  const low = fbmField(3, 3, rng, 0.5, 32);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const c = clamp(0.86 + (grain.at(u, v) - 0.5) * 0.1 + (low(u, v) - 0.5) * 0.1, 0, 1) * 255;
      const i = (y * size + x) * 4;
      img.data[i] = c;
      img.data[i + 1] = c;
      img.data[i + 2] = c * 0.98;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { map: makeTexture(canvas, { repeat: true, anisotropy }), mean: averageLinear(canvas) };
}

/** Coir matting: dense dark-brown fibres running mostly one way. */
export function drawCoir(anisotropy: number, seed = 0xc017): Surface {
  const rng = mulberry32(seed);
  const size = 128;
  const canvas = createCanvas(size, size);
  const ctx = context2d(canvas);
  ctx.fillStyle = 'rgb(86,64,42)';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1400; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const len = 6 + rng() * 22;
    const a = (rng() - 0.5) * 0.9;
    const dark = rng() > 0.45;
    ctx.strokeStyle = dark ? `rgba(34,22,12,${(0.25 + rng() * 0.3).toFixed(3)})` : `rgba(150,118,80,${(0.18 + rng() * 0.25).toFixed(3)})`;
    ctx.lineWidth = 0.8 + rng() * 0.8;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        if (x + ox + len < 0 || x + ox - len > size || y + oy + len < 0 || y + oy - len > size) continue;
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
        ctx.stroke();
      }
    }
  }
  return { map: makeTexture(canvas, { repeat: true, anisotropy }), mean: averageLinear(canvas) };
}

/**
 * The history of the Office's teal enamel: steel showing at the edges where it has been knocked,
 * a polished patch where a hand has pushed the lever for fifty years, kick marks at the foot, a
 * dent and a few chips. It covers x in [-0.6, 0.6] m and y in [0, 1.8] m of the leaf, in door-
 * local metres (the material offsets and scales it), once, not tiled. Colour is near 0.8 grey,
 * so the paint's own tint carries; the green channel doubles as the roughness map.
 */
export const ENAMEL_WEAR = { x0: -0.6, width: 1.2, height: 1.8 } as const;

export function drawEnamelWear(anisotropy: number, seed = 0xe4a2): RoughSurface {
  const rng = mulberry32(seed);
  const w = 512;
  const h = 768;
  const px = (x: number): number => ((x - ENAMEL_WEAR.x0) / ENAMEL_WEAR.width) * w;
  const py = (y: number): number => (1 - y / ENAMEL_WEAR.height) * h;
  const canvas = createCanvas(w, h);
  const ctx = context2d(canvas);
  const rough = createCanvas(w, h);
  const rctx = context2d(rough);
  const low = fbmField(4, 4, rng, 0.5, 128);
  const img = ctx.createImageData(w, h);
  const rimg = rctx.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const n = low((x / w) % 1, (y / h) % 1);
      const c = clamp(0.8 + (n - 0.5) * 0.12, 0, 1) * 255;
      const i = (y * w + x) * 4;
      img.data[i] = c;
      img.data[i + 1] = c;
      img.data[i + 2] = c;
      img.data[i + 3] = 255;
      const r = clamp(0.4 + (n - 0.5) * 0.2, 0, 1) * 255;
      rimg.data[i] = r;
      rimg.data[i + 1] = r;
      rimg.data[i + 2] = r;
      rimg.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  rctx.putImageData(rimg, 0, 0);

  // Both canvases take the same marks: `tone` is the colour value, `gloss` the roughness value.
  const mark = (draw: (c: CanvasRenderingContext2D, style: string) => void, tone: string, gloss: string): void => {
    draw(ctx, tone);
    draw(rctx, gloss);
  };
  const bright = 'rgba(255,255,255,';
  // Steel at the foot: the kick marks, a band of scuffs, darker where a shoe has scraped.
  for (let i = 0; i < 70; i += 1) {
    const x = px(-0.5 + rng() * 1.0);
    const y = py(0.06 + rng() * rng() * 0.22);
    const len = 4 + rng() * 22;
    const a = (rng() - 0.5) * 0.6;
    mark((c, t) => {
      c.strokeStyle = t;
      c.lineWidth = 0.8 + rng() * 1.8;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      c.stroke();
    }, rng() > 0.5 ? `rgba(40,34,28,${(0.18 + rng() * 0.25).toFixed(2)})` : `${bright}${(0.1 + rng() * 0.2).toFixed(2)})`, `rgba(190,190,190,${(0.3 + rng() * 0.3).toFixed(2)})`);
  }
  // Edge chips: small bright flecks along the panel's borders.
  for (let i = 0; i < 90; i += 1) {
    const edge = rng();
    const x = edge < 0.5 ? px(-0.475 + (rng() < 0.5 ? 0 : 0.95) + (rng() - 0.5) * 0.02) : px(-0.475 + rng() * 0.95);
    const y = edge < 0.5 ? py(0.06 + rng() * 1.56) : py(rng() < 0.5 ? 0.062 : 1.62);
    const r = 0.8 + rng() * 2.6;
    mark((c, t) => {
      c.fillStyle = t;
      c.beginPath();
      c.ellipse(x, y, r * (1 + rng()), r, rng() * 3, 0, Math.PI * 2);
      c.fill();
    }, `${bright}${(0.45 + rng() * 0.4).toFixed(2)})`, 'rgba(70,70,70,0.9)');
  }
  // The lever: a polished, slightly lighter patch with fine arcs where the hand sweeps.
  const [lx, ly] = [px(-0.43), py(1.0)];
  mark((c, t) => {
    const rg = c.createRadialGradient(lx, ly, 2, lx, ly, 52);
    rg.addColorStop(0, t);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = rg;
    c.fillRect(lx - 60, ly - 60, 120, 120);
  }, 'rgba(255,255,255,0.22)', 'rgba(40,40,40,0.8)');
  for (let i = 0; i < 18; i += 1) {
    mark((c, t) => {
      c.strokeStyle = t;
      c.lineWidth = 0.6;
      c.beginPath();
      c.arc(lx, ly, 14 + rng() * 34, rng() * 6, rng() * 6 + 1.4);
      c.stroke();
    }, `${bright}${(0.1 + rng() * 0.15).toFixed(2)})`, 'rgba(60,60,60,0.7)');
  }
  // A shallow dent below the hatch, with a thin dark crescent on its lower lip.
  const [dx, dy] = [px(0.3), py(0.8)];
  mark((c, t) => {
    const g = c.createRadialGradient(dx, dy, 2, dx, dy, 30);
    g.addColorStop(0, t);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(dx - 34, dy - 34, 68, 68);
  }, 'rgba(0,0,0,0.12)', 'rgba(120,120,120,0.3)');
  // Slow drips of old cleaning fluid, barely there.
  for (let i = 0; i < 5; i += 1) {
    const x = px(-0.45 + rng() * 0.9);
    const top = py(1.55 - rng() * 0.3);
    const len = 40 + rng() * 120;
    const g = ctx.createLinearGradient(0, top, 0, top + len);
    g.addColorStop(0, 'rgba(0,0,0,0.07)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, top, 2 + rng() * 3, len);
  }
  return { map: makeTexture(canvas, { anisotropy }), rough: makeTexture(rough, { colorData: false, anisotropy }), mean: averageLinear(canvas) };
}

/** Wool felt: a dense, slightly uneven nap with a few lighter fibres, near-neutral (the material tints it). */
export function drawFelt(anisotropy: number, seed = 0xfe17): Surface {
  const rng = mulberry32(seed);
  const size = 256;
  const canvas = createCanvas(size, size);
  const ctx = context2d(canvas);
  const grain = new TileNoise(size / 2, rng);
  const low = fbmField(4, 3, rng, 0.5, 64);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const c = clamp(0.8 + (grain.at(u, v) - 0.5) * 0.2 + (low(u, v) - 0.5) * 0.14, 0, 1) * 255;
      const i = (y * size + x) * 4;
      img.data[i] = c;
      img.data[i + 1] = c;
      img.data[i + 2] = c;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < 900; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const len = 2 + rng() * 6;
    const a = rng() * Math.PI * 2;
    ctx.strokeStyle = `rgba(255,255,255,${(0.05 + rng() * 0.1).toFixed(3)})`;
    ctx.lineWidth = 0.7;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        if (x + ox + len < 0 || x + ox - len > size || y + oy + len < 0 || y + oy - len > size) continue;
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
        ctx.stroke();
      }
    }
  }
  return { map: makeTexture(canvas, { repeat: true, anisotropy }), mean: averageLinear(canvas) };
}
