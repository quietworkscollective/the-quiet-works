import {
  initialState,
  transition,
  type CertificationEvent,
  type CertificationState,
  type Cue,
} from './certification.ts';

export type Unsubscribe = () => void;

/**
 * A minimal external store around the certification machine, shaped for React's
 * `useSyncExternalStore`. State listeners are notified only when state actually changes;
 * cue listeners receive every cue in order, after state listeners.
 */
export interface CertificationStore {
  getState(): CertificationState;
  dispatch(event: CertificationEvent): void;
  subscribe(listener: () => void): Unsubscribe;
  onCue(listener: (cue: Cue) => void): Unsubscribe;
}

export function createCertificationStore(
  start: CertificationState = initialState,
): CertificationStore {
  let state = start;
  const stateListeners = new Set<() => void>();
  const cueListeners = new Set<(cue: Cue) => void>();

  return {
    getState: () => state,

    dispatch(event) {
      const result = transition(state, event);
      if (result.state !== state) {
        state = result.state;
        for (const listener of [...stateListeners]) listener();
      }
      for (const cue of result.cues) {
        for (const listener of [...cueListeners]) listener(cue);
      }
    },

    subscribe(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },

    onCue(listener) {
      cueListeners.add(listener);
      return () => cueListeners.delete(listener);
    },
  };
}

export * from './office/objects.ts';
export * from './office/memos.ts';

export * from './office/archive.ts';
