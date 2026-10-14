import { describe, expect, it } from 'vitest';
import { DataUtils, HalfFloatType, LinearFilter, NoColorSpace } from 'three';
import { chroma, deltaE, hexToSrgb, luminance, type Rgb } from './colour.ts';
import { applyGrade, GRADE, gradeColour } from './grade.ts';
import { buildLutTable, createLutTexture, LUT_SIZE, sampleLutTable } from './lut.ts';
import { CORRIDOR_LOOK, LOOK_PROFILES } from './profiles.ts';
import { planFor } from './tier.ts';

/** A spread of display colours: greys, primaries, and the palette's own. */
const SAMPLES: readonly Rgb[] = [
  [0, 0, 0], [1, 1, 1], [0.5, 0.5, 0.5], [0.02, 0.02, 0.02], [0.1, 0.07, 0.05], [0.9, 0.6, 0.2],
  [0.2, 0.4, 0.45], [0.05, 0.1, 0.2], [0.7, 0.7, 0.9], hexToSrgb('#E6DCC7'), hexToSrgb('#3C7775'),
];

/** Colours the grade must leave alone at the corridor's default intensity (ΔE below). */
const ANCHORS: readonly (readonly [string, string])[] = [
  ['bone paper', '#E6DCC7'],
  ['warm bone', '#DDD5C8'],
  ['oxidised teal', '#3C7775'],
  ['office rim teal', '#5E8C8A'],
];
const ANCHOR_DELTA_E = 2;

describe('grading LUT: identity', () => {
  it('returns the input exactly at intensity 0', () => {
    for (const c of SAMPLES) expect(applyGrade(c, 0)).toEqual(c);
  });

  it('is its own lattice when built at strength 0', () => {
    const table = buildLutTable(LUT_SIZE, 0);
    const last = LUT_SIZE - 1;
    let i = 0;
    for (let b = 0; b < LUT_SIZE; b += 1) {
      for (let g = 0; g < LUT_SIZE; g += 1) {
        for (let r = 0; r < LUT_SIZE; r += 1) {
          expect(table[i++]).toBeCloseTo(r / last, 6);
          expect(table[i++]).toBeCloseTo(g / last, 6);
          expect(table[i++]).toBeCloseTo(b / last, 6);
          expect(table[i++]).toBe(1);
        }
      }
    }
  });

  it('samples to the input anywhere between lattice points when built at strength 0', () => {
    const table = buildLutTable(LUT_SIZE, 0);
    for (const c of SAMPLES) {
      const out = sampleLutTable(table, LUT_SIZE, c);
      for (let i = 0; i < 3; i += 1) expect(out[i]).toBeCloseTo(c[i]!, 6);
    }
  });

  it('is 16 cubed RGBA, with the grade at full strength in the default table', () => {
    const table = buildLutTable();
    expect(LUT_SIZE).toBe(16);
    expect(table).toHaveLength(16 * 16 * 16 * 4);
    // The table's black entry is the grade's black, not black.
    expect(table[2]).toBeGreaterThan(0);
  });
});

describe('grading LUT: texture', () => {
  it('is a 16 cubed half-float 3D texture, filtered linearly, with no colour space', () => {
    const texture = createLutTexture();
    expect(texture.image.width).toBe(16);
    expect(texture.image.height).toBe(16);
    expect(texture.image.depth).toBe(16);
    expect(texture.type).toBe(HalfFloatType);
    expect(texture.minFilter).toBe(LinearFilter);
    expect(texture.magFilter).toBe(LinearFilter);
    expect(texture.colorSpace).toBe(NoColorSpace);
    expect(texture.generateMipmaps).toBe(false);
    texture.dispose();
  });

  it('stores the table to half-float precision, and the identity table to within a quarter level', () => {
    const table = buildLutTable();
    const texture = createLutTexture();
    const data = texture.image.data as Uint16Array;
    let worst = 0;
    for (let i = 0; i < table.length; i += 1) worst = Math.max(worst, Math.abs(DataUtils.fromHalfFloat(data[i]!) - table[i]!));
    expect(worst).toBeLessThan(1 / 1024);
    texture.dispose();

    const neutral = createLutTexture(LUT_SIZE, 0);
    const identity = neutral.image.data as Uint16Array;
    const last = LUT_SIZE - 1;
    let off = 0;
    for (let i = 0; i < identity.length; i += 4) {
      const lattice = (i / 4) % LUT_SIZE;
      off = Math.max(off, Math.abs(DataUtils.fromHalfFloat(identity[i]!) - lattice / last));
    }
    expect(off).toBeLessThan(0.25 / 255);
    neutral.dispose();
  });
});

describe('grading LUT: behaviour', () => {
  it('is monotonic in every channel, through the table as a GPU samples it', () => {
    const table = buildLutTable();
    const levels = [0, 0.1, 0.25, 0.5, 0.75, 1];
    const steps = 400;
    for (let channel = 0; channel < 3; channel += 1) {
      for (const a of levels) {
        for (const b of levels) {
          let previous = -Infinity;
          for (let s = 0; s <= steps; s += 1) {
            const t = s / steps;
            const c: [number, number, number] = [0, 0, 0];
            c[channel] = t;
            c[(channel + 1) % 3] = a;
            c[(channel + 2) % 3] = b;
            const out = sampleLutTable(table, LUT_SIZE, c)[channel]!;
            expect(out, `channel ${channel} at ${c.join(',')}`).toBeGreaterThanOrEqual(previous - 1e-9);
            previous = out;
          }
        }
      }
    }
  });

  it('preserves bone paper and the Office teal at the corridor profile intensity', () => {
    const table = buildLutTable();
    const intensity = CORRIDOR_LOOK.lut.intensity;
    for (const [name, hex] of ANCHORS) {
      const c = hexToSrgb(hex);
      const lut = sampleLutTable(table, LUT_SIZE, c);
      const graded: Rgb = [c[0] + (lut[0] - c[0]) * intensity, c[1] + (lut[1] - c[1]) * intensity, c[2] + (lut[2] - c[2]) * intensity];
      expect(deltaE(c, graded), `${name} ${hex}`).toBeLessThan(ANCHOR_DELTA_E);
    }
  });

  it('holds the anchors at every profile intensity', () => {
    for (const profile of Object.values(LOOK_PROFILES)) {
      for (const [name, hex] of ANCHORS) {
        const c = hexToSrgb(hex);
        expect(deltaE(c, applyGrade(c, profile.lut.intensity)), `${profile.space} ${name}`).toBeLessThan(ANCHOR_DELTA_E);
      }
    }
  });

  it('holds the anchors at the phone’s stronger grade too', () => {
    for (const profile of Object.values(LOOK_PROFILES)) {
      const intensity = planFor('mobile', profile, { reducedMotion: false }).lutIntensity;
      for (const [name, hex] of ANCHORS) {
        const c = hexToSrgb(hex);
        expect(deltaE(c, applyGrade(c, intensity)), `${profile.space} ${name} at ${intensity}`).toBeLessThan(ANCHOR_DELTA_E);
      }
    }
  });

  it('leaves everything at or above a luma of 0.4 exactly as it is, so lit colours are not pushed toward orange', () => {
    // A fixed line, not GRADE.shadow.to: moving the knee up into the lit colours must fail here.
    const lit = SAMPLES.filter((c) => luminance(c) >= 0.4);
    expect(lit.length, 'the samples include lit colours').toBeGreaterThanOrEqual(4);
    for (const c of lit) expect(gradeColour(c)).toEqual(c);
    expect(gradeColour([0.5, 0.5, 0.5])).toEqual([0.5, 0.5, 0.5]);
    expect(GRADE.shadow.to).toBeLessThanOrEqual(0.4);
  });

  it('lifts a dark neutral into a warm dark, strongly at full strength and visibly at the default', () => {
    const shadow: Rgb = [0.06, 0.06, 0.06];
    const full = gradeColour(shadow);
    expect(luminance(full), 'lifted').toBeGreaterThan(luminance(shadow) + 0.05);
    expect(full[0], 'warm: red leads').toBeGreaterThan(full[1]);
    expect(full[1]).toBeGreaterThan(full[2]);
    const shown = deltaE(shadow, applyGrade(shadow, CORRIDOR_LOOK.lut.intensity));
    expect(shown).toBeGreaterThan(1);
    expect(shown, 'gentle, not a recolour').toBeLessThan(6);
  });

  it('never drains a shadow: dark colours keep at least the colour they had', () => {
    const steps = 10;
    for (let r = 0; r <= steps; r += 1) {
      for (let g = 0; g <= steps; g += 1) {
        for (let b = 0; b <= steps; b += 1) {
          const c: Rgb = [(r / steps) * 0.4, (g / steps) * 0.4, (b / steps) * 0.4];
          if (luminance(c) > 0.2) continue;
          expect(chroma(gradeColour(c)), c.join(',')).toBeGreaterThanOrEqual(chroma(c) - 1.5);
        }
      }
    }
  });

  it('draws black as a warm dark brown that clears the crushed-black line at the default intensity', () => {
    const black = gradeColour([0, 0, 0]);
    expect(black[0]).toBeGreaterThan(black[1]);
    expect(black[1]).toBeGreaterThan(black[2]);
    expect(black[2]).toBeGreaterThan(0);
    for (const profile of Object.values(LOOK_PROFILES)) {
      const shown = applyGrade([0, 0, 0], profile.lut.intensity);
      expect(luminance(shown), profile.space).toBeGreaterThanOrEqual(profile.atmosphere.darkness.crushedBelow);
    }
  });

  it('never turns a warm colour cool: red never falls below blue where it started at or above it', () => {
    const steps = 12;
    for (let r = 0; r <= steps; r += 1) {
      for (let g = 0; g <= steps; g += 1) {
        for (let b = 0; b <= r; b += 1) {
          const c: Rgb = [r / steps, g / steps, b / steps];
          const out = gradeColour(c);
          expect(out[0], `${c.join(',')}`).toBeGreaterThanOrEqual(out[2]);
        }
      }
    }
  });

  it('keeps every graded channel inside [0, 1]', () => {
    const table = buildLutTable();
    for (const v of table) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
