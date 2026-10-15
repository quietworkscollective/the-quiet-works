import { createApartmentState, transitionApartmentState, type ApartmentEvent, type ApartmentState } from './state.ts';

export interface ApartmentStore {
  getState(): ApartmentState;
  subscribe(listener: () => void): () => void;
  dispatch(event: ApartmentEvent): ApartmentState;
}

export function createApartmentStore(initial = createApartmentState()): ApartmentStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(event) {
      const next = transitionApartmentState(state, event);
      if (next !== state) {
        state = next;
        for (const listener of listeners) listener();
      }
      return state;
    },
  };
}

export const apartmentVisitStore = createApartmentStore();
