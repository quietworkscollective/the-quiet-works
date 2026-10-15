import type { AmbientClock } from '../../../ambient.ts';

/**
 * How the platter gets frames. The scene draws on demand, and a turning platter is an ambient
 * window (ADR 0004): at most `AMBIENT_LIFE.maxWindowMs` of frames at a time, asked of the corridor's
 * scheduler, which refuses under reduced motion, while hidden or offscreen and at its concurrency
 * cap. This asks for a window while the platter is turning (the needle is down, or it is running
 * down) and the gramophone is in view, asks for the next one as the last ends so the
 * platter's turn is not lost between them, tries again if refused, and stops asking the moment there is
 * nothing to turn. One timer at most, and none while the platter is still.
 */

/** Each window is this long: under the scheduler's limit, long enough that asking again is rare. */
export const SPIN_WINDOW_MS = 5500;
/**
 * The next window is asked for this long after the last one ends: a window cannot be asked for while
 * it is open, so the platter waits out a frame or two at 15 frames a second, no more.
 */
export const SPIN_RENEW_AFTER_MS = 30;
/** A window that was already open when asked: look again this often until it has ended. */
export const SPIN_POLL_MS = 250;
/** After a refusal, ask again after this long. */
export const SPIN_RETRY_MS = 3000;

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface SpinDeps {
  readonly ambient: AmbientClock;
  /** The needle is down: the platter should be turning. */
  turning(): boolean;
  /** The platter is moving: turning, or running down after the needle lifted. */
  moving(): boolean;
  /** The gramophone is in the camera's view. */
  inView(): boolean;
  /** Reduced motion: the platter never turns, and nothing is asked for. */
  reduced(): boolean;
  /** No frames can or need be had for the platter: let it stop where it is. */
  settle(): void;
  readonly timers: Timers;
  readonly id: string;
}

export interface Spin {
  /** Is a window open now. */
  open(): boolean;
  /** Ask for a window if one is wanted and none is open; keeps asking while the platter turns. */
  keep(): void;
  /** Is a timer waiting to ask again. */
  waiting(): boolean;
  /** Stop asking. */
  stop(): void;
}

export function createSpin(deps: SpinDeps): Spin {
  let timer: unknown = null;
  const clear = (): void => {
    if (timer !== null) deps.timers.clear(timer);
    timer = null;
  };

  const wanted = (): boolean => !deps.reduced() && (deps.turning() || deps.moving());

  /** Ask once: 'asked' if a new window opened, 'open' if one already was, 'none' if there is none. */
  const ask = (): 'asked' | 'open' | 'none' => {
    if (!wanted()) return 'none';
    if (deps.ambient.active(deps.id)) return 'open';
    if (!deps.inView()) return 'none';
    return deps.ambient.requestWindow(deps.id, SPIN_WINDOW_MS) ? 'asked' : 'none';
  };

  const keep = (): void => {
    clear();
    if (!wanted()) return;
    const result = ask();
    const opened = result !== 'none';
    // No window, and nothing that waiting would fix: a platter running down gets no frames to run down in, and one
    // that cannot be seen needs none. It stops where it is, and nothing more is asked until the camera draws again.
    if (!opened && (!deps.turning() || !deps.inView())) {
      deps.settle();
      return;
    }
    timer = deps.timers.set(keep, result === 'asked' ? SPIN_WINDOW_MS + SPIN_RENEW_AFTER_MS : result === 'open' ? SPIN_POLL_MS : SPIN_RETRY_MS);
  };

  return {
    open: () => deps.ambient.active(deps.id),
    keep,
    waiting: () => timer !== null,
    stop: clear,
  };
}
