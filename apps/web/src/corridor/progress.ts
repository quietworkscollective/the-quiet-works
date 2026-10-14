/**
 * Landing scroll progress, 0 at the first frame and 1 at hand-over. The landing DOM writes it
 * from native scrolling; the corridor camera reads it every frame. A plain mutable source, not
 * React state, so scrolling never re-renders the tree.
 */
export interface ProgressSource {
  get(): number;
  set(value: number): void;
  /** Called after every change; returns an unsubscribe. */
  subscribe(listener: (value: number) => void): () => void;
}

export function createProgress(initial = 0): ProgressSource {
  let value = initial;
  const listeners = new Set<(value: number) => void>();
  return {
    get: () => value,
    set(next) {
      const clamped = Math.min(1, Math.max(0, next));
      if (clamped === value) return;
      value = clamped;
      for (const listener of [...listeners]) listener(value);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
