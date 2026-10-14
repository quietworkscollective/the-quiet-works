/**
 * The smoke's one texture: 256 x 256 RGBA, tileable, softness baked in (ADR 0003, consult 4).
 * Two screen-space layers sample it at slightly different scales, so a single small image reads as
 * two or three large, overlapping masses and never as particles. Coal is the base; the smoke is
 * `#20282A` varying in density only, so there are no white edges to catch the eye.
 *
 * Pure and seeded: the same seed gives the same bytes on every device and in every test. Turning
 * the bytes into an image (a canvas, an object URL) is the browser-only `smokeTextureUrl`.
 */

export const SMOKE_SIZE = 256;
/** The smoke's colour: the corridor's fog, one step lighter than coal. */
export const SMOKE_RGB = [0x20, 0x28, 0x2a] as const;

/** A small seeded generator (mulberry32): deterministic, no global state. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (a === b ? 0 : (b - a) * t);

/** A periodic value-noise lattice: `cells` x `cells` random values, wrapping at the edges. */
function lattice(cells: number, random: () => number): Float32Array {
  const values = new Float32Array(cells * cells);
  for (let i = 0; i < values.length; i += 1) values[i] = random();
  return values;
}

function sample(values: Float32Array, cells: number, u: number, v: number): number {
  const x = u * cells;
  const y = v * cells;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const at = (ix: number, iy: number) => values[(((iy % cells) + cells) % cells) * cells + (((ix % cells) + cells) % cells)] ?? 0;
  return lerp(lerp(at(x0, y0), at(x0 + 1, y0), fx), lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), fx), fy);
}

const smoothstep = (edge0: number, edge1: number, x: number): number => smooth(Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0))));

/**
 * The texture's bytes, row by row, RGBA. Density is two octaves of periodic value noise (a few
 * large cells and a softer, smaller set), shaped so about half the image is smoke and the edges of
 * each mass are broad and soft.
 */
export function smokeNoise(seed = 0x5eed): Uint8ClampedArray {
  const random = seeded(seed);
  const broad = lattice(3, random);
  const soft = lattice(6, random);
  const pixels = new Uint8ClampedArray(SMOKE_SIZE * SMOKE_SIZE * 4);
  for (let y = 0; y < SMOKE_SIZE; y += 1) {
    for (let x = 0; x < SMOKE_SIZE; x += 1) {
      const u = x / SMOKE_SIZE;
      const v = y / SMOKE_SIZE;
      const density = 0.72 * sample(broad, 3, u, v) + 0.28 * sample(soft, 6, u, v);
      const alpha = smoothstep(0.3, 0.74, density) * 0.94;
      const i = (y * SMOKE_SIZE + x) * 4;
      pixels[i] = SMOKE_RGB[0];
      pixels[i + 1] = SMOKE_RGB[1];
      pixels[i + 2] = SMOKE_RGB[2];
      pixels[i + 3] = Math.round(alpha * 255);
    }
  }
  return pixels;
}

/**
 * The texture as an object URL for CSS (`img-src` allows `blob:`), or null where there is no 2D
 * canvas. The caller revokes the URL when it is done. Runs once per page.
 */
export function smokeTextureUrl(seed?: number): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = SMOKE_SIZE;
      canvas.height = SMOKE_SIZE;
      const context = canvas.getContext('2d');
      if (!context || typeof canvas.toBlob !== 'function') {
        resolve(null);
        return;
      }
      const bytes = smokeNoise(seed);
      context.putImageData(new ImageData(bytes as Uint8ClampedArray<ArrayBuffer>, SMOKE_SIZE, SMOKE_SIZE), 0, 0);
      canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), 'image/png');
    } catch {
      resolve(null);
    }
  });
}
