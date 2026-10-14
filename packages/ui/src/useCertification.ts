import { useSyncExternalStore } from 'react';
import type { CertificationState, CertificationStore } from '@tqw/engine';

export function useCertification(store: CertificationStore): CertificationState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
