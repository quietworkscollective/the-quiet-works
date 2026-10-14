import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export interface FullscreenControl {
  /** The browser can put an element in fullscreen (iPhone Safari cannot: the control is left out there). */
  supported: boolean;
  active: boolean;
  toggle(): void;
}

/**
 * The Fullscreen API on one element: the game window. `onChange` hears every entry and exit,
 * including the browser's own (Escape, a system gesture), because leaving fullscreen by any route
 * also releases the game's hold on the page's input. Browser fullscreen is never the only way out:
 * the window offers "Exit fullscreen" itself.
 */
export function useFullscreen(target: RefObject<HTMLElement | null>, onChange?: ((active: boolean) => void) | undefined): FullscreenControl {
  const [active, setActive] = useState(false);
  const supported = typeof document !== 'undefined' && document.fullscreenEnabled === true;
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const onFullscreenChange = () => {
      const now = document.fullscreenElement !== null && document.fullscreenElement === target.current;
      setActive(now);
      onChangeRef.current?.(now);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [target]);

  const toggle = useCallback(() => {
    const element = target.current;
    if (!element) return;
    if (document.fullscreenElement === element) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void element.requestFullscreen().catch(() => undefined);
    }
  }, [target]);

  return { supported, active, toggle };
}
