import type { Rect } from '../artLayout.ts';
import { packAtlas } from './atlasLayout.ts';

/**
 * Where each loaded model's textures sit on the props' one model atlas. Every ready-made model
 * brings its own base-colour map and its own packed occlusion/roughness/metalness map; drawn as
 * separate materials they would cost a draw call each, so the props repack them into one atlas of
 * each kind and every model shares one material (one more draw call for all of them). Pure data:
 * no canvas, so it can be planned and tested in node.
 *
 * The cells are square, scaled down from the sources (1K, 512, 256 px) by how large the model
 * stands on screen: a bat is read along its whole length, a ball is a few dozen pixels. The
 * models' own UV islands keep a margin of at least 2% inside their texture, and the gutter between
 * cells is filled from the cell's own border, so mip levels never bleed one model into another.
 */

export const MODEL_ATLAS = { width: 2048, height: 1024, gutter: 8 } as const;

/** Edge in pixels of the atlas cell each model is drawn into; a model not listed gets `DEFAULT_EDGE`. */
export const MODEL_EDGE: Readonly<Record<string, number>> = {
  'cricket-bat': 512,
  'trophy-cup-tall': 384,
  'trophy-cup-squat': 256,
  'trophy-shield': 256,
  'trophy-plinth-small': 256,
  'trophy-plinth-empty': 128,
  'cricket-stumps': 256,
  'cricket-ball': 128,
  scorebook: 256,
  'toolbox-metal': 256,
  'glove-work': 256,
  'watering-can': 256,
};
export const DEFAULT_EDGE = 256;

export interface ModelAtlasPlan {
  width: number;
  height: number;
  gutter: number;
  /** Pixel rectangle of each model's cell, top-left origin as on a canvas. */
  cells: Readonly<Record<string, Rect>>;
}

export function edgeOf(id: string): number {
  return MODEL_EDGE[id] ?? DEFAULT_EDGE;
}

/** Plan the atlas for the models that actually loaded. Throws when they do not fit. */
export function planModelAtlas(ids: readonly string[]): ModelAtlasPlan {
  const sizes: Record<string, readonly [number, number]> = {};
  for (const id of ids) sizes[id] = [edgeOf(id), edgeOf(id)];
  const { width, height, gutter } = MODEL_ATLAS;
  return { width, height, gutter, cells: packAtlas(sizes, width, height, gutter) };
}

/** [u0, v0, u1, v1] with v measured down from the top of the image, as a glTF texture is (the atlas textures do not flip). */
export type ModelUv = readonly [number, number, number, number];

export function modelUv(cell: Rect, plan: Pick<ModelAtlasPlan, 'width' | 'height'>): ModelUv {
  return [cell.x / plan.width, cell.y / plan.height, (cell.x + cell.w) / plan.width, (cell.y + cell.h) / plan.height];
}
