// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDiscoveryStore, DISCOVERY_STORAGE_KEY } from '@tqw/engine';
import { browserStorage, type StorageHost } from './browserStorage.ts';

/** A Storage that records every call. */
function fakeStorage() {
  const data = new Map<string, string>();
  const calls: string[] = [];
  const local = {
    data,
    calls,
    getItem: vi.fn((key: string) => {
      calls.push(`get ${key}`);
      return data.get(key) ?? null;
    }),
    setItem: vi.fn((key: string, value: string) => {
      calls.push(`set ${key}`);
      data.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      calls.push(`remove ${key}`);
      data.delete(key);
    }),
  };
  return local;
}

const hostOf = (local: unknown) => ({ localStorage: local }) as unknown as StorageHost;

/** A host where merely reading `localStorage` throws, as when the browser blocks site data. */
function blockedHost(): StorageHost {
  const host = {};
  Object.defineProperty(host, 'localStorage', {
    get() {
      throw new Error('SecurityError: the operation is insecure');
    },
  });
  return host as StorageHost;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browserStorage', () => {
  it('passes reads, writes and removals through to the host storage', () => {
    const local = fakeStorage();
    const storage = browserStorage(hostOf(local));
    expect(storage).not.toBeNull();
    storage!.setItem('k', 'v');
    expect(storage!.getItem('k')).toBe('v');
    expect(storage!.getItem('missing')).toBeNull();
    storage!.removeItem('k');
    expect(local.data.size).toBe(0);
  });

  it('only reads when it is created: no write and no removal before anything is discovered', () => {
    const local = fakeStorage();
    browserStorage(hostOf(local));
    expect(local.setItem).not.toHaveBeenCalled();
    expect(local.removeItem).not.toHaveBeenCalled();
    expect(local.calls).toEqual([`get ${DISCOVERY_STORAGE_KEY}`]);
  });

  it("uses the page's own window.localStorage when no host is given", () => {
    const local = fakeStorage();
    vi.stubGlobal('window', { localStorage: local });
    const storage = browserStorage();
    storage!.setItem('k', 'v');
    expect(local.data.get('k')).toBe('v');
  });

  it('is null where the property throws, as with blocked site data', () => {
    expect(browserStorage(blockedHost())).toBeNull();
  });

  it('is null where the page has no storage at all', () => {
    expect(browserStorage(hostOf(undefined))).toBeNull();
    expect(browserStorage(hostOf(null))).toBeNull();
    expect(browserStorage(hostOf({}))).toBeNull();
  });

  it('is null where reading is refused, even though the property can be read', () => {
    const local = fakeStorage();
    local.getItem.mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(browserStorage(hostOf(local))).toBeNull();
  });

  it('is null outside a browser, where there is no window', () => {
    expect(typeof window).toBe('undefined');
    expect(browserStorage()).toBeNull();
  });

  it('swallows a refused write, as with a full quota', () => {
    const local = fakeStorage();
    const storage = browserStorage(hostOf(local))!;
    local.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => storage.setItem('k', 'v')).not.toThrow();
    expect(local.data.size).toBe(0);
  });

  it('swallows a refused removal, and answers null for a refused read, after storage was switched off mid-visit', () => {
    const local = fakeStorage();
    local.data.set('k', 'v');
    const storage = browserStorage(hostOf(local))!;
    local.removeItem.mockImplementation(() => {
      throw new Error('SecurityError');
    });
    local.getItem.mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => storage.removeItem('k')).not.toThrow();
    expect(storage.getItem('k')).toBeNull();
  });

  it('keeps the discovery store working in memory when storage is blocked, full or switched off', () => {
    const noStorage = createDiscoveryStore(browserStorage(blockedHost()));
    noStorage.record('certification-office', { id: 'memo-001', kind: 'memo' });
    expect(noStorage.has('certification-office', 'memo-001')).toBe(true);

    const local = fakeStorage();
    local.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const full = createDiscoveryStore(browserStorage(hostOf(local)));
    expect(() => full.record('certification-office', { id: 'memo-001', kind: 'memo' })).not.toThrow();
    expect(full.has('certification-office', 'memo-001')).toBe(true);
    expect(local.data.size).toBe(0);
  });

  it('lets the discovery store write its one key, and erase it again', () => {
    const local = fakeStorage();
    const store = createDiscoveryStore(browserStorage(hostOf(local)));
    expect(local.setItem).not.toHaveBeenCalled();
    store.record('certification-office', { id: 'memo-001', kind: 'memo' });
    expect([...local.data.keys()]).toEqual([DISCOVERY_STORAGE_KEY]);
    store.forget();
    expect(local.data.size).toBe(0);
  });
});
