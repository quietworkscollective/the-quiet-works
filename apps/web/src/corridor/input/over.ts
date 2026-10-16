/**
 * What the pointer is over in the scene (ADR 0004: the pointer cursor appears only on valid
 * targets). The scene's CSS turns the cursor to a pointer exactly when the container carries a
 * `data-over` attribute, so this is the one place that sets it: a door, a prop or the notice board
 * while the pointer is on one, and nothing at all otherwise.
 */
export type OverKind = 'door' | 'prop' | 'board';

export interface OverTracker {
  /** The pointer moved onto a target of this kind. */
  enter(kind: OverKind): void;
  /** The pointer left it. Only the target it is leaving clears the attribute. */
  leave(kind: OverKind): void;
  /** Forget everything (the scene stops being interactive). */
  clear(): void;
  current(): OverKind | null;
}

export function createOverTracker(surface: HTMLElement): OverTracker {
  /** Targets the pointer is on, in the order it reached them (a pointer can be on two for a moment). */
  const on: OverKind[] = [];

  const write = (): void => {
    const top = on.at(-1);
    if (top) surface.dataset['over'] = top;
    else delete surface.dataset['over'];
  };

  return {
    enter(kind) {
      const at = on.indexOf(kind);
      if (at !== -1) on.splice(at, 1);
      on.push(kind);
      write();
    },
    leave(kind) {
      const at = on.indexOf(kind);
      if (at === -1) return;
      on.splice(at, 1);
      write();
    },
    clear() {
      on.length = 0;
      write();
    },
    current: () => on.at(-1) ?? null,
  };
}
