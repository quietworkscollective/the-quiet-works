import { AMBIENT_LIFE, type AmbientClock } from '../../ambient.ts';
import { mulberry32 } from '../math.ts';
import { NO_AMBIENT, type AmbientDrive } from './motion.ts';

/**
 * The props' two small motions of their own (ADR 0004, ambient life), asked of the corridor's
 * ambient scheduler like every other:
 *  - the loose cuff of the top team shirt, lifting a few degrees in the lobby's draught;
 *  - the luggage tag on the walking boots, swinging a little on its string and settling.
 * Each runs in its own bounded window, well under the scheduler's limit, every half minute or so.
 * Neither is ever explained by a person: a draught is the cause, and there is no one in the
 * corridor to blame. Under reduced motion neither is asked for, and the scheduler would refuse.
 */

export const TOUCHES = {
  sleeve: { id: 'prop-sleeve', windowMs: 4200, everyMs: [24_000, 38_000] as const },
  tag: { id: 'prop-tag', windowMs: 5200, everyMs: [30_000, 46_000] as const },
} as const;

type Key = keyof typeof TOUCHES;
const KEYS: readonly Key[] = ['sleeve', 'tag'];

/** How long to wait before asking again after the scheduler said no (a cap, a hidden tab). */
const RETRY_MS = 3_000;

/** The cuff's displacement over a window of `u` in 0..1: a slow lift and settle, zero at both ends. */
export function sleeveShape(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  return Math.pow(Math.sin(Math.PI * u), 1.6) * (0.65 + 0.35 * Math.sin(Math.PI * 2 * 1.5 * u)) * 1.83;
}

/** The tag's swing: struck at the start, ringing down. Zero at the start, a few per cent at the end. */
export function tagShape(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  return Math.exp(-3.4 * u) * Math.sin(Math.PI * 2 * 4.2 * u) * 1.2;
}

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const BROWSER_TIMERS: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface Touches {
  /** The displacement of each motion right now, in -1..1; both zero outside a window. */
  drive(): AmbientDrive;
  stop(): void;
}

/**
 * Start asking for windows. Nothing is requested under reduced motion. `drive()` is read in a
 * frame callback and is a pure function of the scheduler's clock, so it is exactly at rest
 * whenever no window is open.
 */
export function startTouches(clock: AmbientClock, reducedMotion: boolean, timers: Timers = BROWSER_TIMERS, seed = 0x51ee): Touches {
  const out: AmbientDrive = { ...NO_AMBIENT };
  if (reducedMotion) return { drive: () => out, stop: () => undefined };
  const rng = mulberry32(seed);
  const handles = new Map<Key, unknown>();
  const opened = new Map<Key, number>();
  let stopped = false;

  const range = (a: number, b: number): number => a + (b - a) * rng();
  const schedule = (key: Key, ms: number): void => {
    if (stopped) return;
    handles.set(key, timers.set(() => ask(key), ms));
  };
  const ask = (key: Key): void => {
    if (stopped) return;
    const touch = TOUCHES[key];
    const ms = Math.min(touch.windowMs, AMBIENT_LIFE.maxWindowMs);
    if (clock.requestWindow(touch.id, ms)) {
      opened.set(key, clock.now());
      schedule(key, range(touch.everyMs[0], touch.everyMs[1]));
    } else {
      schedule(key, RETRY_MS + range(0, 2_000));
    }
  };
  // Stagger the first asks so the two never open together at the start.
  schedule('sleeve', range(9_000, 14_000));
  schedule('tag', range(20_000, 26_000));

  return {
    drive() {
      for (const key of KEYS) {
        const touch = TOUCHES[key];
        const start = opened.get(key);
        const u = start === undefined || !clock.active(touch.id) ? 0 : (clock.now() - start) / (touch.windowMs / 1000);
        out[key] = key === 'sleeve' ? sleeveShape(u) : tagShape(u);
      }
      return out;
    },
    stop() {
      stopped = true;
      for (const handle of handles.values()) timers.clear(handle);
      handles.clear();
    },
  };
}
