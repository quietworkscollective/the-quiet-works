import { describe, expect, it } from 'vitest';
import { openSealed, type SealedItem } from './index.ts';
import { sealChamber } from './seal.ts';
import { parseEntry, parseItem, parseKdf, parseSealedFile, parseSource } from './source.ts';
import { toBase64 } from './webcrypto.ts';

const FULL = {
  id: 'sample-note',
  kind: 'memo',
  title: 'Sample title',
  from: 'Sample sender',
  body: ['Sample paragraph.', 'A second sample paragraph.'],
  label: 'Sample label',
  fields: { caption: 'Sample caption.', plate_text: 'Sample plate.' },
};

describe('parseItem', () => {
  it('accepts a full item and a minimal one, and returns only the fields present', () => {
    expect(parseItem(FULL)).toStrictEqual(FULL);
    expect(parseItem({ id: 'bare-line', kind: 'line', body: ['Sample paragraph.'] })).toStrictEqual({
      id: 'bare-line',
      kind: 'line',
      body: ['Sample paragraph.'],
    });
  });

  it.each(['memo', 'secret', 'payoff', 'line'])('accepts the kind %s', (kind) => {
    expect(parseItem({ ...FULL, kind }).kind).toBe(kind);
  });

  it.each([
    ['a non-object', 'text'],
    ['an array', []],
    ['null', null],
    ['an unknown field (a misspelt one is not dropped silently)', { ...FULL, bodies: ['Sample paragraph.'] }],
    ['a missing id', { ...FULL, id: undefined }],
    ['an id with capitals', { ...FULL, id: 'Sample-note' }],
    ['an id that starts with a digit', { ...FULL, id: '1-note' }],
    ['an id with an underscore', { ...FULL, id: 'sample_note' }],
    ['an id with a doubled hyphen', { ...FULL, id: 'sample--note' }],
    ['an id with a trailing hyphen', { ...FULL, id: 'sample-' }],
    ['an unknown kind', { ...FULL, kind: 'rumour' }],
    ['a missing body', { ...FULL, body: undefined }],
    ['a body that is a string', { ...FULL, body: 'Sample paragraph.' }],
    ['an empty body', { ...FULL, body: [] }],
    ['an empty paragraph', { ...FULL, body: ['Sample paragraph.', '  '] }],
    ['a paragraph that is not text', { ...FULL, body: ['Sample paragraph.', 7] }],
    ['an empty title', { ...FULL, title: '' }],
    ['a title that is not text', { ...FULL, title: 7 }],
    ['fields that are not an object', { ...FULL, fields: ['Sample caption.'] }],
    ['a field value that is not text', { ...FULL, fields: { caption: 7 } }],
    ['a field name that is not plain', { ...FULL, fields: { 'two words': 'Sample caption.' } }],
    ['a field named like a prototype', JSON.parse('{"id":"a","kind":"line","body":["x"],"fields":{"__proto__":"x"}}')],
  ])('rejects %s', (_label, value) => {
    expect(() => parseItem(value)).toThrow();
  });

  it('names the offending field in its message and never echoes a value', () => {
    const marker = 'PRIVATE-MARKER';
    const attempts: unknown[] = [
      { ...FULL, kind: marker },
      { ...FULL, id: marker },
      { ...FULL, body: ['Sample paragraph.', 7, marker] },
      { ...FULL, title: 7, from: marker },
      { ...FULL, fields: { caption: 7, other: marker } },
    ];
    for (const attempt of attempts) {
      let message = '';
      try {
        parseItem(attempt, 'notes/a.json');
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/^notes\/a\.json\.\w+/);
      expect(message).not.toContain(marker);
    }
  });
});

describe('parseSource', () => {
  it('splits the discovery token from the item, which never carries it', () => {
    const { item, token } = parseSource({ ...FULL, token: 'tok-alpha' }, 'notes/a.json');
    expect(token).toBe('tok-alpha');
    expect(item).toStrictEqual(FULL);
    expect(Object.keys(item)).not.toContain('token');
  });

  it.each([
    ['no token', FULL],
    ['an empty token', { ...FULL, token: '' }],
    ['a token that is not text', { ...FULL, token: 7 }],
  ])('rejects %s', (_label, value) => {
    expect(() => parseSource(value, 'notes/a.json')).toThrow(/notes\/a\.json\.token/);
  });
});

describe('parseKdf', () => {
  it('returns the iteration count of PBKDF2 with SHA-256', () => {
    expect(parseKdf({ name: 'PBKDF2', hash: 'SHA-256', iterations: 100_000 })).toBe(100_000);
  });

  it.each([
    { name: 'PBKDF2', hash: 'SHA-1', iterations: 1000 },
    { name: 'scrypt', hash: 'SHA-256', iterations: 1000 },
    { name: 'PBKDF2', hash: 'SHA-256', iterations: 0 },
    { name: 'PBKDF2', hash: 'SHA-256', iterations: 1.5 },
    { name: 'PBKDF2', hash: 'SHA-256', iterations: '1000' },
    { name: 'PBKDF2', hash: 'SHA-256', iterations: 10_000_001 },
    { name: 'PBKDF2', hash: 'SHA-256', iterations: 1000, salt: 'x' },
    null,
  ])('rejects %j', (value) => {
    expect(() => parseKdf(value)).toThrow();
  });
});

describe('parseEntry', () => {
  const GOOD = {
    salt: toBase64(new Uint8Array(16)),
    iv: toBase64(new Uint8Array(12)),
    data: toBase64(new Uint8Array(40)),
    digest: 'a'.repeat(64),
  };

  it('accepts an entry of the right shape', () => {
    expect(parseEntry(GOOD)).toStrictEqual(GOOD);
  });

  it.each([
    ['a short salt', { salt: toBase64(new Uint8Array(15)) }],
    ['a long iv', { iv: toBase64(new Uint8Array(13)) }],
    ['data no longer than the tag', { data: toBase64(new Uint8Array(16)) }],
    ['a digest in capitals', { digest: 'A'.repeat(64) }],
    ['a short digest', { digest: 'a'.repeat(63) }],
    ['non-canonical base64', { salt: 'AAAAAAAAAAAAAAAAAAAAAB==' }],
    ['an extra field', { hint: 'x' }],
  ])('rejects %s', (_label, patch) => {
    expect(() => parseEntry({ ...GOOD, ...patch })).toThrow();
  });
});

describe('parseSealedFile', () => {
  it('reads what the sealer wrote, and the result still opens', async () => {
    const item: SealedItem = { id: 'sample-note', kind: 'line', body: ['Sample paragraph.'] };
    const { file } = await sealChamber('sample-room', [{ item, token: 'tok-alpha' }], { iterations: 1_000 });
    const parsed = parseSealedFile(JSON.parse(JSON.stringify(file)));
    expect(parsed).toStrictEqual(file);
    expect(await openSealed(parsed, 'sample-note', 'tok-alpha')).toEqual(item);
  });

  const entry = {
    salt: toBase64(new Uint8Array(16)),
    iv: toBase64(new Uint8Array(12)),
    data: toBase64(new Uint8Array(40)),
    digest: 'a'.repeat(64),
  };
  const kdf = { name: 'PBKDF2', hash: 'SHA-256', iterations: 1000 };
  const good = { format: 1, chamber: 'sample-room', kdf, items: { 'sample-note': entry } };

  it.each([
    ['another format', { ...good, format: 2 }],
    ['no chamber', { ...good, chamber: undefined }],
    ['a bad kdf', { ...good, kdf: { ...kdf, iterations: 0 } }],
    ['items that are not an object', { ...good, items: [] }],
    ['an id that is not valid', { ...good, items: { 'Sample Note': entry } }],
    ['a damaged entry', { ...good, items: { 'sample-note': { ...entry, salt: 'AA==' } } }],
    ['an extra top-level field', { ...good, note: 'x' }],
  ])('rejects %s', (_label, value) => {
    expect(() => parseSealedFile(value)).toThrow();
  });
});
