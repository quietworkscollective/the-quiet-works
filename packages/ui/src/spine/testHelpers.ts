import { createDiscoveryStore, DISCOVERY_STORAGE_KEY, type DiscoveryState, type DiscoveryStore, type StorageLike } from '@tqw/engine';
import type { Settings } from '../types.ts';
import type { ProgressLike } from './types.ts';

/** A progress source a test can move: the page's scroll progress without a page. */
export function fakeProgress(start = 0): ProgressLike & { set(value: number): void } {
  let value = start;
  const listeners = new Set<(next: number) => void>();
  return {
    get: () => value,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      value = next;
      for (const listener of [...listeners]) listener(next);
    },
  };
}

export const SETTINGS: Settings = { muted: false, reducedMotion: false, captions: false, textMode: false };

/** Browser storage held in memory: what the on-device store writes to, without a browser. */
export function fakeStorage(items: Record<string, string> = {}): StorageLike & { items: Map<string, string> } {
  const held = new Map(Object.entries(items));
  return {
    items: held,
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => void held.set(key, value),
    removeItem: (key) => void held.delete(key),
  };
}

/**
 * The real on-device discovery store over in-memory storage, optionally starting from an earlier
 * archive (as if the device remembered it). Nothing touches the browser's own storage.
 */
export function createMemoryDiscoveryStore(initial?: DiscoveryState): DiscoveryStore {
  return createDiscoveryStore(fakeStorage(initial ? { [DISCOVERY_STORAGE_KEY]: JSON.stringify(initial) } : {}));
}
