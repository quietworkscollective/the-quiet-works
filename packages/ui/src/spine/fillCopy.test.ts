import { fillCopy } from './fillCopy.ts';

describe('fillCopy', () => {
  it('fills each named placeholder from the values, numbers and strings alike', () => {
    expect(fillCopy('{found} of {total} papers found.', { found: 3, total: 7 })).toBe('3 of 7 papers found.');
    expect(fillCopy('{n} doors open', { n: 'Two' })).toBe('Two doors open');
  });

  it('fills a placeholder every time it appears', () => {
    expect(fillCopy('{n} and {n}', { n: 1 })).toBe('1 and 1');
  });

  it('writes a zero as 0, not as nothing', () => {
    expect(fillCopy('{n} found', { n: 0 })).toBe('0 found');
  });

  it('leaves a placeholder it has no value for exactly as written, so a gap is visible', () => {
    expect(fillCopy('{found} of {total}', { found: 1 })).toBe('1 of {total}');
  });

  it('returns text without placeholders unchanged', () => {
    expect(fillCopy('Sealed', { n: 1 })).toBe('Sealed');
  });
});
