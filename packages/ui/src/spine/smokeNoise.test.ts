import { SMOKE_RGB, SMOKE_SIZE, smokeNoise, smokeTextureUrl } from './smokeNoise.ts';

const alphaAt = (pixels: Uint8ClampedArray, x: number, y: number): number => pixels[(y * SMOKE_SIZE + x) * 4 + 3]! / 255;

describe('smokeNoise', () => {
  const pixels = smokeNoise();

  it('is one 256 x 256 RGBA texture', () => {
    expect(SMOKE_SIZE).toBe(256);
    expect(pixels.length).toBe(256 * 256 * 4);
  });

  it('is the same on every device: seeded, so a seed always gives the same bytes', () => {
    expect([...smokeNoise(7).slice(0, 4096)]).toEqual([...smokeNoise(7).slice(0, 4096)]);
    expect([...smokeNoise(7).slice(0, 4096)]).not.toEqual([...smokeNoise(8).slice(0, 4096)]);
  });

  it('is smoke-coloured everywhere and only its density varies: no white edges', () => {
    let firstWrongColour = -1;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] !== SMOKE_RGB[0] || pixels[i + 1] !== SMOKE_RGB[1] || pixels[i + 2] !== SMOKE_RGB[2]) {
        firstWrongColour = i;
        break;
      }
    }
    expect(firstWrongColour, 'the first RGB mismatch is a byte offset in the texture').toBe(-1);
    const brightest = Math.max(...SMOKE_RGB);
    expect(brightest).toBeLessThan(0x40);
  });

  it('is about half smoke and half gap, so it reads as a few large masses rather than a haze', () => {
    let total = 0;
    let dense = 0;
    let clear = 0;
    for (let y = 0; y < SMOKE_SIZE; y += 1) {
      for (let x = 0; x < SMOKE_SIZE; x += 1) {
        const a = alphaAt(pixels, x, y);
        total += a;
        if (a > 0.6) dense += 1;
        if (a < 0.05) clear += 1;
      }
    }
    const mean = total / (SMOKE_SIZE * SMOKE_SIZE);
    expect(mean).toBeGreaterThan(0.25);
    expect(mean).toBeLessThan(0.75);
    expect(dense / (SMOKE_SIZE * SMOKE_SIZE)).toBeGreaterThan(0.15);
    expect(clear / (SMOKE_SIZE * SMOKE_SIZE)).toBeGreaterThan(0.1);
  });

  it('is soft: no pixel differs sharply from its neighbour', () => {
    let steepest = 0;
    for (let y = 0; y < SMOKE_SIZE; y += 1) {
      for (let x = 0; x < SMOKE_SIZE - 1; x += 1) {
        steepest = Math.max(steepest, Math.abs(alphaAt(pixels, x, y) - alphaAt(pixels, x + 1, y)));
      }
    }
    expect(steepest).toBeLessThan(0.06);
  });

  it('tiles: the left and right edges, and the top and bottom, meet as softly as any neighbours', () => {
    let seam = 0;
    for (let i = 0; i < SMOKE_SIZE; i += 1) {
      seam = Math.max(seam, Math.abs(alphaAt(pixels, 0, i) - alphaAt(pixels, SMOKE_SIZE - 1, i)));
      seam = Math.max(seam, Math.abs(alphaAt(pixels, i, 0) - alphaAt(pixels, i, SMOKE_SIZE - 1)));
    }
    expect(seam).toBeLessThan(0.06);
  });

  it('never exceeds 94% opacity: the opaque backing, not the texture, closes the seam', () => {
    let max = 0;
    for (let i = 3; i < pixels.length; i += 4) max = Math.max(max, pixels[i]!);
    expect(max / 255).toBeLessThanOrEqual(0.94 + 1 / 255);
  });
});

describe('smokeTextureUrl', () => {
  it('resolves to null where there is no 2D canvas, rather than throwing', async () => {
    // jsdom has no canvas 2D: the caller falls back to the solid veil.
    expect(await smokeTextureUrl()).toBeNull();
  });
});
