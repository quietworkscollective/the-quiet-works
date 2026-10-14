import type { CanvasTexture } from 'three';
import { nth, clamp, mulberry32 } from '../math.ts';
import { context2d, createCanvas, fbmField, makeTexture, TileNoise } from './canvas.ts';

/**
 * Tiling surface textures for the architecture: plaster, oak, terrazzo, enamelled paint. Each
 * returns near-neutral colour (the material tints it) plus, where it matters, a roughness map in
 * its green channel. `averageLinear` lets the material divide the texture's own mean out, so a
 * surface averages exactly the hex written in the art direction whatever detail the texture holds.
 */

export interface Surface {
  map: CanvasTexture;
  /** Roughness (green channel), when the surface needs variation beyond a constant. */
  rough?: CanvasTexture;
  /** The mean linear RGB of `map`, to divide out of the material colour. */
  mean: readonly [number, number, number];
}

/** A surface whose roughness map is always present. */
export interface RoughSurface extends Surface {
  rough: CanvasTexture;
}

const srgbToLinear = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

/** Mean linear RGB of a canvas, sampled on a stride. */
export function averageLinear(canvas: HTMLCanvasElement): readonly [number, number, number] {
  const ctx = context2d(canvas);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 16) {
    r += srgbToLinear(nth(data, i));
    g += srgbToLinear(nth(data, i + 1));
    b += srgbToLinear(nth(data, i + 2));
    n += 1;
  }
  return [r / n, g / n, b / n];
}

/** Draw `fn` at each wrapped offset that could touch the tile, so features near an edge tile. */
function wrapped(w: number, h: number, x: number, y: number, r: number, fn: (ox: number, oy: number) => void): void {
  for (const ox of [-w, 0, w]) {
    for (const oy of [-h, 0, h]) {
      if (x + ox + r < 0 || x + ox - r > w || y + oy + r < 0 || y + oy - r > h) continue;
      fn(ox, oy);
    }
  }
}

/**
 * Lime plaster, painted and re-painted for a century: broad soft tonal drift, a fine trowel-
 * and-roller grain, sparse pits and a few hairline cracks. Nothing is dirt; it is age.
 */
export function drawPlaster(size: number, anisotropy: number, seed = 0x5b01): RoughSurface {
  const rng = mulberry32(seed);
  const canvas = createCanvas(size, size);
  const ctx = context2d(canvas);
  const low = fbmField(3, 4, rng, 0.55, size / 4);
  const mid = fbmField(12, 3, rng, 0.5, size / 2);
  // The tile is 4 m on a side: more room for stains and cracks than the 512 px reference had, but fewer per metre,
  // so no stain or crack is recognisable from one repeat to the next.
  const spread = size / 512;
  const grain = new TileNoise(size / 2, rng);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const tone = 0.9 + (low(u, v) - 0.5) * 0.16 + (mid(u, v) - 0.5) * 0.07 + (grain.at(u, v) - 0.5) * 0.045;
      const c = clamp(tone, 0, 1) * 255;
      const i = (y * size + x) * 4;
      // A hair of warmth in the lighter drift: old lime wash, not paper white.
      img.data[i] = c;
      img.data[i + 1] = c * 0.995;
      img.data[i + 2] = c * 0.975;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Pits.
  for (let i = 0; i < size * 0.12; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 0.5 + rng() * 0.9;
    wrapped(size, size, x, y, r, (ox, oy) => {
      ctx.fillStyle = `rgba(60,58,50,${(0.07 + rng() * 0.1).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // Rain and condensation: a few long vertical stains from the top, barely there, and two tide
  // rings where a leak once dried. Age, not dirt.
  for (let i = 0; i < Math.round(4 * spread); i += 1) {
    const x = rng() * size;
    const w = 5 + rng() * 16;
    const top = rng() * size * 0.4;
    const len = size * (0.25 + rng() * 0.35);
    const g = ctx.createLinearGradient(0, top, 0, top + len);
    g.addColorStop(0, `rgba(78,66,46,${(0.05 + rng() * 0.05).toFixed(3)})`);
    g.addColorStop(1, 'rgba(78,66,46,0)');
    ctx.fillStyle = g;
    wrapped(size, size, x, top + len / 2, len, (ox, oy) => ctx.fillRect(x - w / 2 + ox, top + oy, w, len));
  }
  for (let i = 0; i < Math.round(2 * spread); i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 40 + rng() * 60;
    wrapped(size, size, x, y, r, (ox, oy) => {
      const g = ctx.createRadialGradient(x + ox, y + oy, r * 0.7, x + ox, y + oy, r);
      g.addColorStop(0, 'rgba(96,78,48,0)');
      g.addColorStop(0.85, 'rgba(96,78,48,0.045)');
      g.addColorStop(1, 'rgba(96,78,48,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Hairline cracks: short random walks, darker at one edge, never straight.
  ctx.lineCap = 'round';
  for (let i = 0; i < Math.round(5 * spread); i += 1) {
    let x = rng() * size;
    let y = rng() * size;
    let a = rng() * Math.PI * 2;
    const pts: [number, number][] = [[x, y]];
    const steps = 14 + Math.floor(rng() * 24);
    for (let s = 0; s < steps; s += 1) {
      a += (rng() - 0.5) * 0.9;
      x += Math.cos(a) * (3 + rng() * 4);
      y += Math.sin(a) * (3 + rng() * 4);
      pts.push([x, y]);
    }
    ctx.strokeStyle = `rgba(52,48,40,${(0.16 + rng() * 0.12).toFixed(3)})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    pts.forEach(([px, py], k) => (k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.stroke();
  }

  // Roughness: mostly matt, a trowel-burnished drift where the surface was rubbed.
  const rough = createCanvas(size, size);
  const rctx = context2d(rough);
  const rimg = rctx.createImageData(size, size);
  const rn = fbmField(4, 3, rng, 0.5, size / 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const c = clamp(0.93 - (rn(x / size, y / size) - 0.5) * 0.22, 0, 1) * 255;
      const i = (y * size + x) * 4;
      rimg.data[i] = c;
      rimg.data[i + 1] = c;
      rimg.data[i + 2] = c;
      rimg.data[i + 3] = 255;
    }
  }
  rctx.putImageData(rimg, 0, 0);

  return {
    map: makeTexture(canvas, { repeat: true, anisotropy }),
    rough: makeTexture(rough, { colorData: false, repeat: true, anisotropy }),
    mean: averageLinear(canvas),
  };
}

/**
 * Dark varnished oak, grain along u. Long rings distorted by low-frequency noise, fine pores
 * stretched along the grain, and a slow gloss variation where hands have polished it.
 */
export function drawOak(size: number, anisotropy: number, seed = 0x0a4b): RoughSurface {
  const rng = mulberry32(seed);
  const canvas = createCanvas(size, size);
  const ctx = context2d(canvas);
  const warp = fbmField(2, 3, rng, 0.55, size / 4);
  const pores = new TileNoise(size / 2, rng);
  const fleck = new TileNoise(16, rng);
  const img = ctx.createImageData(size, size);
  const ringCount = 22;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const ring = (v * ringCount + warp(u, v) * 1.5 + warp((u * 2) % 1, v) * 0.4) % 1;
      const band = 0.5 + 0.5 * Math.sin(ring * Math.PI * 2);
      const late = Math.pow(band, 1.6);
      // Pores: sampled stretched along u, so they read as grain streaks.
      const pore = pores.at((u * 4) % 1, v);
      const flecks = Math.pow(fleck.at((u * 3) % 1, v), 6);
      const tone = 0.78 + 0.16 * late - 0.1 * Math.pow(pore, 3) + 0.08 * flecks;
      const c = clamp(tone, 0, 1) * 255;
      const i = (y * size + x) * 4;
      img.data[i] = c * 1.0;
      img.data[i + 1] = c * 0.93;
      img.data[i + 2] = c * 0.82;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const rough = createCanvas(size, size);
  const rctx = context2d(rough);
  const rimg = rctx.createImageData(size, size);
  const rn = fbmField(3, 3, rng, 0.5, size / 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const c = clamp(0.42 - (rn(u, v) - 0.5) * 0.3 + (pores.at((u * 4) % 1, v) - 0.5) * 0.12, 0, 1) * 255;
      const i = (y * size + x) * 4;
      rimg.data[i] = c;
      rimg.data[i + 1] = c;
      rimg.data[i + 2] = c;
      rimg.data[i + 3] = 255;
    }
  }
  rctx.putImageData(rimg, 0, 0);

  return {
    map: makeTexture(canvas, { repeat: true, anisotropy }),
    rough: makeTexture(rough, { colorData: false, repeat: true, anisotropy }),
    mean: averageLinear(canvas),
  };
}

/**
 * Polished terrazzo: a grey-green matrix with marble chips of several sizes, a few darker and a
 * few warm, ground flat. Chips are mostly small; the large ones are rare, as in a real pour.
 */
export function drawTerrazzo(size: number, anisotropy: number, seed = 0x7e22): RoughSurface {
  const rng = mulberry32(seed);
  const canvas = createCanvas(size, size);
  const ctx = context2d(canvas);
  const low = fbmField(3, 3, rng, 0.5, size / 4);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const c = clamp(0.5 + (low(x / size, y / size) - 0.5) * 0.12, 0, 1) * 255;
      const i = (y * size + x) * 4;
      img.data[i] = c * 0.97;
      img.data[i + 1] = c;
      img.data[i + 2] = c * 0.98;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const palette: readonly (readonly [string, number])[] = [
    ['226,224,214', 0.3],
    ['196,198,188', 0.26],
    ['150,158,152', 0.18],
    ['82,88,86', 0.12],
    ['34,38,38', 0.06],
    ['214,196,160', 0.05],
    ['168,176,150', 0.03],
  ];
  const pick = (): string => {
    let t = rng();
    for (const [rgb, w] of palette) {
      t -= w;
      if (t <= 0) return rgb;
    }
    return nth(palette, 0)[0];
  };
  // Fine chips (a 2 mm to 12 mm pour): many small, a rare few larger. One pixel is about 2.3 mm.
  const chips = Math.floor(size * 24);
  for (let i = 0; i < chips; i += 1) {
    const big = rng() < 0.012;
    const r = big ? 2.6 + rng() * 2.4 : 0.6 + Math.pow(rng(), 2.4) * 2.1;
    const x = rng() * size;
    const y = rng() * size;
    const sides = 4 + Math.floor(rng() * 3);
    const spin = rng() * Math.PI;
    const rgb = pick();
    const alpha = 0.7 + rng() * 0.3;
    if (r < 1.5) {
      // A pinhead of stone: a small rotated square is indistinguishable from a polygon and far cheaper.
      ctx.fillStyle = `rgba(${rgb},${alpha.toFixed(3)})`;
      const w = r * 1.9;
      const h = r * 1.5;
      for (const ox of x < w ? [0, size] : x > size - w ? [0, -size] : [0]) ctx.fillRect(x + ox - w / 2, y - h / 2, w, h);
      continue;
    }
    wrapped(size, size, x, y, r, (ox, oy) => {
      ctx.fillStyle = `rgba(${rgb},${alpha.toFixed(3)})`;
      ctx.beginPath();
      for (let s = 0; s < sides; s += 1) {
        const a = spin + (s / sides) * Math.PI * 2;
        const rr = r * (0.7 + 0.5 * ((s * 7 + i) % 3) / 2);
        const px = x + ox + Math.cos(a) * rr;
        const py = y + oy + Math.sin(a) * rr * 0.8;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    });
  }
  // Fine polishing scratches, barely there.
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 70; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const len = 20 + rng() * 80;
    const a = rng() * Math.PI;
    wrapped(size, size, x, y, len, (ox, oy) => {
      ctx.strokeStyle = `rgba(255,255,255,${(0.025 + rng() * 0.03).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(x + ox, y + oy);
      ctx.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
      ctx.stroke();
    });
  }

  // Roughness: chips take a slightly higher polish than the matrix, and the lane where feet
  // walk is a touch glossier than the edges.
  const rough = createCanvas(size, size);
  const rctx = context2d(rough);
  const rn = fbmField(5, 3, rng, 0.5, size / 4);
  const rimg = rctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const c = clamp(0.4 + (rn(x / size, y / size) - 0.5) * 0.2, 0, 1) * 255;
      const i = (y * size + x) * 4;
      rimg.data[i] = c;
      rimg.data[i + 1] = c;
      rimg.data[i + 2] = c;
      rimg.data[i + 3] = 255;
    }
  }
  rctx.putImageData(rimg, 0, 0);

  return {
    map: makeTexture(canvas, { repeat: true, anisotropy }),
    rough: makeTexture(rough, { colorData: false, repeat: true, anisotropy }),
    mean: averageLinear(canvas),
  };
}

/**
 * Eggshell enamel on timber and steel: a fine orange-peel stipple and slow gloss drift. Doors
 * share this one material and are tinted by vertex colour, so each stays a distinct colour.
 */
export function drawPaint(size: number, anisotropy: number, seed = 0x9a17): RoughSurface {
  const rng = mulberry32(seed);
  const canvas = createCanvas(size, size);
  const ctx = context2d(canvas);
  const low = fbmField(3, 3, rng, 0.5, size / 4);
  const peel = new TileNoise(size / 2, rng);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const c = clamp(0.93 + (low(u, v) - 0.5) * 0.1 + (peel.at(u, v) - 0.5) * 0.05, 0, 1) * 255;
      const i = (y * size + x) * 4;
      img.data[i] = c;
      img.data[i + 1] = c;
      img.data[i + 2] = c;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Brush drag along u: a few long faint streaks.
  for (let i = 0; i < 40; i += 1) {
    const y = rng() * size;
    const x = rng() * size;
    const len = 40 + rng() * 140;
    wrapped(size, size, x, y, len, (ox, oy) => {
      ctx.strokeStyle = `rgba(${rng() > 0.5 ? '255,255,255' : '40,40,40'},${(0.015 + rng() * 0.02).toFixed(3)})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x + ox, y + oy);
      ctx.lineTo(x + ox + len, y + oy + (rng() - 0.5) * 2);
      ctx.stroke();
    });
  }
  const rough = createCanvas(size, size);
  const rctx = context2d(rough);
  const rn = fbmField(4, 3, rng, 0.5, size / 4);
  const rimg = rctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const c = clamp(0.56 + (rn(x / size, y / size) - 0.5) * 0.3, 0, 1) * 255;
      const i = (y * size + x) * 4;
      rimg.data[i] = c;
      rimg.data[i + 1] = c;
      rimg.data[i + 2] = c;
      rimg.data[i + 3] = 255;
    }
  }
  rctx.putImageData(rimg, 0, 0);
  return {
    map: makeTexture(canvas, { repeat: true, anisotropy }),
    rough: makeTexture(rough, { colorData: false, repeat: true, anisotropy }),
    mean: averageLinear(canvas),
  };
}
