import { uvRect, type Rect, type UvRect } from './artLayout.ts';

/**
 * The foliage atlas: four leaf shapes as white-ish masks with alpha, tinted green (or grey-green,
 * or olive) by vertex colour. Plants are cut-out cards, so a whole climber is a few hundred
 * triangles in one draw call, however many leaves it has.
 */
export const FOLIAGE_ATLAS = { width: 512, height: 512 } as const;

export const FOLIAGE_CELLS = {
  /** A heart-shaped ivy leaf with a lobed outline, tip up. */
  ivy: { x: 0, y: 0, w: 256, h: 256 },
  /** A small pointed oval leaf, the kind a trained jasmine carries. */
  oval: { x: 256, y: 0, w: 256, h: 256 },
  /** A pinnate fern frond, tip up. */
  frond: { x: 0, y: 256, w: 256, h: 256 },
  /** A broad, glossy leaf with a strong midrib (a rubber plant), tip up. */
  broad: { x: 256, y: 256, w: 256, h: 256 },
} as const satisfies Record<string, Rect>;

export type FoliageCell = keyof typeof FOLIAGE_CELLS;

export function foliageUv(cell: FoliageCell): UvRect {
  return uvRect(FOLIAGE_CELLS[cell], FOLIAGE_ATLAS.width, FOLIAGE_ATLAS.height);
}
