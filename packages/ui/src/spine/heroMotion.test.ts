import { BREATH_MAX, FADE_AT_COVERAGE, HELD_AMPLITUDE, HELD_MS, LETTERS, RELEASE_BY, letterStyle, releaseAt, visibilityAt } from './heroMotion.ts';

describe('the six letters', () => {
  it('are U N H E L D: one set of numbers each', () => {
    expect(LETTERS).toHaveLength(6);
  });

  it('breathe by no more than 2 px and 0.35 degrees, whatever the amplitude: the founder\'s limit', () => {
    expect(BREATH_MAX).toEqual({ y: 2, rotate: 0.35 });
    for (const [index, letter] of LETTERS.entries()) {
      expect(letter.breath.y, `letter ${index}`).toBeGreaterThan(0);
      expect(letter.breath.y, `letter ${index}`).toBeLessThanOrEqual(BREATH_MAX.y);
      expect(letter.breath.rotate, `letter ${index}`).toBeGreaterThan(0);
      expect(letter.breath.rotate, `letter ${index}`).toBeLessThanOrEqual(BREATH_MAX.rotate);
    }
  });

  it('breathe on periods of 9 to 13 seconds, no two the same: never in unison', () => {
    const periods = LETTERS.map((letter) => letter.breath.periodS);
    for (const period of periods) {
      expect(period).toBeGreaterThanOrEqual(9);
      expect(period).toBeLessThanOrEqual(13);
    }
    expect(new Set(periods).size).toBe(periods.length);
  });

  it('breathe by different amounts, so the word is not a single wave', () => {
    expect(new Set(LETTERS.map((letter) => letter.breath.y)).size).toBeGreaterThan(3);
    expect(new Set(LETTERS.map((letter) => letter.breath.rotate)).size).toBeGreaterThan(3);
  });

  it('take small, different rest offsets when released: letters no longer gripped, not a jumble', () => {
    for (const [index, { rest }] of LETTERS.entries()) {
      expect(Math.abs(rest.x), `x of ${index}`).toBeLessThanOrEqual(2);
      expect(Math.abs(rest.y), `y of ${index}`).toBeLessThanOrEqual(2);
      expect(Math.abs(rest.rotate), `rotation of ${index}`).toBeLessThanOrEqual(0.5);
    }
    expect(new Set(LETTERS.map((letter) => `${letter.rest.x},${letter.rest.y},${letter.rest.rotate}`)).size).toBe(LETTERS.length);
  });

  it('rise 6 to 18 px, each at its own rate, as the word is let go into the smoke', () => {
    for (const [index, letter] of LETTERS.entries()) {
      expect(letter.lift, `lift of ${index}`).toBeGreaterThanOrEqual(6);
      expect(letter.lift, `lift of ${index}`).toBeLessThanOrEqual(18);
    }
    expect(new Set(LETTERS.map((letter) => letter.lift)).size).toBe(LETTERS.length);
  });
});

describe('letterStyle', () => {
  it('writes the letter\'s own numbers as custom properties, with units', () => {
    expect(letterStyle(0)).toMatchObject({
      '--i': 0,
      '--lift': '10px',
      '--ox': '-0.8px',
      '--oy': '1.2px',
      '--or': '-0.25deg',
      '--by': '1.5px',
      '--br': '0.35deg',
      '--bp': '11s',
    });
  });

  it('starts each letter breathing a little after the last, from the end of its release', () => {
    const starts = LETTERS.map((_, index) => Number.parseFloat(String(letterStyle(index)['--bd'])));
    expect(starts[0]).toBe(2450);
    for (let i = 1; i < starts.length; i += 1) expect(starts[i]!).toBeGreaterThan(starts[i - 1]!);
  });

  it('gives an unknown letter only its index', () => {
    expect(letterStyle(9)).toEqual({ '--i': 9 });
  });
});

describe('the gather', () => {
  it('halves the breath for a moment and a half when the wordmark is touched', () => {
    expect(HELD_AMPLITUDE).toBe(0.5);
    expect(HELD_MS).toBe(1500);
  });
});

describe('releaseAt: the word let go as the visitor scrolls into the smoke', () => {
  it('is held at the top and fully released by the end of the first veil keyframe', () => {
    expect(RELEASE_BY).toBe(0.2);
    expect(releaseAt(0)).toBe(0);
    expect(releaseAt(RELEASE_BY)).toBe(1);
  });

  it('eases in and out, and is reversible: the same progress is always the same release', () => {
    expect(releaseAt(0.1)).toBeCloseTo(0.5, 5);
    expect(releaseAt(0.05)).toBeLessThan(0.25);
    expect(releaseAt(0.15)).toBeGreaterThan(0.75);
    expect(releaseAt(0.1)).toBe(releaseAt(0.1));
  });

  it('is monotonic and clamped, whatever the progress', () => {
    let last = -1;
    for (let p = -0.2; p <= 1.2; p += 0.01) {
      const value = releaseAt(p);
      expect(value).toBeGreaterThanOrEqual(last);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      last = value;
    }
  });
});

describe('visibilityAt: the letters fade with the smoke', () => {
  it('is fully visible with no smoke and gone before the veil is full', () => {
    expect(FADE_AT_COVERAGE).toBe(0.6);
    expect(visibilityAt(0)).toBe(1);
    expect(visibilityAt(FADE_AT_COVERAGE)).toBe(0);
    expect(visibilityAt(1)).toBe(0);
  });

  it('is in between in between, and never outside 0..1', () => {
    expect(visibilityAt(0.3)).toBeCloseTo(0.5, 5);
    expect(visibilityAt(-1)).toBe(1);
    expect(visibilityAt(5)).toBe(0);
  });
});
