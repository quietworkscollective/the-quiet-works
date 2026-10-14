import { SITE_SCROLL } from '../../timing.ts';

/**
 * Whether the live scene is on screen (ADR 0003: one renderer serves the hero and the game
 * window, so it must draw nothing while the page is scrolled to the sections below, or while the
 * tab is hidden). The scene is visible when the tab is, and it intersects the viewport; a scene
 * drawn `position: fixed` behind the sections always intersects, so for that layout the scroll
 * position says: past the game window (the run to its top, `SITE_SCROLL.runViewports` viewports,
 * plus its own viewport) the sections cover it. A scene shown fullscreen is always visible.
 */
export interface VisibilityState {
  documentVisible: boolean;
  /** From an IntersectionObserver on the scene's container. */
  intersecting: boolean;
  /** The container is `position: fixed`. */
  fixed: boolean;
  scrollY: number;
  viewportHeight: number;
  /** The scene (or a window containing it) is the fullscreen element. */
  fullscreen: boolean;
}

/** Scroll at which the game window's bottom edge reaches the top of the viewport. */
export const pastGameWindowAt = (viewportHeight: number): number => (SITE_SCROLL.runViewports + 1) * viewportHeight;

export function sceneVisible(state: VisibilityState): boolean {
  if (!state.documentVisible) return false;
  if (state.fullscreen) return true;
  if (!state.intersecting) return false;
  if (state.fixed && state.scrollY >= pastGameWindowAt(state.viewportHeight)) return false;
  return true;
}

export interface VisibilityWatch {
  visible(): boolean;
  dispose(): void;
}

/** Watches `container` and the page; calls `onChange` with the new answer whenever it changes. */
export function watchVisibility(container: HTMLElement, onChange: (visible: boolean) => void): VisibilityWatch {
  let intersecting = true;
  let current = true;

  const read = (): boolean => {
    const fullscreen = document.fullscreenElement;
    return sceneVisible({
      documentVisible: document.visibilityState !== 'hidden',
      intersecting,
      fixed: getComputedStyle(container).position === 'fixed',
      scrollY: window.scrollY,
      viewportHeight: window.innerHeight,
      fullscreen: fullscreen !== null && (fullscreen === container || fullscreen.contains(container)),
    });
  };

  const update = () => {
    const next = read();
    if (next === current) return;
    current = next;
    onChange(next);
  };

  const observer =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
          const last = entries.at(-1);
          if (last) intersecting = last.isIntersecting;
          update();
        });
  observer?.observe(container);
  document.addEventListener('visibilitychange', update);
  document.addEventListener('fullscreenchange', update);
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  current = read();

  return {
    visible: () => current,
    dispose() {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', update);
      document.removeEventListener('fullscreenchange', update);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    },
  };
}
