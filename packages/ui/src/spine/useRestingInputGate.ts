import { useEffect } from 'react';

/** The keys that walk and turn in the corridor and in rooms. */
const WALK_KEYS: ReadonlySet<string> = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/**
 * While the game window remains at rest, the wheel and walking keys belong to the page. The core
 * shell may engage at the authored smoke hand-over after a deliberate downward wheel or swipe;
 * this gate keeps all other resting input on the page. The browser's scrolling is untouched; only
 * listeners further along the event's path are stopped.
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
