import { describe, expect, it } from 'vitest';
import { digestItem, openSealed, SEAL_ITERATIONS, type SealedFile } from './index.ts';
import { checkChamber, sealChamber, serializeSealedFile } from './seal.ts';
import type { SealSource } from './source.ts';
import { fromBase64, toBase64 } from './webcrypto.ts';

const FAST = { iterations: 1_000 };
const CHAMBER = 'sample-room';

function source(id: string, token: string, paragraph = `Sample paragraph for ${id}.`): SealSource {
  return { item: { id, kind: 'secret', body: [paragraph] }, token };
}

const A = source('alpha-note', 'tok-a');
const B = source('beta-note', 'tok-b');
const C = source('gamma-note', 'tok-c');

async function seal(sources: readonly SealSource[], previous?: SealedFile) {
  return sealChamber(CHAMBER, sources, { ...FAST, previous });
}

function entryOf(file: SealedFile, id: string) {
  const entry = file.items[id];
  if (entry === undefined) throw new Error(`no entry for ${id}`);
  return entry;
}

function flipDataByte(file: SealedFile, id: string): SealedFile {
  const entry = entryOf(file, id);
  const data = fromBase64(entry.data);
  data[0] = (data[0] ?? 0) ^ 0x01;
  return { ...file, items: { ...file.items, [id]: { ...entry, data: toBase64(data) } } };
}

describe('sealChamber', () => {
  it('orders items by id whatever order they were given in, and records the key derivation', async () => {
    const { file } = await seal([C, A, B]);
    expect(Object.keys(file.items)).toEqual(['alpha-note', 'beta-note', 'gamma-note']);
    expect(file).toMatchObject({ format: 1, chamber: CHAMBER, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 1_000 } });
    const text = serializeSealedFile(file);
    expect(text.indexOf('alpha-note')).toBeLessThan(text.indexOf('beta-note'));
    expect(text.indexOf('beta-note')).toBeLessThan(text.indexOf('gamma-note'));
  });

  it('seals at the shipped iteration count unless told otherwise', async () => {
    const { file } = await sealChamber(CHAMBER, [A]);
    expect(file.kdf.iterations).toBe(SEAL_ITERATIONS);
    expect(await openSealed(file, 'alpha-note', 'tok-a')).toEqual(A.item);
  });

  it('opens every item with its own token and no other', async () => {
    const { file, sealed, kept } = await seal([A, B]);
    expect(sealed).toEqual(['alpha-note', 'beta-note']);
    expect(kept).toEqual([]);
    expect(await openSealed(file, 'alpha-note', 'tok-a')).toEqual(A.item);
    expect(await openSealed(file, 'beta-note', 'tok-b')).toEqual(B.item);
    expect(await openSealed(file, 'alpha-note', 'tok-b')).toBeNull();
    expect(entryOf(file, 'alpha-note').digest).toBe(await digestItem(A.item));
  });

  it('rewrites the same bytes when nothing changed', async () => {
    const first = await seal([A, B]);
    const again = await seal([B, A], first.file);
    expect(again.kept).toEqual(['alpha-note', 'beta-note']);
    expect(again.sealed).toEqual([]);
    expect(serializeSealedFile(again.file)).toBe(serializeSealedFile(first.file));
  });

  it('reseals only the item that changed, and the rest keep their exact entries', async () => {
    const first = await seal([A, B, C]);
    const edited = source('beta-note', 'tok-b', 'An edited sample paragraph.');
    const next = await seal([A, edited, C], first.file);
    expect(next.sealed).toEqual(['beta-note']);
    expect(next.kept).toEqual(['alpha-note', 'gamma-note']);
    expect(entryOf(next.file, 'alpha-note')).toEqual(entryOf(first.file, 'alpha-note'));
    expect(entryOf(next.file, 'gamma-note')).toEqual(entryOf(first.file, 'gamma-note'));
    expect(entryOf(next.file, 'beta-note')).not.toEqual(entryOf(first.file, 'beta-note'));
    expect(await openSealed(next.file, 'beta-note', 'tok-b')).toEqual(edited.item);
  });

  it('adds new items beside the kept ones and drops items no longer in the private repository', async () => {
    const first = await seal([A, B]);
    const next = await seal([B, C], first.file);
    expect(Object.keys(next.file.items)).toEqual(['beta-note', 'gamma-note']);
    expect(next.kept).toEqual(['beta-note']);
    expect(next.sealed).toEqual(['gamma-note']);
  });

  it('reseals an item whose token changed, under the new token only', async () => {
    const first = await seal([A]);
    const retoken = await seal([{ item: A.item, token: 'tok-new' }], first.file);
    expect(retoken.sealed).toEqual(['alpha-note']);
    expect(await openSealed(retoken.file, 'alpha-note', 'tok-new')).toEqual(A.item);
    expect(await openSealed(retoken.file, 'alpha-note', 'tok-a')).toBeNull();
  });

  it('reseals everything when the iteration count or the chamber differs from the previous file', async () => {
    const first = await seal([A, B]);
    const slower = await sealChamber(CHAMBER, [A, B], { iterations: 2_000, previous: first.file });
    expect(slower.sealed).toEqual(['alpha-note', 'beta-note']);
    expect(slower.file.kdf.iterations).toBe(2_000);
    const elsewhere = await sealChamber('other-room', [A, B], { ...FAST, previous: first.file });
    expect(elsewhere.sealed).toEqual(['alpha-note', 'beta-note']);
    expect(elsewhere.file.chamber).toBe('other-room');
  });

  it('does not carry over a committed entry that no longer opens, even if its digest still matches', async () => {
    const first = await seal([A, B]);
    const damaged = flipDataByte(first.file, 'alpha-note');
    const next = await seal([A, B], damaged);
    expect(next.sealed).toEqual(['alpha-note']);
    expect(next.kept).toEqual(['beta-note']);
    expect(await openSealed(next.file, 'alpha-note', 'tok-a')).toEqual(A.item);
  });

  it('refuses an id used twice', async () => {
    await expect(seal([A, { item: { ...A.item, body: ['Another.'] }, token: 'tok-z' }])).rejects.toThrow(/alpha-note.*twice/);
  });

  it('serializes as two-space JSON with a final newline, holding no token and no plaintext', async () => {
    const { file } = await seal([A, B]);
    const text = serializeSealedFile(file);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "format": 1,');
    expect(JSON.parse(text)).toEqual(file);
    for (const secret of ['tok-a', 'tok-b', 'Sample paragraph', 'secret']) expect(text).not.toContain(secret);
  });
});

describe('checkChamber', () => {
  it('reports nothing when every item opens with its token and matches its digest', async () => {
    const { file } = await seal([A, B]);
    expect(await checkChamber(CHAMBER, [A, B], file)).toEqual([]);
  });

  it('flags an entry with one altered byte, naming the id and not the content', async () => {
    const { file } = await seal([A, B]);
    const problems = await checkChamber(CHAMBER, [A, B], flipDataByte(file, 'beta-note'));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(`${CHAMBER}/beta-note`);
    expect(problems[0]).toMatch(/does not open/);
    expect(problems.join('\n')).not.toContain('Sample paragraph');
  });

  it('flags a token that no longer opens its entry', async () => {
    const { file } = await seal([A]);
    const problems = await checkChamber(CHAMBER, [{ item: A.item, token: 'tok-new' }], file);
    expect(problems).toEqual([expect.stringMatching(/alpha-note: does not open/)]);
  });

  it('flags a committed digest that does not match the item it opens to', async () => {
    const { file } = await seal([A]);
    const forged: SealedFile = {
      ...file,
      items: { 'alpha-note': { ...entryOf(file, 'alpha-note'), digest: 'f'.repeat(64) } },
    };
    expect(await checkChamber(CHAMBER, [A], forged)).toEqual([expect.stringMatching(/alpha-note: the opened item does not match/)]);
  });

  it('flags an item that changed after it was sealed', async () => {
    const { file } = await seal([A]);
    const edited = source('alpha-note', 'tok-a', 'An edited sample paragraph.');
    expect(await checkChamber(CHAMBER, [edited], file)).toEqual([expect.stringMatching(/alpha-note: the private item changed/)]);
  });

  it('flags an item that was never sealed, and an entry with no source', async () => {
    const { file } = await seal([A, B]);
    const problems = await checkChamber(CHAMBER, [B, C], file);
    expect(problems).toEqual([
      expect.stringMatching(/gamma-note: not sealed yet/),
      expect.stringMatching(/alpha-note: sealed here but absent/),
    ]);
  });

  it('flags a file that belongs to another chamber', async () => {
    const { file } = await sealChamber('other-room', [A], FAST);
    expect(await checkChamber(CHAMBER, [A], file)).toEqual([expect.stringMatching(/belongs to chamber "other-room"/)]);
  });
});
