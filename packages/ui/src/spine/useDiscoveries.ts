import { useCallback, useState, useSyncExternalStore } from 'react';
import type { DiscoveryState, DiscoveryStore } from '@tqw/engine';

/** The store's state, re-rendering when it changes. */
export function useDiscoveries(store: DiscoveryStore): DiscoveryState {
  return useSyncExternalStore(store.subscribe, store.getState);
}

const keysOf = (state: DiscoveryState): Set<string> =>
  new Set(Object.entries(state.found).flatMap(([chamber, list]) => (list ?? []).map((finding) => `${chamber}/${finding.id}`)));

/**
 * How many things were found on this visit: what the store holds now that it did not when the page
 * loaded. The remembered archive is not "this visit", so `rebaseline` (called after an import or a
 * forget) makes whatever is there now the new starting point.
 */
export function useSessionDiscoveries(store: DiscoveryStore): { count: number; rebaseline(): void } {
  const [baseline, setBaseline] = useState(() => keysOf(store.getState()));
  const state = useDiscoveries(store);
  const rebaseline = useCallback(() => setBaseline(keysOf(store.getState())), [store]);
  let count = 0;
  for (const key of keysOf(state)) if (!baseline.has(key)) count += 1;
  return { count, rebaseline };
}
