import { createExchangeState, transitionExchange, type ExchangeEvent, type ExchangeState, type ExchangeTransition } from './state.ts';

export interface ExchangeStore {
  getState(): ExchangeState;
  subscribe(listener: () => void): () => void;
  dispatch(event: ExchangeEvent): ExchangeTransition;
}

export function createExchangeStore(initial = createExchangeState()): ExchangeStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispatch(event) {
      const result = transitionExchange(state, event);
      if (result.state !== state) {
        state = result.state;
        for (const listener of listeners) listener();
      }
      return result;
    },
  };
}

let visit: ExchangeStore | null = null;
export function exchangeVisitStore(): ExchangeStore {
  visit ??= createExchangeStore();
  return visit;
}
