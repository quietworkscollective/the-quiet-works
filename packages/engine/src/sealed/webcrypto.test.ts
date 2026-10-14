import { describe, expect, it } from 'vitest';
import { fromBase64, toBase64, toHex, utf8Decode, utf8Encode } from './webcrypto.ts';

describe('base64', () => {
  // RFC 4648 section 10.
  const VECTORS: readonly (readonly [string, string])[] = [
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg=='],
    ['fooba', 'Zm9vYmE='],
    ['foobar', 'Zm9vYmFy'],
  ];

  it.each(VECTORS)('encodes %j as %s and decodes it back', (plain, encoded) => {
    expect(toBase64(utf8Encode(plain))).toBe(encoded);
    expect(utf8Decode(fromBase64(encoded))).toBe(plain);
  });

  it('round-trips every byte value at every padding length', () => {
    const all = Uint8Array.from({ length: 256 }, (_, value) => value);
    for (let length = 0; length <= 7; length++) {
      const bytes = all.slice(250 - length);
      expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes));
    }
    expect(Array.from(fromBase64(toBase64(all)))).toEqual(Array.from(all));
  });

  it.each([
    ['a length that is not a multiple of four', 'Zg='],
    ['a character outside the alphabet', 'Zm9!'],
    ['url-safe characters', 'Zm9-'],
    ['whitespace', 'Zm9v\n'],
    ['padding in the middle', 'Zg==Zg=='],
    ['too much padding', 'Z==='],
  ])('rejects %s', (_label, text) => {
    expect(() => fromBase64(text)).toThrow();
  });

  it('rejects a non-canonical encoding whose spare bits are set', () => {
    // "Zg==" is the only encoding of "f"; "Zh==" decodes to the same byte with a stray bit set.
    expect(() => fromBase64('Zh==')).toThrow(/canonical/);
    expect(() => fromBase64('Zm9=')).toThrow(/canonical/);
  });
});

describe('hex and utf-8', () => {
  it('writes lowercase two-digit hex', () => {
    expect(toHex(Uint8Array.from([0, 1, 15, 16, 255]))).toBe('00010f10ff');
  });

  it('round-trips non-ASCII text and refuses bytes that are not UTF-8', () => {
    expect(utf8Decode(utf8Encode('café — \u{1f4ce}'))).toBe('café — \u{1f4ce}');
    expect(() => utf8Decode(Uint8Array.from([0xff, 0xfe]))).toThrow();
  });
});
