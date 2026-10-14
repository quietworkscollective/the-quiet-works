import { createDiscoveryStore, type DiscoveryStore } from '@tqw/engine';
import { browserStorage } from '../../src/storage/index.ts';

/**
 * Wires the real adapter to the real store in a real browser and hands the result to the spec.
 * The hook lives here, in a page only the e2e dev server serves, so no production code exposes
 * anything on `window`.
 */
export interface Harness {
  store: DiscoveryStore;
  /** False when the adapter found no usable storage and the store is running on memory alone. */
  storageAvailable: boolean;
  /** How many times the store announced a change. */
  notifications: number;
}

const storage = browserStorage();
const harness: Harness = {
  store: createDiscoveryStore(storage),
  storageAvailable: storage !== null,
  notifications: 0,
};
harness.store.subscribe(() => {
  harness.notifications += 1;
});

(window as unknown as { __harness: Harness }).__harness = harness;
document.body.dataset['ready'] = 'true';
