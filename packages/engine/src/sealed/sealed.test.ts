/**
 * Sealed content at runtime (ADR 0002). Fixtures are invented neutral text; no real plaintext or
 * token appears in this repository. Most tests seal with a low iteration count (the file records
 * it, and `openSealed` honours the record); one test pins the shipped default.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from './canonical.ts';
import { digestItem, openSealed, SEAL_ITERATIONS, type SealedEntry, type SealedFile, type SealedItem } from './index.ts';
import { sealItem } from './seal.ts';
import { fromBase64, IV_BYTES, SALT_BYTES, toBase64, utf8Encode } from './webcrypto.ts';

const FAST = 1_000;
const TOKEN = 'tok-alpha';
const ID = 'sample-note';

const ITEM: SealedItem = {
  id: ID,
  kind: 'memo',
  title: 'Sample title',
  from: 'Sample sender',
  body: ['Sample paragraph.', 'A second sample paragraph.'],
  label: 'Sample label',
  fields: { caption: 'Sample caption.' },
};

function fileOf(entries: Readonly<Record<string, SealedEntry>>, iterations = FAST): SealedFile {
  return { format: 1, chamber: 'sample-room', kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations }, items: entries };
}

async function sealed(item: SealedItem = ITEM, token = TOKEN, iterations = FAST): Promise<SealedFile> {
  return fileOf({ [item.id]: await sealItem(item, token, iterations) }, iterations);
}

function entryOf(file: SealedFile): SealedEntry {
  const entry = file.items[ID];
  if (entry === undefined) throw new Error('fixture has no entry');
  return entry;
}

function withEntry(file: SealedFile, patch: Partial<SealedEntry>): SealedFile {
  return fileOf({ [ID]: { ...entryOf(file), ...patch } }, file.kdf.iterations);
}

/** Changes one bit of one byte, so the base64 text stays canonical and only the value moves. */
function flipByte(encoded: string, index: number): string {
  const bytes = fromBase64(encoded);
  const at = index < 0 ? bytes.length + index : index;
  bytes[at] = (bytes[at] ?? 0) ^ 0x01;
  return toBase64(bytes);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openSealed', () => {
  it('round-trips an item exactly, and its digest matches the committed one', async () => {
    const file = await sealed();
    const opened = await openSealed(file, ID, TOKEN);
    expect(opened).toEqual(ITEM);
    expect(await digestItem(opened as SealedItem)).toBe(entryOf(file).digest);
    expect(entryOf(file).digest).toBe(await digestItem(ITEM));
  });

  it('returns only the fields the item had, with no undefined placeholders', async () => {
    const bare: SealedItem = { id: 'bare-line', kind: 'line', body: ['Sample paragraph.'] };
    const opened = await openSealed(await sealed(bare), 'bare-line', TOKEN);
    expect(opened).toStrictEqual(bare);
  });

  it('keeps text that is not ASCII intact', async () => {
    const item: SealedItem = { id: ID, kind: 'secret', body: ['Café — “quoted” \u{1f4ce}.'] };
    expect(await openSealed(await sealed(item), ID, TOKEN)).toEqual(item);
  });

  it('seals and opens at the shipped iteration count by default', async () => {
    const file = fileOf({ [ID]: await sealItem(ITEM, TOKEN) }, SEAL_ITERATIONS);
    expect(await openSealed(file, ID, TOKEN)).toEqual(ITEM);
  });

  it('derives the key with the iteration count the file records', async () => {
    const entry = await sealItem(ITEM, TOKEN, 2_000);
    expect(await openSealed(fileOf({ [ID]: entry }, 2_000), ID, TOKEN)).toEqual(ITEM);
    expect(await openSealed(fileOf({ [ID]: entry }, 1_000), ID, TOKEN)).toBeNull();
  });

  describe('resolves null, without throwing, for', () => {
    it.each(['tok-beta', 'TOK-ALPHA', 'tok-alpha ', ' tok-alpha', 'tok-alph', ''])('the wrong token %j', async (token) => {
      expect(await openSealed(await sealed(), ID, token)).toBeNull();
    });

    it.each(['missing-note', 'Sample-Note', 'sample-note ', '', 'constructor', 'toString', '__proto__', 'hasOwnProperty'])(
      'the unknown id %j',
      async (id) => {
        expect(await openSealed(await sealed(), id, TOKEN)).toBeNull();
      },
    );

    it('an entry moved under another id, which still authenticates', async () => {
      const entry = entryOf(await sealed());
      expect(await openSealed(fileOf({ 'other-note': entry }), 'other-note', TOKEN)).toBeNull();
    });

    it.each([
      ['salt', 0],
      ['salt', -1],
      ['iv', 0],
      ['iv', -1],
      ['data', 0],
      ['data', 7],
      ['data', -17],
      ['data', -1],
    ] as const)('one byte changed in %s (index %i)', async (field, index) => {
      const file = await sealed();
      const tampered = withEntry(file, { [field]: flipByte(entryOf(file)[field], index) });
      expect(await openSealed(tampered, ID, TOKEN)).toBeNull();
    });

    it('a base64 character changed where only unused padding bits differ', async () => {
      const file = await sealed();
      const { salt } = entryOf(file);
      const last = salt.indexOf('=') - 1;
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      const lookalike = alphabet.charAt(alphabet.indexOf(salt.charAt(last)) ^ 1);
      const forged = `${salt.slice(0, last)}${lookalike}${salt.slice(last + 1)}`;
      expect(fromBase64(salt).length).toBe(SALT_BYTES);
      expect(await openSealed(withEntry(file, { salt: forged }), ID, TOKEN)).toBeNull();
    });

    it('ciphertext that was truncated or extended', async () => {
      const file = await sealed();
      const data = fromBase64(entryOf(file).data);
      expect(await openSealed(withEntry(file, { data: toBase64(data.slice(0, -1)) }), ID, TOKEN)).toBeNull();
      expect(await openSealed(withEntry(file, { data: toBase64(data.slice(0, 8)) }), ID, TOKEN)).toBeNull();
      expect(await openSealed(withEntry(file, { data: toBase64(new Uint8Array([...data, 0])) }), ID, TOKEN)).toBeNull();
    });

    it.each([
      ['a salt of the wrong length', { salt: toBase64(new Uint8Array(SALT_BYTES + 1)) }],
      ['an iv of the wrong length', { iv: toBase64(new Uint8Array(IV_BYTES - 1)) }],
      ['text that is not base64', { data: 'not base64!' }],
      ['an empty field', { iv: '' }],
    ])('%s', async (_label, patch) => {
      expect(await openSealed(withEntry(await sealed(), patch), ID, TOKEN)).toBeNull();
    });

    it.each([
      ['an unknown format', { format: 2 }],
      ['zero iterations', { kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 0 } }],
      ['a fractional iteration count', { kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 1000.5 } }],
      ['an absurd iteration count', { kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 1e15 } }],
      ['another key derivation', { kdf: { name: 'scrypt', hash: 'SHA-256', iterations: FAST } }],
      ['no items', { items: null }],
      ['an entry that is not an object', { items: { [ID]: 'text' } }],
    ])('a damaged file: %s', async (_label, damage) => {
      const file = { ...(await sealed()), ...damage } as unknown as SealedFile;
      expect(await openSealed(file, ID, TOKEN)).toBeNull();
    });

    it('a context without WebCrypto', async () => {
      const file = await sealed();
      vi.stubGlobal('crypto', undefined);
      expect(await openSealed(file, ID, TOKEN)).toBeNull();
    });
  });
});

describe('sealItem', () => {
  it('draws a fresh 16-byte salt and 12-byte IV every time, so two sealings differ and both open', async () => {
    const first = await sealItem(ITEM, TOKEN, FAST);
    const second = await sealItem(ITEM, TOKEN, FAST);
    expect(fromBase64(first.salt)).toHaveLength(SALT_BYTES);
    expect(fromBase64(first.iv)).toHaveLength(IV_BYTES);
    expect(first.salt).not.toBe(second.salt);
    expect(first.iv).not.toBe(second.iv);
    expect(first.data).not.toBe(second.data);
    expect(first.digest).toBe(second.digest);
    expect(await openSealed(fileOf({ [ID]: first }), ID, TOKEN)).toEqual(ITEM);
    expect(await openSealed(fileOf({ [ID]: second }), ID, TOKEN)).toEqual(ITEM);
  });

  it('holds the ciphertext and tag only: nothing of the item or its token appears in the entry', async () => {
    const entry = await sealItem(ITEM, TOKEN, FAST);
    expect(Object.keys(entry).sort()).toEqual(['data', 'digest', 'iv', 'salt']);
    const published = JSON.stringify(entry);
    for (const secret of [TOKEN, 'Sample paragraph', 'Sample title', 'Sample sender', ID]) {
      expect(published).not.toContain(secret);
    }
    // 16 bytes of tag after the encrypted canonical JSON.
    expect(fromBase64(entry.data)).toHaveLength(utf8Encode(canonicalJson(ITEM)).length + 16);
  });

  it('refuses an empty token', async () => {
    await expect(sealItem(ITEM, '', FAST)).rejects.toThrow(/token/);
  });
});

describe('digestItem', () => {
  it('is the SHA-256 of the canonical JSON (known answers, computed outside this code)', async () => {
    // printf '%s' '{"body":["Sample paragraph."],"id":"sample-note","kind":"line"}' | shasum -a 256
    const bare: SealedItem = { kind: 'line', id: ID, body: ['Sample paragraph.'] };
    expect(await digestItem(bare)).toBe('b7613737b8fe2d2a778c70cd85e6b796740a72c61ca8bc1b289508f55e85eb17');

    // The same, over: {"body":["Sample paragraph.","Second \"quoted\" line"],"fields":{"alpha":"é",
    // "caption":"Sample caption."},"from":"Sample sender","id":"sample-note","kind":"memo",
    // "label":"Sample label","title":"Sample title"} (one line, UTF-8).
    const full: SealedItem = {
      title: 'Sample title',
      label: 'Sample label',
      from: 'Sample sender',
      fields: { caption: 'Sample caption.', alpha: 'é' },
      kind: 'memo',
      id: ID,
      body: ['Sample paragraph.', 'Second "quoted" line'],
    };
    expect(await digestItem(full)).toBe('1ac32f6201fa47f859b9e18906db18231c840f7c3d5b755eead169772e5894f5');
  });

  it('does not depend on the order keys were written in, at any depth', async () => {
    const one: SealedItem = { id: ID, kind: 'memo', body: ['Sample paragraph.'], fields: { a: 'x', b: 'y' } };
    const other = { fields: { b: 'y', a: 'x' }, body: ['Sample paragraph.'], kind: 'memo', id: ID } as SealedItem;
    expect(Object.keys(one)).not.toEqual(Object.keys(other));
    expect(await digestItem(one)).toBe(await digestItem(other));
  });

  it('changes when anything changes, including paragraph order', async () => {
    const base: SealedItem = { id: ID, kind: 'memo', body: ['One.', 'Two.'] };
    const digests = await Promise.all([
      digestItem(base),
      digestItem({ ...base, body: ['Two.', 'One.'] }),
      digestItem({ ...base, body: ['One.', 'Two!'] }),
      digestItem({ ...base, kind: 'secret' }),
      digestItem({ ...base, title: 'Sample title' }),
      digestItem({ ...base, id: 'other-note' }),
    ]);
    expect(new Set(digests).size).toBe(digests.length);
    for (const digest of digests) expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('canonicalJson', () => {
  it('sorts keys at every level, keeps array order and writes no whitespace', () => {
    expect(canonicalJson({ b: [{ z: 1, a: null }, 'x'], a: true })).toBe('{"a":true,"b":[{"a":null,"z":1},"x"]}');
  });

  it('leaves out keys whose value is undefined and refuses values JSON cannot hold', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(() => canonicalJson([undefined])).toThrow(TypeError);
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(TypeError);
    expect(() => canonicalJson(() => 1)).toThrow(TypeError);
  });
});
