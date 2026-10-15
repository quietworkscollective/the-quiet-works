import type { CanvasTexture } from 'three';
import { nth } from '../math.ts';
import { context2d } from './canvas.ts';

/**
 * The small tiling textures that stay procedural (wired glass, frost, coir, felt, the Office
 * enamel's wear). The wall plaster, terrazzo, oak, door paint, enamel and brass are scanned
 * surfaces now (scanned.ts). Each returns near-neutral colour (the material tints it); `mean`
 * lets the material divide the texture's own mean out, so a surface averages exactly the hex
 * written in the art direction whatever detail the texture holds.
 */

export interface Surface {
  map: CanvasTexture;
  /** Roughness (green channel), when the surface needs variation beyond a constant. */
  rough?: CanvasTexture;
  /** The mean linear RGB of `map`, to divide out of the material colour. */
  mean: readonly [number, number, number];
}

/** A surface whose roughness map is always present. */
export interface RoughSurface extends Surface {
  rough: CanvasTexture;
}

const srgbToLinear = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

/** Mean linear RGB of a canvas, sampled on a stride. */
export function averageLinear(canvas: HTMLCanvasElement): readonly [number, number, number] {
  const ctx = context2d(canvas);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 16) {
    r += srgbToLinear(nth(data, i));
    g += srgbToLinear(nth(data, i + 1));
    b += srgbToLinear(nth(data, i + 2));
    n += 1;
  }
  return [r / n, g / n, b / n];
}
