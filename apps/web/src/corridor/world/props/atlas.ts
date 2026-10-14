import type { CanvasTexture } from 'three';
import { context2d, createCanvas, makeTexture } from '../textures/canvas.ts';
import { PROP_ATLAS } from './atlasLayout.ts';
import { paintAtlas } from './atlasPaint.ts';

/**
 * The props' one atlas as a texture (2048 x 1024, mipmapped, drawn once the fonts are ready). The
 * material that shows it owns it; disposing the material set frees the texture.
 */
export function makePropAtlas(anisotropy: number): CanvasTexture {
  const canvas = createCanvas(PROP_ATLAS.width, PROP_ATLAS.height);
  paintAtlas(context2d(canvas));
  return makeTexture(canvas, { anisotropy });
}
