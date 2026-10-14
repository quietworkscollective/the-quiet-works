import type { Vec2 } from './math.ts';

/**
 * Where each piece of lettered art sits on its canvas atlas. The geometry builders (which need
 * UV rectangles) and the canvas painters (which need pixel rectangles) both read this, so they
 * cannot drift apart. Pixel rectangles are top-down, as on a canvas; UV rectangles are
 * [u0, v0, u1, v1] with v up, as WebGL wants them.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type UvRect = readonly [number, number, number, number];

export function uvRect(r: Rect, width: number, height: number): UvRect {
  return [r.x / width, 1 - (r.y + r.h) / height, (r.x + r.w) / width, 1 - r.y / height];
}

/** The four corner UVs of a rect for a quad listed bottom-left, bottom-right, top-right, top-left. */
export function quadUvs(rect: UvRect): readonly [Vec2, Vec2, Vec2, Vec2] {
  return [
    [rect[0], rect[1]],
    [rect[2], rect[1]],
    [rect[2], rect[3]],
    [rect[0], rect[3]],
  ];
}

/** Door plaques: 280 x 90 mm, drawn at 512 x 164 px each, stacked down one narrow atlas. */
export const PLAQUE_ATLAS = { width: 512, height: 1024, slot: { w: 512, h: 164 }, capacity: 6 } as const;

export interface PlaqueSpec {
  text: string;
  code?: string | undefined;
}

export class PlaqueLayout {
  private readonly slots: PlaqueSpec[] = [];
  constructor(plaques: readonly PlaqueSpec[]) {
    for (const p of plaques) {
      if (!this.slots.some((s) => s.text === p.text)) this.slots.push(p);
    }
    if (this.slots.length > PLAQUE_ATLAS.capacity) throw new Error(`more than ${PLAQUE_ATLAS.capacity} distinct plaques`);
  }
  get all(): readonly PlaqueSpec[] {
    return this.slots;
  }
  rect(text: string): Rect {
    const i = this.slots.findIndex((s) => s.text === text);
    if (i < 0) throw new Error(`unregistered plaque: ${text}`);
    return { x: 0, y: i * PLAQUE_ATLAS.slot.h, w: PLAQUE_ATLAS.slot.w, h: PLAQUE_ATLAS.slot.h };
  }
  uv(text: string): UvRect {
    return uvRect(this.rect(text), PLAQUE_ATLAS.width, PLAQUE_ATLAS.height);
  }
}

/** Brass numerals and other cut-out lettering: one glyph per cell on a small alpha atlas. */
export const NUMERAL_ATLAS = { width: 256, height: 256 } as const;
export const NUMERAL_4: Rect = { x: 0, y: 0, w: 128, h: 192 };

/** The general art atlas: framed drawings, the glazed directory, the pressure gauge dial. */
export const ART_ATLAS = { width: 1024, height: 1024 } as const;
export const ART = {
  /** A framed building section, ink on cream. */
  section: { x: 0, y: 0, w: 640, h: 400 } as Rect,
  /** A framed plan drawing, taller than wide. */
  plan: { x: 640, y: 0, w: 384, h: 512 } as Rect,
  /** The glazed directory's lettered board. */
  directory: { x: 0, y: 400, w: 448, h: 576 } as Rect,
  /** Pressure gauge dial. */
  gauge: { x: 448, y: 512, w: 256, h: 256 } as Rect,
  /** An empty pinboard's cork-and-baize face. */
  pinboard: { x: 704, y: 512, w: 320, h: 224 } as Rect,
  /** A framed certificate-style sheet. */
  certificate: { x: 448, y: 768, w: 360, h: 232 } as Rect,
  /** The lobby clock's dial: ivory, black numerals, a minute track. */
  clock: { x: 816, y: 768, w: 200, h: 200 } as Rect,
} as const;
