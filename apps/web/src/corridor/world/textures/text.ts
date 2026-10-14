import { FONT_COND, FONT_MONO, FONT_SERIF } from './canvas.ts';

/** Text helpers for canvas art. Tracking is applied glyph by glyph so it works in every browser. */

export type Align = 'left' | 'center' | 'right';

export const FONTS = { cond: FONT_COND, mono: FONT_MONO, serif: FONT_SERIF } as const;

/** Width of `text` set at the current font with `tracking` pixels between glyphs. */
export function trackedWidth(ctx: CanvasRenderingContext2D, text: string, tracking: number): number {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + tracking;
  return Math.max(0, w - tracking);
}

/** Draw text with tracking, aligned about x. Returns the drawn width. */
export function drawTracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number, align: Align = 'left'): number {
  const w = trackedWidth(ctx, text, tracking);
  let cursor = align === 'left' ? x : align === 'center' ? x - w / 2 : x - w;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + tracking;
  }
  ctx.textAlign = prev;
  return w;
}

/**
 * The largest font size (down from `start`) at which `text` fits `maxWidth` with tracking given
 * as a fraction of the size. Sets the context's font to that size and returns it.
 */
export function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontFor: (size: number) => string,
  maxWidth: number,
  start: number,
  trackEm: number,
  min = 8,
): number {
  let size = start;
  for (; size > min; size -= 1) {
    ctx.font = fontFor(size);
    if (trackedWidth(ctx, text, trackEm * size) <= maxWidth) break;
  }
  ctx.font = fontFor(size);
  return size;
}

/** Break `text` into lines no wider than `maxWidth` at the current font. */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
