import type { Verb } from '../../../../audio/music/needle.ts';
import type { Target } from './reading.ts';

/**
 * What the 3D object and its DOM equivalent tell each other: which fitting the pointer is over,
 * which control has the keyboard's focus, and where on the screen each fitting is, so that the
 * verb label and a focused control can sit beside it. A small plain object because the two live in
 * separate React roots (the Canvas's and the page's), and because the screen positions change with
 * every frame the camera draws and must reach the DOM without re-rendering anything.
 */
export interface GramophoneUi {
  /** The fitting the pointer is over. */
  hover: Target | null;
  /** The control with the keyboard's focus. */
  focus: Target | null;
  /** Where each fitting is on the screen, in CSS pixels from the page's top left, and whether it is in front of the camera. */
  screen: Record<Target, { x: number; y: number; visible: boolean }>;
  /**
   * The verb a press was made for, noted when it began (the pointer going down, a key going down)
   * and used when it ends (the click). The press itself is the visitor's first gesture, which starts
   * the first record and so changes the needle's verb in between: "Play" pressed on a needle that
   * is up must still mean Play when the click lands on a needle that has just come down.
   */
  armed: Map<Target, Verb>;
}

type Listener = () => void;

export interface UiStore {
  readonly state: GramophoneUi;
  /** Set what the pointer is over or the focus is on, and tell whoever is listening if it changed. */
  setHover(target: Target | null): void;
  setFocus(target: Target | null): void;
  /** Move the fittings' screen positions. Does not notify: the DOM reads them when it is next told by the camera. */
  setScreen(target: Target, x: number, y: number, visible: boolean): void;
  /** Note the verb a press began as, and take it (once) when the press ends; `fallback` if none was noted. */
  arm(target: Target, verb: Verb): void;
  disarm(target: Target): void;
  take(target: Target, fallback: Verb): Verb;
  subscribe(listener: Listener): () => void;
}

export function createUi(): UiStore {
  const state: GramophoneUi = {
    hover: null,
    focus: null,
    screen: { needle: { x: 0, y: 0, visible: false }, records: { x: 0, y: 0, visible: false } },
    armed: new Map(),
  };
  const listeners = new Set<Listener>();
  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };
  return {
    state,
    setHover(target) {
      if (state.hover === target) return;
      state.hover = target;
      notify();
    },
    setFocus(target) {
      if (state.focus === target) return;
      state.focus = target;
      notify();
    },
    setScreen(target, x, y, visible) {
      const at = state.screen[target];
      at.x = x;
      at.y = y;
      at.visible = visible;
    },
    arm(target, verb) {
      state.armed.set(target, verb);
    },
    disarm(target) {
      state.armed.delete(target);
    },
    take(target, fallback) {
      const verb = state.armed.get(target) ?? fallback;
      state.armed.delete(target);
      return verb;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/** The page's one. */
export const gramophoneUi = createUi();
