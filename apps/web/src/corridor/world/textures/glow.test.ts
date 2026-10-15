import { describe, expect, it } from 'vitest';
import { windowBarPixels } from './glow.ts';

describe('the far window light mask', () => {
  it('keeps four separated bars at the window and fades them out down the floor', () => {
    const size = 128;
    const pixels = windowBarPixels(size);
    const value = (x: number, y: number): number => pixels[(y * size + x) * 4] ?? 0;
    const source = Array.from({ length: size }, (_, x) => value(x, size - 1));
    const foreground = Array.from({ length: size }, (_, x) => value(x, 0));
    const bright = source.filter((v) => v > 180).length;
    let bars = 0;
    let inBar = false;
    for (const pixel of source) {
      const next = pixel > 0;
      if (next && !inBar) bars += 1;
      inBar = next;
    }

    expect(bright).toBeGreaterThan(10);
    expect(bright).toBeLessThan(36);
    expect(bars).toBe(4);
    expect(source[0]).toBe(0);
    expect(source[size - 1]).toBe(0);
    expect(Math.max(...foreground)).toBe(0);
  });
});
