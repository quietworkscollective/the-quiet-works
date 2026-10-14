import { quadUvs, uvRect, type Rect, type UvRect } from '../artLayout.ts';
import type { Vec2 } from '../math.ts';

/**
 * Where each piece of lettered or printed art sits on the props' one atlas. The geometry (which
 * needs UV rectangles) and the painter (which needs pixel rectangles) both read this, so they
 * cannot drift apart. Pure data: no canvas, so it can be tested in node.
 *
 * Pixel sizes are chosen for the object's real size: about 2,100 px per metre on the photograph,
 * 3,200 on the cards, 5,600 on the engraved plates, so a label reads when the visitor is close
 * enough to read it and costs nothing when they are not.
 */

export const PROP_ATLAS = { width: 2048, height: 1024, gutter: 6 } as const;

export type AtlasId =
  | 'photo'
  | 'slip'
  | 'rota'
  | 'plateComposed'
  | 'plateEffort'
  | 'plateRunner'
  | 'reserved'
  | 'shirtLabel'
  | 'bootTag'
  | 'kitLabel'
  | 'recipeLabel'
  | 'recipeCard'
  | 'scoreCover'
  | 'chess'
  | 'patch'
  | 'ball';

/** Pixel size of each item; the packer places them. */
export const ATLAS_SIZES: Readonly<Record<AtlasId, readonly [number, number]>> = {
  photo: [704, 448],
  slip: [800, 112],
  rota: [800, 200],
  plateComposed: [400, 96],
  plateEffort: [400, 96],
  plateRunner: [520, 96],
  reserved: [256, 144],
  shirtLabel: [560, 88],
  bootTag: [224, 336],
  kitLabel: [448, 152],
  recipeLabel: [336, 96],
  recipeCard: [320, 224],
  scoreCover: [240, 336],
  chess: [256, 256],
  patch: [96, 96],
  // 256 texels round the equator and 128 pole to pole, plus a wrapped margin of 4 texels each side.
  ball: [264, 128],
};

/** Shelf-pack the items, tallest first, left to right with a gutter between them. */
export function packAtlas(sizes: Readonly<Record<string, readonly [number, number]>>, width: number, height: number, gutter: number): Record<string, Rect> {
  const items = Object.entries(sizes).sort((a, b) => b[1][1] - a[1][1] || b[1][0] - a[1][0]);
  const out: Record<string, Rect> = {};
  let x = gutter;
  let y = gutter;
  let row = 0;
  for (const [id, [w, h]] of items) {
    if (x + w + gutter > width) {
      x = gutter;
      y += row + gutter;
      row = 0;
    }
    if (y + h + gutter > height) throw new Error(`the props atlas is full at ${id}`);
    out[id] = { x, y, w, h };
    x += w + gutter;
    row = Math.max(row, h);
  }
  return out;
}

export const ATLAS: Readonly<Record<AtlasId, Rect>> = packAtlas(ATLAS_SIZES, PROP_ATLAS.width, PROP_ATLAS.height, PROP_ATLAS.gutter) as Record<AtlasId, Rect>;

export function atlasUvRect(id: AtlasId): UvRect {
  return uvRect(ATLAS[id], PROP_ATLAS.width, PROP_ATLAS.height);
}

/** UVs for a quad listed bottom-left, bottom-right, top-right, top-left, covering the whole item. */
export function atlasUvs(id: AtlasId): readonly [Vec2, Vec2, Vec2, Vec2] {
  return quadUvs(atlasUvRect(id));
}

/**
 * UVs for part of an item: `u0..u1` and `v0..v1` are fractions of the item (0..1, v up from its
 * bottom edge), for a label that shows only part of its image or a strip that slides.
 */
export function atlasUvsPart(id: AtlasId, u0: number, v0: number, u1: number, v1: number): readonly [Vec2, Vec2, Vec2, Vec2] {
  const [a, b, c, d] = atlasUvRect(id);
  const lerp = (p: number, q: number, t: number) => p + (q - p) * t;
  return quadUvs([lerp(a, c, u0), lerp(b, d, v0), lerp(a, c, u1), lerp(b, d, v1)]);
}

/** The atlas item each of the lead's drafted labels (`CORRIDOR_PROPS.labels`) is typeset on. */
export const LABEL_ITEMS = {
  'trophy-cabinet': 'rota',
  'team-shirts': 'shirtLabel',
  'walking-boots': 'bootTag',
  'repair-kit': 'kitLabel',
  'recipe-drawer': 'recipeLabel',
  'team-photo': 'slip',
} as const satisfies Record<string, AtlasId>;

/** The atlas items the four trophy inscriptions (`CORRIDOR_PROPS.trophies`) are engraved on, in order. */
export const TROPHY_ITEMS: readonly AtlasId[] = ['plateComposed', 'plateEffort', 'plateRunner', 'reserved'];
