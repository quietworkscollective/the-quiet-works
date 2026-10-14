import { DISCOVERY_STORAGE_KEY, type StorageLike } from '@tqw/engine';

/** What the adapter reads from `window`; injected so a test can stand in for a browser that refuses storage. */
export interface StorageHost {
  readonly localStorage: Storage;
}

function attempt<T>(action: () => T, fallback: T): T {
  try {
    return action();
  } catch {
    return fallback;
  }
}

/**
 * `window.localStorage` as the discovery store's `StorageLike`, or null where the browser will not
 * give it out: private modes and blocked site data throw on the property itself, and some
 * contexts have no storage at all. The site then runs on in-memory state alone (ADR 0003, R-1).
 *
 * Availability is checked with a read. A probe write would touch storage before anything has been
 * discovered, and the only key this site may ever write is the discovery key, only after the first
 * discovery. Writes that fail later (a full quota, storage switched off mid-visit) are swallowed:
 * nothing here may break the page.
 */
export function browserStorage(host?: StorageHost): StorageLike | null {
  let local: Storage;
  try {
    local = (host ?? window).localStorage;
    local.getItem(DISCOVERY_STORAGE_KEY);
  } catch {
    return null;
  }
  return {
    getItem: (key) => attempt(() => local.getItem(key), null),
    setItem: (key, value) => attempt(() => local.setItem(key, value), undefined),
    removeItem: (key) => attempt(() => local.removeItem(key), undefined),
  };
}
