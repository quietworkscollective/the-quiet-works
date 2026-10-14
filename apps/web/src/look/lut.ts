import { Data3DTexture, DataUtils, HalfFloatType, LinearFilter, NoColorSpace, RGBAFormat, ClampToEdgeWrapping } from 'three';
import { clamp01, type Rgb } from './colour.ts';
import { gradeColour } from './grade.ts';

/** Edge length of the grading cube. 16 cubed is 4096 entries: 32 KB as half floats. */
export const LUT_SIZE = 16;

/**
 * The grade as a table: `size`³ RGBA entries, red fastest, then green, then blue, each channel
 * the graded value of the lattice point (index / (size - 1)). With `strength` 0 every entry is
 * its own lattice point, the identity; the profile's intensity is applied later, when the table
 * is sampled, so one table serves every space.
 *
 * Pure data, no renderer: a composer pass and a node pipeline both read it as a 3D texture.
 */
export function buildLutTable(size = LUT_SIZE, strength = 1): Float32Array {
  const table = new Float32Array(size * size * size * 4);
  const last = size - 1;
  let i = 0;
  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        const lattice: Rgb = [r / last, g / last, b / last];
        const graded = gradeColour(lattice);
        table[i++] = lattice[0] + (graded[0] - lattice[0]) * strength;
        table[i++] = lattice[1] + (graded[1] - lattice[1]) * strength;
        table[i++] = lattice[2] + (graded[2] - lattice[2]) * strength;
        table[i++] = 1;
      }
    }
  }
  return table;
}

/**
 * Trilinear lookup of a table at a display-referred colour, the way a GPU samples it: the cube
 * is addressed so that 0 and 1 land on the centres of the edge entries.
 */
export function sampleLutTable(table: ArrayLike<number>, size: number, c: Rgb): Rgb {
  const last = size - 1;
  const [x, y, z] = [clamp01(c[0]) * last, clamp01(c[1]) * last, clamp01(c[2]) * last];
  const [x0, y0, z0] = [Math.min(Math.floor(x), last - 1), Math.min(Math.floor(y), last - 1), Math.min(Math.floor(z), last - 1)];
  const [fx, fy, fz] = [x - x0, y - y0, z - z0];
  const at = (xi: number, yi: number, zi: number, channel: number): number => table[((zi * size + yi) * size + xi) * 4 + channel] ?? 0;
  const out: number[] = [];
  for (let channel = 0; channel < 3; channel += 1) {
    const plane = (zi: number): number => {
      const bottom = at(x0, y0, zi, channel) * (1 - fx) + at(x0 + 1, y0, zi, channel) * fx;
      const top = at(x0, y0 + 1, zi, channel) * (1 - fx) + at(x0 + 1, y0 + 1, zi, channel) * fx;
      return bottom * (1 - fy) + top * fy;
    };
    out.push(plane(z0) * (1 - fz) + plane(z0 + 1) * fz);
  }
  return [out[0] ?? 0, out[1] ?? 0, out[2] ?? 0];
}

/**
 * The table as a 3D texture. Half floats, because 8 bits would band the shadows the grade is
 * there to open, and because RGBA16F is filterable in WebGL2 with no extension. Linear filtering
 * and clamped edges, and no colour space: the table is sampled and returned as it is.
 */
export function createLutTexture(size = LUT_SIZE, strength = 1): Data3DTexture {
  const table = buildLutTable(size, strength);
  const data = new Uint16Array(table.length);
  for (let i = 0; i < table.length; i += 1) data[i] = DataUtils.toHalfFloat(table[i] ?? 0);
  const texture = new Data3DTexture(data, size, size, size);
  texture.format = RGBAFormat;
  texture.type = HalfFloatType;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.wrapR = ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
  texture.name = 'look.grade-lut';
  return texture;
}
