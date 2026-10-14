import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { mulberry32 } from './anim.ts';

/**
 * Canvas plumbing and the procedural surface textures (linoleum, concrete, wood, soft sprites).
 * Text-bearing art lives in `canvasArt.ts`. Nothing here touches the network: every texture is
 * drawn from code, seeded, and therefore identical on every load.
 */

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  // CPU-backed: these canvases are only ever uploaded to WebGL, and an accelerated canvas would
  // force a GPU read-back on every upload.
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
}

export interface TextureOptions {
  /** Colour data is sRGB; roughness / bump data is not. */
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
  if (repeat) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
  } else {
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
  }
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
  '600 40px "IBM Plex Mono"',
  '400 40px "IBM Plex Mono"',
  '600 40px "IBM Plex Sans Condensed"',
  '400 40px "IBM Plex Sans Condensed"',
  '400 40px Newsreader',
  'italic 400 40px Newsreader',
];

let fontsLoaded = false;
let fontsPromise: Promise<void> | null = null;

/** Resolves once the app's web fonts are usable on a canvas. Never rejects. */
export function loadFonts(): Promise<void> {
  if (fontsPromise) return fontsPromise;
  if (typeof document === 'undefined' || !('fonts' in document)) {
    fontsLoaded = true;
    fontsPromise = Promise.resolve();
    return fontsPromise;
  }
  fontsPromise = Promise.all(
    FONT_FACES.map((face) => document.fonts.load(face).catch(() => [])),
  ).then(() => {
    fontsLoaded = true;
  });
  return fontsPromise;
}

export const areFontsLoaded = (): boolean => fontsLoaded;

/* ------------------------------------------------------------------------------------------ */
/* Surface noise                                                                              */
/* ------------------------------------------------------------------------------------------ */

/** Soft blotches: the large-scale mottling that stops a flat colour reading as a flat colour. */
function mottle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: () => number,
  count: number,
  radius: [number, number],
  alpha: number,
  light: string,
  dark: string,
): void {
  for (let i = 0; i < count; i += 1) {
    const x = rng() * w;
    const y = rng() * h;
    const r = radius[0] + rng() * (radius[1] - radius[0]);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const tone = rng() > 0.5 ? light : dark;
    g.addColorStop(0, tone.replace('A)', `${(alpha * (0.4 + rng() * 0.6)).toFixed(3)})`));
    g.addColorStop(1, tone.replace('A)', '0)'));
    ctx.fillStyle = g;
    // Draw wrapped so the texture tiles.
    for (const ox of [-w, 0, w]) {
      for (const oy of [-h, 0, h]) {
        if (x + ox + r < 0 || x + ox - r > w || y + oy + r < 0 || y + oy - r > h) continue;
        ctx.save();
        ctx.translate(ox, oy);
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.restore();
      }
    }
  }
}

function speckle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: () => number,
  count: number,
  maxR: number,
  alpha: number,
  rgb: string,
): void {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = `rgba(${rgb},${(alpha * (0.3 + rng() * 0.7)).toFixed(3)})`;
    const r = 0.4 + rng() * maxR;
    ctx.fillRect(rng() * w, rng() * h, r, r);
  }
}

/** Where things sit on the desk, as canvas pixels of the 2048 x 1024 top (x -1.1..1.1, z -0.55..0.55). */
const deskPx = (x: number, z: number, w: number, h: number): [number, number] => [
  ((x + 1.1) / 2.2) * w,
  ((z + 0.55) / 1.1) * h,
];

export interface DeskTextures {
  map: CanvasTexture;
  roughness: CanvasTexture;
}

/**
 * Dark green-grey linoleum. One broad, worn working area under the press (lighter, glossier,
 * rubbed by a century of sleeves), the faintest forearm band at the front edge, and three
 * purposeful marks: a coffee ring, an ink spot near the tin, and the long scratch of a ruler.
 * No uniform distressing. The second texture carries roughness in its green channel.
 */
export function drawLinoleum(width: number, height: number, anisotropy: number): DeskTextures {
  const rng = mulberry32(0x1100);
  const canvas = createCanvas(width, height);
  const ctx = context2d(canvas);
  ctx.fillStyle = '#2a3130';
  ctx.fillRect(0, 0, width, height);
  mottle(ctx, width, height, rng, 160, [60, 220], 0.05, 'rgba(120,150,140,A)', 'rgba(6,10,10,A)');
  speckle(ctx, width, height, rng, 16000, 1.5, 0.11, '10,14,14');
  speckle(ctx, width, height, rng, 6000, 1.3, 0.08, '150,175,165');

  const rough = createCanvas(width, height);
  const rctx = context2d(rough);
  rctx.fillStyle = 'rgb(222,222,222)';
  rctx.fillRect(0, 0, width, height);
  mottle(rctx, width, height, rng, 90, [50, 200], 0.1, 'rgba(255,255,255,A)', 'rgba(120,120,120,A)');

  // The working area: an irregular oval centred a little in front of the press.
  const [wx, wy] = deskPx(-0.14, 0.2, width, height);
  const patch = (c: CanvasRenderingContext2D, rgb: string, alpha: number) => {
    c.save();
    c.translate(wx, wy);
    c.rotate(-0.08);
    c.scale(1.35, 1);
    const g = c.createRadialGradient(0, 0, 40, 0, 0, 330);
    g.addColorStop(0, `rgba(${rgb},${alpha})`);
    g.addColorStop(0.55, `rgba(${rgb},${alpha * 0.55})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g;
    c.fillRect(-460, -460, 920, 920);
    c.restore();
  };
  patch(ctx, '170,190,178', 0.1);
  patch(rctx, '150,150,150', 0.8);
  // Forearm band along the front edge.
  const band = ctx.createLinearGradient(0, height * 0.8, 0, height);
  band.addColorStop(0, 'rgba(150,175,165,0)');
  band.addColorStop(1, 'rgba(150,175,165,0.035)');
  ctx.fillStyle = band;
  ctx.fillRect(0, height * 0.8, width, height * 0.2);

  // Fine scuffs, only inside the worn area (a few, directional).
  ctx.lineCap = 'round';
  for (let i = 0; i < 46; i += 1) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 280;
    const x = wx + Math.cos(a) * r * 1.3;
    const y = wy + Math.sin(a) * r;
    const len = 8 + rng() * 40;
    const dir = -0.35 + (rng() - 0.5) * 0.5;
    ctx.strokeStyle = `rgba(185,205,195,${(0.05 + rng() * 0.07).toFixed(3)})`;
    ctx.lineWidth = 0.6 + rng() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(dir) * len, y + Math.sin(dir) * len);
    ctx.stroke();
  }

  // Mark 1: a coffee ring, left of the ink tin.
  const [cx, cy] = deskPx(-0.5, 0.33, width, height);
  ctx.strokeStyle = 'rgba(96,66,38,0.2)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(cx, cy, 44, 0.3, Math.PI * 2 - 0.35);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(96,66,38,0.1)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx + 2, cy + 1, 38, 0.6, Math.PI * 2 - 0.9);
  ctx.stroke();
  // Mark 2: a dried spot of the teal ink, where the tin once leaked.
  const [ix, iy] = deskPx(-0.62, 0.2, width, height);
  const ink = ctx.createRadialGradient(ix, iy, 1, ix, iy, 15);
  ink.addColorStop(0, 'rgba(46,112,108,0.42)');
  ink.addColorStop(0.7, 'rgba(46,112,108,0.2)');
  ink.addColorStop(1, 'rgba(46,112,108,0)');
  ctx.fillStyle = ink;
  ctx.fillRect(ix - 16, iy - 16, 32, 32);
  for (let k = 0; k < 5; k += 1) {
    ctx.fillStyle = 'rgba(46,112,108,0.3)';
    ctx.beginPath();
    ctx.arc(ix + 12 + k * 6 + rng() * 5, iy - 5 + rng() * 14, 1.4 + rng() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Mark 3: the long scratch where a steel rule was dragged along the front of the desk.
  const [sx0, sy0] = deskPx(-0.42, 0.46, width, height);
  const [sx1, sy1] = deskPx(0.3, 0.38, width, height);
  ctx.strokeStyle = 'rgba(190,210,202,0.13)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(sx0, sy0);
  ctx.lineTo(sx1, sy1);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(190,210,202,0.07)';
  ctx.beginPath();
  ctx.moveTo(sx0 + 2, sy0 + 3);
  ctx.lineTo(sx1 - 30, sy1 + 9);
  ctx.stroke();

  return {
    map: makeTexture(canvas, { repeat: false, anisotropy }),
    roughness: makeTexture(rough, { colorData: false, repeat: false, anisotropy }),
  };
}

/** Fine height noise for bump maps (greyscale, tiling). */
export function drawGrain(size: number, anisotropy: number, seed = 0x77): CanvasTexture {
  const rng = mulberry32(seed);
  const canvas = createCanvas(size, size);
  const ctx = context2d(canvas);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  mottle(ctx, size, size, rng, 140, [6, 40], 0.22, 'rgba(255,255,255,A)', 'rgba(0,0,0,A)');
  speckle(ctx, size, size, rng, size * 22, 1.3, 0.4, '255,255,255');
  speckle(ctx, size, size, rng, size * 22, 1.3, 0.4, '0,0,0');
  return makeTexture(canvas, { colorData: false, repeat: true, anisotropy });
}

/** Cast concrete, tiling: mottling, aggregate, air-holes. */
export function drawConcrete(size: number, anisotropy: number, seed = 0x33): CanvasTexture {
  const rng = mulberry32(seed);
  const canvas = createCanvas(size, size);
  const ctx = context2d(canvas);
  ctx.fillStyle = '#7d8185';
  ctx.fillRect(0, 0, size, size);
  mottle(ctx, size, size, rng, 260, [30, 200], 0.1, 'rgba(210,214,216,A)', 'rgba(20,24,28,A)');
  speckle(ctx, size, size, rng, size * 30, 1.8, 0.22, '30,34,38');
  speckle(ctx, size, size, rng, size * 20, 1.5, 0.15, '220,224,226');
  for (let i = 0; i < 24; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 1 + rng() * 3;
    ctx.fillStyle = 'rgba(10,12,14,0.4)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return makeTexture(canvas, { repeat: true, anisotropy });
}

/** Board-marked concrete for the pillars: horizontal formwork seams on top of the cast texture. */
export function drawBoardMarked(width: number, height: number, anisotropy: number): CanvasTexture {
  const rng = mulberry32(0x55);
  const canvas = createCanvas(width, height);
  const ctx = context2d(canvas);
  ctx.fillStyle = '#80848a';
  ctx.fillRect(0, 0, width, height);
  mottle(ctx, width, height, rng, 160, [20, 120], 0.1, 'rgba(210,214,216,A)', 'rgba(20,24,28,A)');
  const board = height / 24;
  for (let i = 0; i < 24; i += 1) {
    const y = i * board;
    const tone = (rng() - 0.5) * 0.12;
    ctx.fillStyle = tone > 0 ? `rgba(230,232,234,${tone})` : `rgba(10,12,14,${-tone})`;
    ctx.fillRect(0, y, width, board);
    ctx.fillStyle = 'rgba(8,10,12,0.5)';
    ctx.fillRect(0, y, width, 1.5);
    // Grain of the boards imprinted in the concrete.
    for (let k = 0; k < 14; k += 1) {
      ctx.strokeStyle = `rgba(10,12,14,${(0.04 + rng() * 0.06).toFixed(3)})`;
      ctx.lineWidth = 0.6;
      const gy = y + rng() * board;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.bezierCurveTo(width * 0.3, gy + (rng() - 0.5) * 3, width * 0.6, gy + (rng() - 0.5) * 3, width, gy);
      ctx.stroke();
    }
  }
  speckle(ctx, width, height, rng, 9000, 1.6, 0.2, '20,24,28');
  return makeTexture(canvas, { repeat: false, anisotropy });
}

/** Stained wood grain, running along x. Returned as a colour map around the given tone. */
export function drawWood(anisotropy: number, tone: [number, number, number]): CanvasTexture {
  const rng = mulberry32(0x9001);
  const w = 512;
  const h = 256;
  const canvas = createCanvas(w, h);
  const ctx = context2d(canvas);
  ctx.fillStyle = `rgb(${tone[0]},${tone[1]},${tone[2]})`;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i += 1) {
    const y = rng() * h;
    const dark = rng() > 0.45;
    ctx.strokeStyle = dark
      ? `rgba(20,10,4,${(0.05 + rng() * 0.16).toFixed(3)})`
      : `rgba(190,130,80,${(0.03 + rng() * 0.07).toFixed(3)})`;
    ctx.lineWidth = 0.6 + rng() * 2.2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    const bend = (rng() - 0.5) * 14;
    ctx.bezierCurveTo(w * 0.3, y + bend, w * 0.65, y - bend, w, y + (rng() - 0.5) * 6);
    ctx.stroke();
  }
  speckle(ctx, w, h, rng, 1400, 1.2, 0.25, '16,8,4');
  return makeTexture(canvas, { repeat: true, anisotropy });
}

/** Horizontal paper edges for the paper-stack tower. */
export function drawPaperEdges(anisotropy: number): CanvasTexture {
  const rng = mulberry32(0x70);
  const w = 64;
  const h = 128;
  const canvas = createCanvas(w, h);
  const ctx = context2d(canvas);
  ctx.fillStyle = '#c9c0b0';
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2) {
    const v = rng();
    ctx.fillStyle = v > 0.5 ? `rgba(255,250,240,${(0.1 + v * 0.2).toFixed(3)})` : `rgba(60,50,40,${(0.1 + v * 0.3).toFixed(3)})`;
    ctx.fillRect(0, y, w, 1);
  }
  return makeTexture(canvas, { repeat: true, anisotropy });
}

/** Round, soft-edged point sprite for the ink puff. */
export function drawSoftSprite(): CanvasTexture {
  const size = 64;
  const canvas = createCanvas(size, size);
  const ctx = context2d(canvas);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.92)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return makeTexture(canvas, { mipmaps: false });
}

/** Warm halo that hugs a rectangle, for the hovered memo. White-on-transparent; tinted by material. */
export function drawRimGlow(): CanvasTexture {
  const w = 256;
  const h = 256;
  const canvas = createCanvas(w, h);
  const ctx = context2d(canvas);
  ctx.clearRect(0, 0, w, h);
  const pad = 34;
  for (let i = 0; i < 22; i += 1) {
    const grow = (i / 21) * pad;
    const a = Math.pow(1 - i / 21, 2.2) * 0.11;
    ctx.strokeStyle = `rgba(255,255,255,${a.toFixed(4)})`;
    ctx.lineWidth = 3;
    const x = pad - grow;
    const y = pad - grow;
    ctx.beginPath();
    ctx.roundRect(x, y, w - 2 * x, h - 2 * y, 10 + grow);
    ctx.stroke();
  }
  return makeTexture(canvas, { mipmaps: false });
}

/** Clerk's-window blind: slats that leak warm light between them. */
export function drawBlind(): CanvasTexture {
  const w = 256;
  const h = 256;
  const canvas = createCanvas(w, h);
  const ctx = context2d(canvas);
  // A lit room behind a half-closed blind: warm light with thin slats across it.
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#ffd89a');
  bg.addColorStop(1, '#f0a850');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const slats = 12;
  const pitch = h / slats;
  for (let i = 0; i < slats; i += 1) {
    const y = i * pitch;
    const g = ctx.createLinearGradient(0, y, 0, y + pitch * 0.46);
    g.addColorStop(0, '#b27a3c');
    g.addColorStop(1, '#7c5226');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, w, pitch * 0.4);
  }
  return makeTexture(canvas, { mipmaps: true, anisotropy: 4 });
}

/** Reddish-brown turned wood for the stamp grip: grain along the lathe's v axis, a worn band. */
export function drawGripWood(anisotropy: number): CanvasTexture {
  const rng = mulberry32(0x6710);
  const w = 128;
  const h = 256;
  const canvas = createCanvas(w, h);
  const ctx = context2d(canvas);
  // Canvas top is the knob's crown (v = 1), bottom is the neck seat (v = 0).
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#b0653a');
  base.addColorStop(0.45, '#a25a32');
  base.addColorStop(1, '#8f4d2c');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i += 1) {
    const x = rng() * w;
    ctx.strokeStyle = rng() > 0.45
      ? `rgba(38,16,6,${(0.07 + rng() * 0.16).toFixed(3)})`
      : `rgba(176,104,58,${(0.05 + rng() * 0.1).toFixed(3)})`;
    ctx.lineWidth = 0.6 + rng() * 2.2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + (rng() - 0.5) * 7, h * 0.3, x + (rng() - 0.5) * 7, h * 0.7, x + (rng() - 0.5) * 4, h);
    ctx.stroke();
  }
  // Darker where a hand holds it: the neck and the underside of the knob, rubbed with oil.
  const hand = ctx.createLinearGradient(0, h * 0.35, 0, h);
  hand.addColorStop(0, 'rgba(34,14,6,0)');
  hand.addColorStop(0.5, 'rgba(34,14,6,0.28)');
  hand.addColorStop(1, 'rgba(34,14,6,0.16)');
  ctx.fillStyle = hand;
  ctx.fillRect(0, h * 0.35, w, h * 0.65);
  return makeTexture(canvas, { repeat: true, anisotropy });
}

export interface EnamelTextures {
  /** Near-white colour variation: multiplies the enamel colour. */
  map: CanvasTexture;
  roughness: CanvasTexture;
}

/** Low-frequency paint irregularity for the machine body: a touch of colour and gloss drift. */
export function drawEnamelBody(anisotropy: number): EnamelTextures {
  const rng = mulberry32(0xe4a1);
  const size = 256;
  const color = createCanvas(size, size);
  const cctx = context2d(color);
  cctx.fillStyle = '#f4f4f4';
  cctx.fillRect(0, 0, size, size);
  mottle(cctx, size, size, rng, 60, [30, 110], 0.1, 'rgba(255,255,255,A)', 'rgba(150,170,170,A)');
  const rough = createCanvas(size, size);
  const rctx = context2d(rough);
  rctx.fillStyle = 'rgb(168,168,168)';
  rctx.fillRect(0, 0, size, size);
  mottle(rctx, size, size, rng, 70, [24, 100], 0.32, 'rgba(255,255,255,A)', 'rgba(70,70,70,A)');
  return {
    map: makeTexture(color, { repeat: true, anisotropy }),
    roughness: makeTexture(rough, { colorData: false, repeat: true, anisotropy }),
  };
}

/**
 * The hatch panel's paint with its history: teal enamel baked in, steel showing at the edges
 * where a hand opens it, and chips around the pull. (Canvas top is the panel's top edge.)
 */
export function drawHatchEnamel(anisotropy: number): CanvasTexture {
  const rng = mulberry32(0x4a7c);
  const w = 1024;
  const h = 390;
  const canvas = createCanvas(w, h);
  const ctx = context2d(canvas);
  ctx.fillStyle = '#3c7775';
  ctx.fillRect(0, 0, w, h);
  mottle(ctx, w, h, rng, 50, [30, 120], 0.07, 'rgba(120,170,166,A)', 'rgba(18,48,46,A)');
  speckle(ctx, w, h, rng, 5000, 1.2, 0.05, '10,30,28');
  const steel = (x: number, y: number, rx: number, ry: number, alpha: number | string) => {
    ctx.fillStyle = `rgba(162,170,168,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rng() * 3, 0, Math.PI * 2);
    ctx.fill();
  };
  // Sparse edge wear: short worn runs, heavier along the top edge and the corners.
  for (let i = 0; i < 42; i += 1) {
    const edge = rng();
    const t = rng();
    const long = 6 + rng() * 22;
    const alpha = (0.28 + rng() * 0.4).toFixed(2);
    if (edge < 0.4) steel(t * w, 2 + rng() * 3, long, 1.6 + rng() * 1.6, alpha);
    else if (edge < 0.55) steel(t * w, h - 2 - rng() * 2, long * 0.6, 1.2, alpha);
    else if (edge < 0.78) steel(2 + rng() * 2, t * h, 1.6, long * 0.5, alpha);
    else steel(w - 2 - rng() * 2, t * h, 1.6, long * 0.5, alpha);
  }
  for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h]] as const) {
    for (let k = 0; k < 4; k += 1) steel(cx + (cx ? -1 : 1) * rng() * 14, cy + (cy ? -1 : 1) * rng() * 12, 5 + rng() * 6, 3 + rng() * 4, '0.45');
  }
  // Around the pull: a hand's worth of rubbed paint.
  for (let k = 0; k < 14; k += 1) {
    steel(w / 2 + (rng() - 0.5) * 150, h * 0.14 + (rng() - 0.3) * 40, 2 + rng() * 5, 1.5 + rng() * 3, (0.2 + rng() * 0.3).toFixed(2));
  }
  return makeTexture(canvas, { anisotropy });
}

/** Cream at the bulb to ochre at the rim, so the shade's inside reads as lit, not flat. */
export function drawShadeInterior(): CanvasTexture {
  const w = 16;
  const h = 128;
  const canvas = createCanvas(w, h);
  const ctx = context2d(canvas);
  // Canvas top is the rim (v = 1); bottom is the apex, where the bulb is.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#b27a38');
  g.addColorStop(0.45, '#d4a566');
  g.addColorStop(1, '#f4e1ba');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return makeTexture(canvas, { mipmaps: false });
}

/** A wide, soft warm pool of light for the desk beneath the memo. */
export function drawPoolGlow(): CanvasTexture {
  const size = 256;
  const canvas = createCanvas(size, size);
  const ctx = context2d(canvas);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10;
    g.addColorStop(t, `rgba(255,255,255,${Math.pow(1 - t, 2.2).toFixed(4)})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return makeTexture(canvas, { mipmaps: false });
}
