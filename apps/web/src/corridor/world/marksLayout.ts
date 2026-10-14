import { uvRect, type Rect, type UvRect } from './artLayout.ts';

/**
 * Where every door mark sits on the one marks atlas. All of a door's marks, chips, wear and dust
 * are quads that sample this atlas and are tinted by vertex colour, so every door in the corridor
 * shares a single material and a single draw call for the lot (ADR 0004: marks are atlased).
 *
 * The atlas holds masks (white shapes with alpha), not colours: the paint, substrate or grime a
 * mask stands for is the vertex colour. Pixel rectangles are top-down as on a canvas; `uvOf`
 * converts to the v-up UVs WebGL wants. This file is pure data so the geometry builders (which
 * need UVs) and the canvas painter (which needs pixels) cannot drift apart.
 */

export const MARKS_ATLAS = { width: 1024, height: 1024 } as const;

/** The fixed cells: a solid, a polish glow, scuffs, a dust strip, chips, residues, carvings. */
export const MARK_CELLS = {
  solid: { x: 0, y: 0, w: 8, h: 8 },
  polish: { x: 16, y: 0, w: 128, h: 128 },
  scuff0: { x: 152, y: 0, w: 256, h: 96 },
  scuff1: { x: 152, y: 104, w: 256, h: 96 },
  dust: { x: 416, y: 0, w: 256, h: 32 },
  drip: { x: 416, y: 40, w: 64, h: 160 },
  stain: { x: 488, y: 40, w: 184, h: 160 },
  chip0: { x: 0, y: 208, w: 128, h: 128 },
  chip1: { x: 128, y: 208, w: 128, h: 128 },
  chip2: { x: 256, y: 208, w: 128, h: 128 },
  chip3: { x: 384, y: 208, w: 128, h: 128 },
  chip4: { x: 512, y: 208, w: 128, h: 128 },
  chip5: { x: 640, y: 208, w: 128, h: 128 },
  edge0: { x: 768, y: 208, w: 128, h: 128 },
  edge1: { x: 896, y: 208, w: 128, h: 128 },
  residue0: { x: 0, y: 344, w: 256, h: 192 },
  residue1: { x: 264, y: 344, w: 256, h: 192 },
  filled: { x: 528, y: 344, w: 256, h: 192 },
  borderStraight: { x: 792, y: 344, w: 224, h: 64 },
  borderCorner: { x: 792, y: 416, w: 120, h: 120 },
  crack: { x: 920, y: 416, w: 96, h: 120 },
  /** The ghost of a brass numeral taken down: a serif 4, set in the cell's upper-left. */
  ghost4: { x: 0, y: 900, w: 120, h: 124 },
  /** A neat rounded rectangle, a repair patch or tin plate, with a soft sanded edge. */
  patch: { x: 136, y: 900, w: 200, h: 124 },
} as const satisfies Record<string, Rect>;

export type MarkCell = keyof typeof MARK_CELLS;

/** Text strips (stencils, ghost lettering, notices) are stacked below the fixed cells. */
export const MARK_TEXT = { y0: 544, rowHeight: 56, capacity: 6, fontPx: 40, trackPx: 7 } as const;

/**
 * The advance of one stencil glyph, as a fraction of the font size. The strips are set in a
 * monospaced face so the width of a string is arithmetic (the geometry needs it before any
 * canvas exists, in node tests as in the browser).
 */
export const STENCIL_ADVANCE = 0.6;

/** The pixel width of `text` set as a stencil strip. */
export function stencilWidthPx(text: string): number {
  const n = [...text].length;
  return Math.ceil(n * MARK_TEXT.fontPx * STENCIL_ADVANCE + Math.max(0, n - 1) * MARK_TEXT.trackPx);
}

/** The strips registered for a set of texts, in the order they are painted. */
export class MarksLayout {
  private readonly texts: string[] = [];

  constructor(texts: readonly string[]) {
    for (const t of texts) if (!this.texts.includes(t)) this.texts.push(t);
    if (this.texts.length > MARK_TEXT.capacity) throw new Error(`more than ${MARK_TEXT.capacity} distinct mark texts`);
    for (const t of this.texts) {
      if (stencilWidthPx(t) > MARKS_ATLAS.width) throw new Error(`mark text too long for the atlas: ${t}`);
    }
  }

  get all(): readonly string[] {
    return this.texts;
  }

  /** The strip's pixel rectangle: exactly as wide as its text. */
  textRect(text: string): Rect {
    const i = this.texts.indexOf(text);
    if (i < 0) throw new Error(`unregistered mark text: ${text}`);
    return { x: 0, y: MARK_TEXT.y0 + i * MARK_TEXT.rowHeight, w: stencilWidthPx(text), h: MARK_TEXT.rowHeight };
  }

  textUv(text: string): UvRect {
    return uvRect(this.textRect(text), MARKS_ATLAS.width, MARKS_ATLAS.height);
  }

  /** Width to height of the strip's text, so a quad of any letter height keeps the letterforms true. */
  textAspect(text: string): number {
    const r = this.textRect(text);
    return r.w / r.h;
  }
}

export function cellUv(cell: MarkCell): UvRect {
  return uvRect(MARK_CELLS[cell], MARKS_ATLAS.width, MARKS_ATLAS.height);
}

/** A sub-rectangle of a cell, as fractions of the cell (0..1, top-down), as UVs. */
export function cellUvPart(cell: MarkCell, fx0: number, fy0: number, fx1: number, fy1: number): UvRect {
  const r = MARK_CELLS[cell];
  return uvRect({ x: r.x + r.w * fx0, y: r.y + r.h * fy0, w: r.w * (fx1 - fx0), h: r.h * (fy1 - fy0) }, MARKS_ATLAS.width, MARKS_ATLAS.height);
}
