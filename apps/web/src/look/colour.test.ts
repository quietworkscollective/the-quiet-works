import { describe, expect, it } from 'vitest';
import { kelvinToLinear as corridorKelvin } from '../corridor/world/colour.ts';
import { chroma, deltaE, hexToSrgb, kelvinToLinear, linearToSrgb, luminance, srgbToLab, srgbToLinear } from './colour.ts';

describe('look colour arithmetic', () => {
  it('round-trips sRGB through linear light', () => {
    for (const v of [0, 0.002, 0.04, 0.18, 0.5, 0.9, 1]) expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 9);
  });

  it('reads #rrggbb and refuses anything else', () => {
    expect(hexToSrgb('#E6DCC7')).toEqual([0xe6 / 255, 0xdc / 255, 0xc7 / 255]);
    expect(() => hexToSrgb('E6DCC7')).toThrow();
    expect(() => hexToSrgb('#fff')).toThrow();
  });

  it('puts white at L* 100 and black at L* 0, with no chroma on the grey axis', () => {
    expect(srgbToLab([1, 1, 1])[0]).toBeCloseTo(100, 1);
    expect(srgbToLab([0, 0, 0])[0]).toBeCloseTo(0, 6);
    expect(chroma([0.5, 0.5, 0.5])).toBeLessThan(0.05);
  });

  it('measures a colour difference of zero against itself and about one for one visible step', () => {
    expect(deltaE([0.4, 0.5, 0.6], [0.4, 0.5, 0.6])).toBe(0);
    expect(deltaE([0.5, 0.5, 0.5], [0.5 + 1 / 255, 0.5, 0.5])).toBeGreaterThan(0.2);
    expect(deltaE([0.5, 0.5, 0.5], [0.5 + 1 / 255, 0.5, 0.5])).toBeLessThan(1);
  });

  it('counts a change of lightness alone as a difference, and a bigger change as a bigger one', () => {
    const small = deltaE([0.2, 0.2, 0.2], [0.25, 0.25, 0.25]);
    const large = deltaE([0.2, 0.2, 0.2], [0.5, 0.5, 0.5]);
    expect(small).toBeGreaterThan(3);
    expect(large).toBeGreaterThan(small * 2);
  });

  it('weights luminance by the Rec. 709 primaries', () => {
    expect(luminance([1, 1, 1])).toBeCloseTo(1, 4);
    expect(luminance([0, 1, 0])).toBeGreaterThan(luminance([1, 0, 0]));
  });

  it('turns colour temperature into the same linear colour the corridor lamps use', () => {
    // If the corridor's fit ever changes, a kelvin number in a look profile would quietly mean a
    // different colour in the environment than it does on the lamps. This fails first.
    for (const k of [2700, 2900, 3000, 3200, 4300, 6500]) {
      const ours = kelvinToLinear(k);
      const theirs = corridorKelvin(k);
      for (let i = 0; i < 3; i += 1) expect(ours[i]).toBeCloseTo(theirs[i]!, 9);
    }
  });

  it('makes lower temperatures warmer: more red against blue', () => {
    const ratio = (k: number): number => kelvinToLinear(k)[0] / kelvinToLinear(k)[2];
    expect(ratio(2800)).toBeGreaterThan(ratio(3200));
    expect(ratio(3200)).toBeGreaterThan(ratio(6500));
  });
});
