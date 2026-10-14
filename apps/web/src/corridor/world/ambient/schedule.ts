import { AMBIENT_LIFE, type AmbientClock } from '../../ambient.ts';

/**
 * The corridor's ambient life (ADR 0004): small motions that each have an ordinary cause, shown
 * in short bounded render windows instead of continuously. This module decides *when* to ask for
 * a window; the camera lane's scheduler (the `AmbientClock`) owns the render loop and grants or
 * refuses each request (hidden, offscreen, reduced motion, or already three windows open), and
 * the components in this folder animate whatever is `active`.
 *
 * Nothing here ever moves a door, flickers a light, breathes a lamp or implies someone is about.
 */

export type AmbientId =
  | 'lobby-fan'
  | 'board-paper'
  | 'lobby-dust'
  | 'fan-tag'
  | 'radiator-shimmer'
  | 'repair-mobile'
  | 'window-reflection'
  | 'board-pin';

export interface MotionSpec {
  id: AmbientId;
  /** How long a window stays open: the motion's own length plus a settle. Never over AMBIENT_LIFE.maxWindowMs. */
  windowMs: number;
  /**
   * Gap between the start of one window and the start of the next, [min, max] ms; `once` for a
   * motion shown a single time at `first`; `triggered` for one that only an action starts.
   */
  every: readonly [number, number] | 'once' | 'triggered';
  /** When the first window opens after the scene starts, ms. */
  first: number;
  /** Desktop only (a heat shimmer is a pointer-device nicety, not something to spend a phone's frames on). */
  desktopOnly?: boolean;
}

/**
 * The motions of art consult 5 that remain (eight windows; the clock's second hand is the ninth): it steps whenever any
 * window is open, because it reads the ambient clock, and so has no window of its own. (The plant's
 * sway and the water drip of the consult were retired when the lobby kept one plant, the props lane's,
 * whose own can drops its own drop.) The board pin's highlight (ADR 0004's idle cue) is a single short
 * window early in the hero.
 *
 * The first-ten-seconds of the hero: the fan is already turning from the first frame (its window
 * opens at 0), a paper corner lifts by 4 s, and motes cross the lamp's pool by 8 s.
 */
export const MOTIONS: readonly MotionSpec[] = [
  { id: 'lobby-fan', windowMs: 6000, every: [24000, 36000], first: 0 },
  { id: 'board-paper', windowMs: 2600, every: [18000, 30000], first: 2200 },
  { id: 'lobby-dust', windowMs: 4000, every: [34000, 50000], first: 5200 },
  { id: 'fan-tag', windowMs: 1800, every: [25000, 40000], first: 7000 },
  { id: 'radiator-shimmer', windowMs: 3000, every: [30000, 45000], first: 13000, desktopOnly: true },
  { id: 'repair-mobile', windowMs: 6000, every: [35000, 50000], first: 15000 },
  { id: 'window-reflection', windowMs: 4000, every: [40000, 60000], first: 18000 },
  // The board's brass pin catches one soft highlight early in the hero; later idle cues are the interaction lane's.
  { id: 'board-pin', windowMs: 1400, every: 'once', first: 1200 },
];

export interface Timers {
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
  /** Milliseconds on a monotonic clock. */
  now(): number;
}

export const REAL_TIMERS: Timers = {
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id),
  now: () => performance.now(),
};

export interface SchedulerOptions {
  reducedMotion: boolean;
  desktop: boolean;
  /** A source of [0, 1): the gaps between windows are jittered so the lobby never settles into a beat. */
  random: () => number;
  timers?: Timers;
}

/** How long to wait before asking again after a refusal (hidden, offscreen, or at the cap). */
const RETRY_MS = 1500;

/**
 * Asks the clock for each motion's windows on its own cadence. It keeps its own count of the
 * windows it has open and never has more than `AMBIENT_LIFE.maxConcurrent` at once, whatever the
 * clock would allow, and never asks for one longer than `AMBIENT_LIFE.maxWindowMs`. Under reduced
 * motion it asks for nothing at all.
 */
export class AmbientScheduler {
  private readonly timers: Timers;
  private readonly handles = new Map<AmbientId, number>();
  private readonly open = new Map<AmbientId, number>();
  private stopped = true;

  constructor(
    private readonly clock: AmbientClock,
    private readonly options: SchedulerOptions,
    private readonly motions: readonly MotionSpec[] = MOTIONS,
  ) {
    this.timers = options.timers ?? REAL_TIMERS;
  }

  /** Begin: every scheduled motion gets its first window at its `first` offset. */
  start(): void {
    if (!this.stopped || this.options.reducedMotion) return;
    this.stopped = false;
    for (const m of this.motions) {
      if (m.every === 'triggered') continue;
      if (m.desktopOnly && !this.options.desktop) continue;
      this.arm(m, m.first);
    }
  }

  stop(): void {
    this.stopped = true;
    for (const h of this.handles.values()) this.timers.clearTimeout(h);
    this.handles.clear();
    this.open.clear();
  }

  /** Ask for a one-off window of a `triggered` motion (an action starts it). False when it was refused. */
  trigger(id: AmbientId): boolean {
    if (this.options.reducedMotion || this.stopped) return false;
    const m = this.motions.find((x) => x.id === id);
    return m ? this.request(m) : false;
  }

  private arm(m: MotionSpec, delay: number): void {
    const prior = this.handles.get(m.id);
    if (prior !== undefined) this.timers.clearTimeout(prior);
    this.handles.set(
      m.id,
      this.timers.setTimeout(() => {
        this.handles.delete(m.id);
        if (this.stopped) return;
        if (this.request(m)) {
          if (m.every === 'once' || m.every === 'triggered') return;
          const [lo, hi] = m.every;
          // Start-to-start: the next window opens a jittered gap after this one opened.
          this.arm(m, Math.max(m.windowMs + 500, lo + this.options.random() * (hi - lo)));
        } else {
          this.arm(m, RETRY_MS);
        }
      }, delay),
    );
  }

  private request(m: MotionSpec): boolean {
    const now = this.timers.now();
    for (const [id, until] of this.open) if (until <= now) this.open.delete(id);
    if (this.open.size >= AMBIENT_LIFE.maxConcurrent) return false;
    const ms = Math.min(m.windowMs, AMBIENT_LIFE.maxWindowMs);
    if (!this.clock.requestWindow(m.id, ms)) return false;
    this.open.set(m.id, now + ms);
    return true;
  }
}
