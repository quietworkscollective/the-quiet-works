import type { CanvasTexture } from 'three';
import { CORRIDOR_PROPS } from '@tqw/engine';
import { context2d, createCanvas, makeTexture } from './canvas.ts';
import { FONTS } from './text.ts';

/**
 * The office-hours card's two lettered states on one canvas: "open" on the top half, "closed"
 * below. The board shows one at a time (Board.tsx moves the texture's offset), chosen by the
 * visitor's own clock. The words are CORRIDOR_PROPS.officeHours, set as a typed card: three lines,
 * the way a clerk would break them.
 */

export const HOURS_CANVAS = { width: 768, height: 512 } as const;

/** Where the texture's offset puts each state in view (v runs up, so the top half is the upper v). */
export const HOURS_OFFSET = { open: 0.5, closed: 0 } as const;

function lines(text: string): string[] {
  return text.split(/(?<=[:.])\s+/);
}

function drawCard(ctx: CanvasRenderingContext2D, y0: number, text: string, closed: boolean): void {
  const w = HOURS_CANVAS.width;
  const h = HOURS_CANVAS.height / 2;
  ctx.fillStyle = '#e4d9ba';
  ctx.fillRect(0, y0, w, h);
  // A faint fibre of age, and a printed keyline inside the edge.
  const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
  g.addColorStop(0, 'rgba(255,248,226,0.5)');
  g.addColorStop(1, 'rgba(150,126,84,0.22)');
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, w, h);
  ctx.strokeStyle = 'rgba(70,50,32,0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(14, y0 + 14, w - 28, h - 28);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const rows = lines(text);
  const pitch = 66;
  const top = y0 + h / 2 - ((rows.length - 1) * pitch) / 2;
  rows.forEach((row, i) => {
    // The state's own line (the second) is struck heavier, as a typist would underline it.
    const key = i === 1;
    ctx.font = `${key ? 700 : 500} 54px ${FONTS.mono}`;
    ctx.fillStyle = key && closed ? '#6b2a22' : '#2a231a';
    ctx.fillText(row, w / 2, top + i * pitch);
  });
}

export function drawHoursCard(anisotropy: number): CanvasTexture {
  const canvas = createCanvas(HOURS_CANVAS.width, HOURS_CANVAS.height);
  const ctx = context2d(canvas);
  drawCard(ctx, 0, CORRIDOR_PROPS.officeHours.open, false);
  drawCard(ctx, HOURS_CANVAS.height / 2, CORRIDOR_PROPS.officeHours.closed, true);
  const texture = makeTexture(canvas, { anisotropy });
  texture.repeat.set(1, 0.5);
  return texture;
}
