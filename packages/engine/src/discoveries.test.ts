import { describe, expect, it, vi } from 'vitest';
import { CHAMBERS, type ChamberId } from './chambers.ts';
import {
  createDiscoveryStore,
  DISCOVERY_STORAGE_KEY,
  type Finding,
  type StorageLike,
} from './discoveries.ts';

const OFFICE: ChamberId = 'certification-office';
const SEALED: ChamberId = 'apartment';
const OFFICE_TOTALS = CHAMBERS.find((c) => c.id === OFFICE)!.findings;

const memo = (n: number): Finding => ({ id: `memo-${String(n).padStart(3, '0')}`, kind: 'memo' });
const secret = (n: number): Finding => ({ id: `secret-${n}`, kind: 'secret' });

/** What a browser throws from setItem when the quota is spent. */
class DOMExceptionLike extends Error {
  constructor(name: string) {
    super(name);
    this.name = name;
  }
}

/** In-memory storage that records every call and can be told to refuse. */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const reads: string[] = [];
  const writes: { key: string; value: string }[] = [];
  const removes: string[] = [];
  const storage = {
    data,
    reads,
    writes,
    removes,
    failReads: false,
    failWrites: false,
    failRemoves: false,
    getItem(key: string): string | null {
      reads.push(key);
      if (storage.failReads) throw new Error('storage blocked');
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      if (storage.failWrites) throw new DOMExceptionLike('QuotaExceededError');
      writes.push({ key, value });
      data.set(key, value);
    },
    removeItem(key: string): void {
      if (storage.failRemoves) throw new Error('storage blocked');
      removes.push(key);
      data.delete(key);
    },
  };
  return storage;
}

/** A document as a visitor's file or the storage key would hold it. */
function documentOf(found: Record<string, unknown>, recognitions: unknown = []): string {
  return JSON.stringify({ version: 1, found, recognitions });
}

const VALID = documentOf({ [OFFICE]: [memo(1), secret(1)] });

describe('a fresh store', () => {
  it('starts empty, with a count for the one open chamber and none for sealed ones', () => {
    const store = createDiscoveryStore(memoryStorage());
    expect(store.getState()).toEqual({ version: 1, found: {}, recognitions: [] });
    expect(store.counts()).toEqual([
      {
        chamber: OFFICE,
        papers: { found: 0, total: OFFICE_TOTALS.papers },
        secrets: { found: 0, total: OFFICE_TOTALS.secrets },
      },
    ]);
  });

  it('awards no recognitions yet, however much is found', () => {
    const store = createDiscoveryStore(null);
    for (let n = 1; n <= OFFICE_TOTALS.papers; n += 1) store.record(OFFICE, memo(n));
    for (let n = 1; n <= OFFICE_TOTALS.secrets; n += 1) store.record(OFFICE, secret(n));
    expect(store.getState().recognitions).toEqual([]);
  });

  it('hands out a frozen state, so a consumer cannot change it behind the store', () => {
    const store = createDiscoveryStore(null);
    store.record(OFFICE, memo(1));
    const state = store.getState();
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.found)).toBe(true);
    expect(Object.isFrozen(state.found[OFFICE])).toBe(true);
    expect(Object.isFrozen(state.recognitions)).toBe(true);
  });
});

describe('recording findings', () => {
  it('touches nothing until the first record: not creating, reading, exporting, a rejected import or subscribing', () => {
    const storage = memoryStorage();
    const store = createDiscoveryStore(storage);
    store.subscribe(() => {});
    store.getState();
    store.has(OFFICE, 'memo-001');
    store.counts();
    store.exportText();
    expect(store.importText('not json')).toBe(false);
    expect(store.importText(documentOf({ nowhere: [] }))).toBe(false);
    expect(storage.writes).toEqual([]);
    expect(storage.removes).toEqual([]);
    expect(storage.data.size).toBe(0);
  });

  it('writes the key on the first record, and only that key from then on', () => {
    const storage = memoryStorage();
    const store = createDiscoveryStore(storage);
    store.record(OFFICE, memo(1));
    expect(storage.writes.map((w) => w.key)).toEqual([DISCOVERY_STORAGE_KEY]);
    store.record(OFFICE, secret(1));
    store.record(SEALED, memo(2));
    expect(storage.writes.every((w) => w.key === DISCOVERY_STORAGE_KEY)).toBe(true);
    expect([...storage.data.keys()]).toEqual([DISCOVERY_STORAGE_KEY]);
  });

  it('stores the versioned document and nothing more: no timestamps, no content, no tokens', () => {
    const storage = memoryStorage();
    const store = createDiscoveryStore(storage);
    // A caller that hands over a whole sealed item still leaves only its id and kind behind.
    store.record(OFFICE, { id: 'duck-requisition', kind: 'secret', body: ['plaintext'], token: 'abc' } as Finding);
    store.record(OFFICE, memo(1));
    const stored = storage.data.get(DISCOVERY_STORAGE_KEY)!;
    expect(JSON.parse(stored)).toEqual({
      version: 1,
      found: {
        [OFFICE]: [
          { id: 'duck-requisition', kind: 'secret' },
          { id: 'memo-001', kind: 'memo' },
        ],
      },
      recognitions: [],
    });
    expect(stored).not.toMatch(/plaintext|token/);
  });

  it('writes chambers in corridor order, whichever one was found in first', () => {
    const storage = memoryStorage();
    const store = createDiscoveryStore(storage);
    store.record(SEALED, memo(1));
    store.record(OFFICE, memo(1));
    const order = CHAMBERS.map((c) => c.id).filter((id) => id === OFFICE || id === SEALED);
    expect(Object.keys(JSON.parse(storage.data.get(DISCOVERY_STORAGE_KEY)!).found)).toEqual(order);
  });

  it('records the same finding once, in storage and in subscribers', () => {
    const storage = memoryStorage();
    const store = createDiscoveryStore(storage);
    const listener = vi.fn();
    store.subscribe(listener);
    store.record(OFFICE, memo(1));
    store.record(OFFICE, memo(1));
    store.record(OFFICE, { id: 'memo-001', kind: 'secret' });
    expect(store.getState().found[OFFICE]).toEqual([memo(1)]);
    expect(storage.writes).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps one id found in two chambers as two findings', () => {
    const store = createDiscoveryStore(null);
    store.record(OFFICE, memo(1));
    store.record(SEALED, memo(1));
    expect(store.has(OFFICE, 'memo-001')).toBe(true);
    expect(store.has(SEALED, 'memo-001')).toBe(true);
    expect(store.has('tomorrow-engine', 'memo-001')).toBe(false);
  });

  it('ignores a finding it cannot store: unknown chamber, bad id, bad kind', () => {
    const storage = memoryStorage();
    const store = createDiscoveryStore(storage);
    const listener = vi.fn();
    store.subscribe(listener);
    store.record('basement' as ChamberId, memo(1));
    store.record('__proto__' as ChamberId, memo(1));
    store.record(OFFICE, { id: 'Not A Slug', kind: 'memo' });
    store.record(OFFICE, { id: 'x'.repeat(65), kind: 'memo' });
    store.record(OFFICE, { id: 'memo-001', kind: 'diary' as Finding['kind'] });
    store.record(OFFICE, null as unknown as Finding);
    expect(store.getState().found).toEqual({});
    expect(storage.writes).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('answers has() for a chamber it does not know without throwing', () => {
    const store = createDiscoveryStore(null);
    expect(store.has('__proto__' as ChamberId, 'memo-001')).toBe(false);
    expect(store.has('constructor' as ChamberId, 'memo-001')).toBe(false);
  });
});

describe('reading storage', () => {
  it('restores what an earlier visit stored', () => {
    const storage = memoryStorage();
    const first = createDiscoveryStore(storage);
    first.record(OFFICE, memo(1));
    first.record(OFFICE, secret(2));
    const second = createDiscoveryStore(storage);
    expect(second.getState()).toEqual(first.getState());
    expect(second.has(OFFICE, 'secret-2')).toBe(true);
  });

  it.each([
    ['another version', JSON.stringify({ version: 2, found: {}, recognitions: [] })],
    ['text that is not JSON', 'unheld'],
    ['an unknown chamber', documentOf({ basement: [memo(1)] })],
    ['a wrong type', JSON.stringify({ version: 1, found: [], recognitions: [] })],
    ['an oversize value', `${VALID}${' '.repeat(64 * 1024)}`],
  ])('ignores %s: starts empty, and neither erases nor writes until a record', (_name, stored) => {
    const storage = memoryStorage({ [DISCOVERY_STORAGE_KEY]: stored });
    const store = createDiscoveryStore(storage);
    expect(store.getState()).toEqual({ version: 1, found: {}, recognitions: [] });
    expect(storage.writes).toEqual([]);
    expect(storage.removes).toEqual([]);
    store.record(OFFICE, memo(1));
    expect(JSON.parse(storage.data.get(DISCOVERY_STORAGE_KEY)!)).toMatchObject({ version: 1 });
    expect(createDiscoveryStore(storage).has(OFFICE, 'memo-001')).toBe(true);
  });

  it('starts empty, without throwing, when storage refuses the read', () => {
    const storage = memoryStorage();
    storage.failReads = true;
    const store = createDiscoveryStore(storage);
    store.record(OFFICE, memo(1));
    expect(store.has(OFFICE, 'memo-001')).toBe(true);
  });
});

describe('counts', () => {
  it('counts papers as memos and secrets as secrets, against the room totals', () => {
    const store = createDiscoveryStore(null);
    store.record(OFFICE, memo(1));
    store.record(OFFICE, memo(2));
    store.record(OFFICE, memo(3));
    store.record(OFFICE, secret(1));
    store.record(OFFICE, { id: 'the-fifth', kind: 'payoff' });
    store.record(OFFICE, { id: 'a-line', kind: 'line' });
    expect(store.counts()).toEqual([
      {
        chamber: OFFICE,
        papers: { found: 3, total: OFFICE_TOTALS.papers },
        secrets: { found: 1, total: OFFICE_TOTALS.secrets },
      },
    ]);
  });

  it('never reports more than the total, though every finding is kept', () => {
    const store = createDiscoveryStore(null);
    const extra = OFFICE_TOTALS.papers + 2;
    for (let n = 1; n <= extra; n += 1) store.record(OFFICE, memo(n));
    for (let n = 1; n <= OFFICE_TOTALS.secrets + 1; n += 1) store.record(OFFICE, secret(n));
    const [count] = store.counts();
    expect(count?.papers).toEqual({ found: OFFICE_TOTALS.papers, total: OFFICE_TOTALS.papers });
    expect(count?.secrets).toEqual({ found: OFFICE_TOTALS.secrets, total: OFFICE_TOTALS.secrets });
    expect(store.getState().found[OFFICE]).toHaveLength(extra + OFFICE_TOTALS.secrets + 1);
  });

  it('lists only open chambers, and leaves a sealed chamber out even if it holds findings', () => {
    const store = createDiscoveryStore(null);
    store.record(SEALED, memo(1));
    expect(store.counts().map((c) => c.chamber)).toEqual(
      CHAMBERS.filter((c) => c.status === 'open').map((c) => c.id),
    );
    expect(store.getState().found[SEALED]).toEqual([memo(1)]);
  });

  it('returns the same array until something changes, for useSyncExternalStore', () => {
    const store = createDiscoveryStore(null);
    const before = store.counts();
    expect(store.counts()).toBe(before);
    store.record(OFFICE, memo(1));
    const after = store.counts();
    expect(after).not.toBe(before);
    expect(store.counts()).toBe(after);
  });
});

describe('forgetting', () => {
  it('erases the key and resets to empty', () => {
    const storage = memoryStorage();
    const store = createDiscoveryStore(storage);
    store.record(OFFICE, memo(1));
    store.forget();
    expect(storage.data.has(DISCOVERY_STORAGE_KEY)).toBe(false);
    expect(storage.data.size).toBe(0);
    expect(store.getState()).toEqual({ version: 1, found: {}, recognitions: [] });
    expect(store.has(OFFICE, 'memo-001')).toBe(false);
    expect(createDiscoveryStore(storage).getState().found).toEqual({});
  });

  it('erases a stored value that was ignored on load', () => {
    const storage = memoryStorage({ [DISCOVERY_STORAGE_KEY]: 'damaged' });
    createDiscoveryStore(storage).forget();
    expect(storage.data.size).toBe(0);
  });

  it('still resets this visit when storage refuses the removal', () => {
    const storage = memoryStorage();
    const store = createDiscoveryStore(storage);
    store.record(OFFICE, memo(1));
    storage.failRemoves = true;
    expect(() => store.forget()).not.toThrow();
    expect(store.getState().found).toEqual({});
  });

  it('lets the visitor find the same thing again afterwards', () => {
    const storage = memoryStorage();
    const store = createDiscoveryStore(storage);
    store.record(OFFICE, memo(1));
    store.forget();
    store.record(OFFICE, memo(1));
    expect(storage.data.has(DISCOVERY_STORAGE_KEY)).toBe(true);
    expect(store.has(OFFICE, 'memo-001')).toBe(true);
  });
});

describe('export and import', () => {
  function populated(storage: StorageLike | null = null) {
    const store = createDiscoveryStore(storage);
    store.record(OFFICE, secret(2));
    store.record(OFFICE, memo(1));
    store.record(OFFICE, { id: 'the-fifth', kind: 'payoff' });
    store.record(SEALED, { id: 'a-line', kind: 'line' });
    return store;
  }

  it('round-trips exactly into a fresh store, and the copy persists', () => {
    const source = populated();
    const text = source.exportText();
    const storage = memoryStorage();
    const target = createDiscoveryStore(storage);
    expect(target.importText(text)).toBe(true);
    expect(target.getState()).toEqual(source.getState());
    expect(target.exportText()).toBe(text);
    expect(JSON.parse(storage.data.get(DISCOVERY_STORAGE_KEY)!)).toEqual(source.getState());
    expect(createDiscoveryStore(storage).exportText()).toBe(text);
  });

  it('exports an empty store, and imports it back without writing anything', () => {
    const storage = memoryStorage();
    const store = createDiscoveryStore(storage);
    const text = store.exportText();
    expect(JSON.parse(text)).toEqual({ version: 1, found: {}, recognitions: [] });
    expect(store.importText(text)).toBe(true);
    expect(storage.writes).toEqual([]);
  });

  it('replaces what was there rather than merging, and importing an empty file empties the key', () => {
    const storage = memoryStorage();
    const store = populated(storage);
    expect(store.importText(documentOf({ [OFFICE]: [memo(5)] }))).toBe(true);
    expect(store.getState().found).toEqual({ [OFFICE]: [memo(5)] });
    expect(store.importText(documentOf({}))).toBe(true);
    expect(store.getState().found).toEqual({});
    expect(storage.data.has(DISCOVERY_STORAGE_KEY)).toBe(false);
  });

  it('keeps recognitions that a file carries, in order', () => {
    const store = createDiscoveryStore(null);
    expect(store.importText(documentOf({}, ['listener', 'late-reader']))).toBe(true);
    expect(store.getState().recognitions).toEqual(['listener', 'late-reader']);
    const again = createDiscoveryStore(null);
    expect(again.importText(store.exportText())).toBe(true);
    expect(again.getState().recognitions).toEqual(['listener', 'late-reader']);
    expect(again.exportText()).toBe(store.exportText());
  });

  it('treats a chamber with an empty list as nothing found there', () => {
    const store = createDiscoveryStore(null);
    expect(store.importText(documentOf({ [OFFICE]: [] }))).toBe(true);
    expect(store.getState()).toEqual({ version: 1, found: {}, recognitions: [] });
  });

  it('accepts a file saved with a byte-order mark, and a file of exactly 64 KB', () => {
    const store = createDiscoveryStore(null);
    expect(store.importText(`\uFEFF${VALID}`)).toBe(true);
    expect(store.has(OFFICE, 'memo-001')).toBe(true);
    const padded = VALID + ' '.repeat(64 * 1024 - VALID.length);
    expect(padded).toHaveLength(64 * 1024);
    expect(createDiscoveryStore(null).importText(padded)).toBe(true);
  });

  const rejected: [string, unknown][] = [
    ['empty text', ''],
    ['text that is not JSON', 'He is fine'],
    ['truncated JSON', VALID.slice(0, -3)],
    ['JSON that is not an object', '[]'],
    ['null', 'null'],
    ['a string', '"unheld"'],
    ['a version of 2', JSON.stringify({ version: 2, found: {}, recognitions: [] })],
    ['a version of "1"', JSON.stringify({ version: '1', found: {}, recognitions: [] })],
    ['no version', JSON.stringify({ found: {}, recognitions: [] })],
    ['no found', JSON.stringify({ version: 1, recognitions: [] })],
    ['no recognitions', JSON.stringify({ version: 1, found: {} })],
    ['an unknown top-level field', JSON.stringify({ version: 1, found: {}, recognitions: [], savedAt: 1 })],
    ['an unknown chamber', documentOf({ basement: [memo(1)] })],
    ['an unknown chamber beside a valid one', documentOf({ [OFFICE]: [memo(1)], basement: [memo(2)] })],
    ['a prototype key as a chamber', '{"version":1,"found":{"__proto__":[]},"recognitions":[]}'],
    ['text over 64 KB', `${VALID}${' '.repeat(64 * 1024)}`],
    ['found as an array', documentOf([] as unknown as Record<string, unknown>)],
    ['found as null', JSON.stringify({ version: 1, found: null, recognitions: [] })],
    ['a chamber holding an object, not a list', documentOf({ [OFFICE]: { id: 'memo-001', kind: 'memo' } })],
    ['a finding that is a string', documentOf({ [OFFICE]: ['memo-001'] })],
    ['a finding that is null', documentOf({ [OFFICE]: [null] })],
    ['a numeric id', documentOf({ [OFFICE]: [{ id: 1, kind: 'memo' }] })],
    ['an empty id', documentOf({ [OFFICE]: [{ id: '', kind: 'memo' }] })],
    ['an id that is not a slug', documentOf({ [OFFICE]: [{ id: 'Memo 001', kind: 'memo' }] })],
    ['an id with a path in it', documentOf({ [OFFICE]: [{ id: '../memo', kind: 'memo' }] })],
    ['an id over 64 characters', documentOf({ [OFFICE]: [{ id: 'a'.repeat(65), kind: 'memo' }] })],
    ['a numeric kind', documentOf({ [OFFICE]: [{ id: 'memo-001', kind: 1 }] })],
    ['an unknown kind', documentOf({ [OFFICE]: [{ id: 'memo-001', kind: 'diary' }] })],
    ['a missing kind', documentOf({ [OFFICE]: [{ id: 'memo-001' }] })],
    ['a finding carrying content', documentOf({ [OFFICE]: [{ ...memo(1), body: ['text'] }] })],
    ['a finding carrying a token', documentOf({ [OFFICE]: [{ ...memo(1), token: 'abc' }] })],
    ['the same finding twice in a chamber', documentOf({ [OFFICE]: [memo(1), memo(1)] })],
    ['recognitions as a string', documentOf({}, 'listener')],
    ['recognitions that are not strings', documentOf({}, [7])],
    ['a recognition that is not a slug', documentOf({}, ['The Listener'])],
    ['a repeated recognition', documentOf({}, ['listener', 'listener'])],
    ['more than 64 recognitions', documentOf({}, Array.from({ length: 65 }, (_, i) => `r${i}`))],
    ['a value that is not text at all', 42],
  ];

  it.each(rejected)('rejects %s and changes nothing', (_name, text) => {
    const storage = memoryStorage();
    const store = createDiscoveryStore(storage);
    store.record(OFFICE, memo(1));
    const before = store.getState();
    const stored = storage.data.get(DISCOVERY_STORAGE_KEY);
    const writes = storage.writes.length;
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.importText(text as string)).toBe(false);

    expect(store.getState()).toBe(before);
    expect(storage.data.get(DISCOVERY_STORAGE_KEY)).toBe(stored);
    expect(storage.writes).toHaveLength(writes);
    expect(storage.removes).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('storage that cannot be used', () => {
  it('works in memory alone when there is no storage', () => {
    const store = createDiscoveryStore(null);
    const listener = vi.fn();
    store.subscribe(listener);
    store.record(OFFICE, memo(1));
    expect(store.has(OFFICE, 'memo-001')).toBe(true);
    expect(store.counts()[0]?.papers.found).toBe(1);
    const text = store.exportText();
    store.forget();
    expect(store.importText(text)).toBe(true);
    expect(store.has(OFFICE, 'memo-001')).toBe(true);
    store.forget();
    expect(store.getState().found).toEqual({});
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('keeps working when a write is refused, as with a full quota, and writes it all once storage accepts', () => {
    const storage = memoryStorage();
    storage.failWrites = true;
    const store = createDiscoveryStore(storage);
    const listener = vi.fn();
    store.subscribe(listener);

    expect(() => store.record(OFFICE, memo(1))).not.toThrow();
    expect(store.has(OFFICE, 'memo-001')).toBe(true);
    expect(store.counts()[0]?.papers.found).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(storage.data.size).toBe(0);

    expect(store.importText(documentOf({ [OFFICE]: [memo(1), memo(2)] }))).toBe(true);
    expect(store.getState().found[OFFICE]).toHaveLength(2);

    storage.failWrites = false;
    store.record(OFFICE, memo(3));
    expect(createDiscoveryStore(storage).getState().found[OFFICE]).toEqual([memo(1), memo(2), memo(3)]);
  });
});

describe('subscribers', () => {
  it('hear a real change once, after the state has changed', () => {
    const store = createDiscoveryStore(null);
    const seen: number[] = [];
    store.subscribe(() => seen.push(store.getState().found[OFFICE]?.length ?? 0));
    store.record(OFFICE, memo(1));
    store.record(OFFICE, memo(2));
    expect(seen).toEqual([1, 2]);
  });

  it('hear nothing for a repeat record, a forget of nothing, a rejected import or an identical import', () => {
    const store = createDiscoveryStore(null);
    store.record(OFFICE, memo(1));
    const listener = vi.fn();
    store.subscribe(listener);

    store.record(OFFICE, memo(1));
    store.importText('rubbish');
    store.importText(store.exportText());
    expect(listener).not.toHaveBeenCalled();

    store.forget();
    expect(listener).toHaveBeenCalledTimes(1);
    store.forget();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('hear an import that changes the state', () => {
    const store = createDiscoveryStore(null);
    const listener = vi.fn();
    store.subscribe(listener);
    store.importText(VALID);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stop hearing once they unsubscribe', () => {
    const store = createDiscoveryStore(null);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.record(OFFICE, memo(1));
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps the same state object while nothing changes', () => {
    const store = createDiscoveryStore(null);
    store.record(OFFICE, memo(1));
    const before = store.getState();
    store.record(OFFICE, memo(1));
    store.importText(store.exportText());
    expect(store.getState()).toBe(before);
  });
});
