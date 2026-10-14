import { spineTransition, type SpineCue, type SpineEvent, type SpineState } from './spine.ts';
import type { Unsubscribe } from './store.ts';

/**
 * The spine machine as an external store, shaped like the certification store for React's
 * `useSyncExternalStore`: state listeners hear only real changes, cue listeners hear every cue
 * in order, after the state listeners. `onDispatch` sees every event with the state it produced,
 * which is where the shell keeps the URL in step.
 */
export interface SpineStore {
  getState(): SpineState;
  dispatch(event: SpineEvent): void;
  subscribe(listener: () => void): Unsubscribe;
  onCue(listener: (cue: SpineCue) => void): Unsubscribe;
  onDispatch(listener: (event: SpineEvent, state: SpineState) => void): Unsubscribe;
}

export function createSpineStore(start: SpineState): SpineStore {
  let state = start;
  const stateListeners = new Set<() => void>();
  const cueListeners = new Set<(cue: SpineCue) => void>();
  const dispatchListeners = new Set<(event: SpineEvent, state: SpineState) => void>();

  return {
    getState: () => state,

    dispatch(event) {
      const result = spineTransition(state, event);
      if (result.state !== state) {
        state = result.state;
        for (const listener of [...stateListeners]) listener();
      }
      for (const listener of [...dispatchListeners]) listener(event, state);
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

    onDispatch(listener) {
      dispatchListeners.add(listener);
      return () => dispatchListeners.delete(listener);
    },
  };
}
