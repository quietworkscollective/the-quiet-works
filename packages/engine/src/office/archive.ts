import { digestItem, openSealed, type SealedFile, type SealedItem } from '../sealed/index.ts';
import type { OfficeItemId } from './objects.ts';

export interface OpenedOfficeItem {
  readonly item: SealedItem;
  readonly digest: string;
}
export type OfficeArchiveState = Readonly<Partial<Record<OfficeItemId, OpenedOfficeItem>>>;
export interface OfficeArchive {
  getState(): OfficeArchiveState;
  subscribe(listener: () => void): () => void;
  open(id: OfficeItemId, token: string): Promise<OpenedOfficeItem | null>;
}

/** Visit cache coalesces the expensive derivation, including concurrent scene and DOM requests. */
export function createOfficeArchive(file: SealedFile): OfficeArchive {
  let state: OfficeArchiveState = {};
  const pending = new Map<string, Promise<OpenedOfficeItem | null>>();
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    open(id, token) {
      const known = state[id];
      if (known) return Promise.resolve(known);
      const key = `${id}:${token}`;
      const underway = pending.get(key);
      if (underway) return underway;
      const promise = openSealed(file, id, token).then(async item => {
        if (!item) return null;
        const opened = { item, digest: await digestItem(item) };
        state = { ...state, [id]: opened };
        for (const listener of [...listeners]) listener();
        return opened;
      });
      pending.set(key, promise);
      return promise;
    },
  };
}
