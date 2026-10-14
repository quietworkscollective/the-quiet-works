import { initialRoomState, reduceRoom, type RoomAction, type RoomState } from './state.ts';

export interface RoomStore {
  getState(): RoomState;
  subscribe(listener: () => void): () => void;
  dispatch(action: RoomAction): void;
}

export function createRoomStore(): RoomStore {
  let state = initialRoomState();
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(action) {
      const next = reduceRoom(state, action);
      if (next === state) return;
      state = next;
      for (const listener of [...listeners]) listener();
    },
  };
}
