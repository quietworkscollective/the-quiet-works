import { CanvasTexture, ClampToEdgeWrapping, LinearFilter, NoColorSpace, RepeatWrapping, SRGBColorSpace } from 'three';
import { nth } from '../math.ts';

/**
 * Canvas plumbing for the corridor's procedural textures. Nothing here touches the network:
 * every texture is drawn from code with a seeded generator, so it is identical on every load.
 * Sizes stay at or under 1024 px and are mipmapped.
 */

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  // CPU-backed: these canvases are only ever uploaded to WebGL.
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
}

export interface TextureOptions {
  /** Colour data is sRGB; roughness, bump and mask data is not. */
  colorData?: boolean;
  repeat?: boolean;
  anisotropy?: number;
  mipmaps?: boolean;
}

export function makeTexture(canvas: HTMLCanvasElement, options: TextureOptions = {}): CanvasTexture {
  const { colorData = true, repeat = false, anisotropy = 1, mipmaps = true } = options;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = colorData ? SRGBColorSpace : NoColorSpace;
  texture.anisotropy = anisotropy;
  texture.wrapS = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  texture.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  if (!mipmaps) {
    texture.generateMipmaps = false;
    texture.minFilter = LinearFilter;
  }
  texture.needsUpdate = true;
  return texture;
}

/* ------------------------------------------------------------------------------------------ */
/* Fonts                                                                                      */
/* ------------------------------------------------------------------------------------------ */

export const FONT_MONO = '"IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace';
export const FONT_COND = '"IBM Plex Sans Condensed", "Arial Narrow", Arial, sans-serif';
export const FONT_SERIF = 'Newsreader, Georgia, "Times New Roman", serif';

const FONT_FACES = [
  '400 40px "IBM Plex Mono"',
  '600 40px "IBM Plex Mono"',
  '400 40px "IBM Plex Sans Condensed"',
  '600 40px "IBM Plex Sans Condensed"',
  '700 40px "IBM Plex Sans Condensed"',
  '400 40px Newsreader',
  '600 40px Newsreader',
  'italic 400 40px Newsreader',
];

let fontsPromise: Promise<void> | null = null;

/** Resolves once the app's web fonts are usable on a canvas. Never rejects. */
export function loadFonts(): Promise<void> {
  if (fontsPromise) return fontsPromise;
  if (typeof document === 'undefined' || !('fonts' in document)) {
    fontsPromise = Promise.resolve();
    return fontsPromise;
  }
  fontsPromise = Promise.all(FONT_FACES.map((face) => document.fonts.load(face).catch(() => []))).then(() => undefined);
  return fontsPromise;
}

/* ------------------------------------------------------------------------------------------ */
/* Tileable noise                                                                             */
/* ------------------------------------------------------------------------------------------ */

/** A periodic value-noise field: tiles seamlessly at any integer cell count. */
export class TileNoise {
  private readonly lattice: Float32Array;
  constructor(
    private readonly cells: number,
    rng: () => number,
  ) {
    this.lattice = new Float32Array(cells * cells);
    for (let i = 0; i < this.lattice.length; i += 1) this.lattice[i] = rng();
  }

  /** u, v in [0, 1); returns [0, 1]. */
  at(u: number, v: number): number {
    const n = this.cells;
    const x = u * n;
    const y = v * n;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const xa = ((x0 % n) + n) % n;
    const ya = ((y0 % n) + n) % n;
    const xb = (xa + 1) % n;
    const yb = (ya + 1) % n;
    const a = nth(this.lattice, ya * n + xa);
    const b = nth(this.lattice, ya * n + xb);
    const c = nth(this.lattice, yb * n + xa);
    const d = nth(this.lattice, yb * n + xb);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
}

/** Fractal sum of tile noises at doubling cell counts, normalised to about [0, 1]. */
export function makeFbm(baseCells: number, octaves: number, rng: () => number, gain = 0.5): (u: number, v: number) => number {
  const layers: TileNoise[] = [];
  for (let o = 0; o < octaves; o += 1) layers.push(new TileNoise(baseCells * 2 ** o, rng));
  let norm = 0;
  for (let o = 0; o < octaves; o += 1) norm += gain ** o;
  return (u, v) => {
    let sum = 0;
    for (let o = 0; o < octaves; o += 1) sum += nth(layers, o).at(u, v) * gain ** o;
    return sum / norm;
  };
}

/**
 * A smooth field sampled on a coarse periodic grid and read back with bilinear interpolation.
 * Low-frequency tone (mottling, drift) does not need evaluating per pixel: filling a 1024 px
 * texture from a 256 px grid costs a fraction of evaluating the noise at every pixel, and looks
 * the same because the field has no detail finer than the grid.
 */
export function gridField(resolution: number, fn: (u: number, v: number) => number): (u: number, v: number) => number {
  const grid = new Float32Array(resolution * resolution);
  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) grid[y * resolution + x] = fn(x / resolution, y / resolution);
  }
  return (u, v) => {
    const x = (((u % 1) + 1) % 1) * resolution;
    const y = (((v % 1) + 1) % 1) * resolution;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const x1 = (x0 + 1) % resolution;
    const y1 = (y0 + 1) % resolution;
    const a = grid[y0 * resolution + x0] ?? 0;
    const b = grid[y0 * resolution + x1] ?? 0;
    const c = grid[y1 * resolution + x0] ?? 0;
    const d = grid[y1 * resolution + x1] ?? 0;
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

/** Fractal noise baked to a grid of `resolution` cells (see gridField): the cheap way to get fbm per pixel. */
export function fbmField(baseCells: number, octaves: number, rng: () => number, gain: number, resolution: number): (u: number, v: number) => number {
  return gridField(resolution, makeFbm(baseCells, octaves, rng, gain));
}
