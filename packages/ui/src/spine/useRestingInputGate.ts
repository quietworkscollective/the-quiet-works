import { useEffect } from 'react';

/** The keys that walk and turn in the corridor and in rooms. */
const WALK_KEYS: ReadonlySet<string> = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/**
 * While the game window is only resting, the wheel and the walking keys belong to the page. Nothing
 * the scene listens for on `window` is allowed to see them, so arriving at the game window by
 * scrolling can never capture input, whatever a scene's own handlers do (ADR 0003: "arriving by
 * scroll never captures input"). The browser's own scrolling is untouched; only the listeners
 * further along the event's path are stopped.
 *
 * Key releases are never stopped, so a key still held when the window is engaged or released cannot
 * be left stuck down in the scene.
 */
export function useRestingInputGate(engaged: boolean, enabled: boolean): void {
  useEffect(() => {
    if (!enabled || engaged) return;
    const onWheel = (event: Event) => event.stopPropagation();
    const onKeyDown = (event: KeyboardEvent) => {
      if (WALK_KEYS.has(event.code)) event.stopPropagation();
    };
    window.addEventListener('wheel', onWheel, { capture: true, passive: true });
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('wheel', onWheel, { capture: true });
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [engaged, enabled]);
}
