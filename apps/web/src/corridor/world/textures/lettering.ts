import type { CanvasTexture } from 'three';
import { mulberry32 } from '../math.ts';
import { context2d, createCanvas, makeTexture } from './canvas.ts';
import { drawTracked, FONTS, fitFont } from './text.ts';

/**
 * The building's own signage over the inner doors: gilt capitals on a black lacquer fascia, the
 * way a sign-writer would have laid it in about 1910. It is typeset with Newsreader and never
 * generated: the words are `LANDING.lettering`. The brand's wordmark (UNHELD) is a different
 * voice and lives in the DOM; this belongs to the building.
 */

export interface Lettering {
  /** Colour. */
  map: CanvasTexture;
  /** Green = roughness, blue = metalness: the letters are gold leaf, the ground is lacquer. */
  orm: CanvasTexture;
  /** Aspect (width / height) of the canvas, so the quad can match it. */
  aspect: number;
}

const W = 1024;
const H = 176;

/** Width over height of the lettering canvas: the fascia's panel is cut to this shape. */
export const LETTERING_ASPECT = W / H;

export function drawLettering(text: string, anisotropy: number): Lettering {
  const rng = mulberry32(0x71e5);
  const colour = createCanvas(W, H);
  const c = context2d(colour);
  const orm = createCanvas(W, H);
  const o = context2d(orm);

  // Ground: black-green lacquer with a faint sheen, a gilt keyline and a finer inner one.
  const ground = c.createLinearGradient(0, 0, 0, H);
  ground.addColorStop(0, '#16201d');
  ground.addColorStop(0.5, '#0e1513');
  ground.addColorStop(1, '#121a17');
  c.fillStyle = ground;
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 1400; i += 1) {
    c.fillStyle = `rgba(255,255,255,${(rng() * 0.045).toFixed(3)})`;
    c.fillRect(rng() * W, rng() * H, 1.2, 1.2);
  }
  o.fillStyle = 'rgb(0,118,0)';
  o.fillRect(0, 0, W, H);

  const gilt = (ctx: CanvasRenderingContext2D, y: number, h: number): CanvasGradient => {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#f0d48c');
    g.addColorStop(0.45, '#c9a257');
    g.addColorStop(1, '#8e6c30');
    return g;
  };
  const rule = (ctx: CanvasRenderingContext2D, fill: string | CanvasGradient, x: number, y: number, w: number, h: number): void => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  };
  for (const [ctx, metal] of [[c, false], [o, true]] as const) {
    const fill = metal ? 'rgb(0,80,255)' : gilt(ctx, 0, H);
    // Outer keyline and inner fine line.
    rule(ctx, fill, 14, 14, W - 28, 3);
    rule(ctx, fill, 14, H - 17, W - 28, 3);
    rule(ctx, fill, 14, 14, 3, H - 28);
    rule(ctx, fill, W - 17, 14, 3, H - 28);
    rule(ctx, fill, 26, 26, W - 52, 1.4);
    rule(ctx, fill, 26, H - 27.4, W - 52, 1.4);
  }

  // The words. Tracked wide, as sign-writers set capitals, with a dark edge below-right and a
  // pale edge above-left so the leaf reads as raised.
  const draw = (ctx: CanvasRenderingContext2D, fillStyle: string | CanvasGradient, dx: number, dy: number): void => {
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = fillStyle;
    const size = fitFont(ctx, text, (s) => `500 ${s}px ${FONTS.serif}`, W - 150, 112, 0.3, 30);
    drawTracked(ctx, text, W / 2 + dx, H / 2 + size * 0.34 + dy, 0.3 * size, 'center');
  };
  draw(c, 'rgba(0,0,0,0.55)', 2.2, 2.4);
  draw(c, gilt(c, H * 0.22, H * 0.56), 0, 0);
  draw(c, 'rgba(255,238,190,0.5)', -0.9, -1);
  draw(o, 'rgb(0,76,255)', 0, 0);

  return {
    map: makeTexture(colour, { anisotropy }),
    orm: makeTexture(orm, { colorData: false, anisotropy }),
    aspect: W / H,
  };
}
