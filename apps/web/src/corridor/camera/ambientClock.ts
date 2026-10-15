import { AMBIENT_LIFE, type AmbientClock } from '../ambient.ts';

/**
 * The ambient scheduler (ADR 0004, "Ambient life"). The corridor's small motions (a fan, a paper
 * corner, dust in a lamp's light) are drawn only inside short, bounded render windows, never
 * continuously: the world and props lanes ask this clock for a window per motion, and the camera
 * lane draws frames while any window is open and none otherwise.
 *
 * The rules, all enforced here rather than left to each motion:
 * - a window lasts at most `AMBIENT_LIFE.maxWindowMs`, however long it was asked for or extended;
 * - at most `AMBIENT_LIFE.maxConcurrent` motions have a window open at once;
 * - no window opens, and any open one closes at once, under reduced motion, while the tab is hidden
 *   or the scene is off screen, or while something covers the scene;
 * - `now()` advances only while some window is open, so a motion that reads it resumes where it
 *   stopped instead of jumping across the quiet between windows.
 *
 * It reads a real clock (`performance.now` by default) lazily, whenever it is asked, so it never
 * depends on the order in which frame callbacks run, and tests drive it with a fake one.
 */

/** Why windows are refused. Windows run only while there is no reason at all. */
export type AmbientReason = 'reduced-motion' | 'hidden' | 'offscreen' | 'covered';

export interface AmbientScheduler {
  /** The clock the world and props lanes see through `useAmbient()`. */
  readonly clock: AmbientClock;
  /** Windows open right now. */
  openIds(): readonly string[];
  /** When (on the real clock, ms) the soonest open window ends, or null when none is open. */
  nextEndMs(): number | null;
  /** True while some window is open; also lets expired ones close. */
  tick(): boolean;
  /** Sets or clears a reason for refusing windows. Setting the first reason closes every open window. */
  setReason(reason: AmbientReason, on: boolean): void;
  /** True while any reason is set. */
  suspended(): boolean;
  /** Who to tell when a window opens, is extended, or is closed early (the shell draws a frame). */
  setOnChange(listener: (() => void) | null): void;
  dispose(): void;
}

export interface AmbientSchedulerOptions {
  /** The real clock in milliseconds. */
  nowMs?: () => number;
  /** A window opened, was extended, or was closed early: the shell should draw a frame. */
  onChange?: () => void;
  /** The limits; the contract's by default. */
  limits?: typeof AMBIENT_LIFE;
}

interface Window {
  start: number;
  end: number;
}

export function createAmbientScheduler(options: AmbientSchedulerOptions = {}): AmbientScheduler {
  const nowMs = options.nowMs ?? (() => performance.now());
  const limits = options.limits ?? AMBIENT_LIFE;
  const windows = new Map<string, Window>();
  let onChange = options.onChange;
  const reasons = new Set<AmbientReason>();
  /** Seconds of ambient time so far. */
  let ambient = 0;
  /** The real time up to which `ambient` has been accounted. */
  let last = nowMs();

  /** Accounts for the real time since the last call: ambient time passes only while windows are open. */
  function advance(): void {
    const t = nowMs();
    while (last < t) {
      if (windows.size === 0) {
        last = t;
        return;
      }
      let soonest = Infinity;
      for (const w of windows.values()) soonest = Math.min(soonest, w.end);
      const to = Math.min(t, soonest);
      ambient += (to - last) / 1000;
      last = to;
      if (to >= soonest) {
        for (const [id, w] of windows) if (w.end <= to) windows.delete(id);
      }
    }
  }

  const clock: AmbientClock = {
    now() {
      advance();
      return ambient;
    },
    active(id) {
      advance();
      return windows.has(id);
    },
    requestWindow(id, ms) {
      advance();
      if (reasons.size > 0) return false;
      if (!Number.isFinite(ms) || ms <= 0) return false;
      const t = nowMs();
      const wanted = Math.min(ms, limits.maxWindowMs);
      const open = windows.get(id);
      if (open) {
        // Asked again while open: it may run on, but never past `maxWindowMs` from when it began.
        open.end = Math.min(Math.max(open.end, t + wanted), open.start + limits.maxWindowMs);
        onChange?.();
        return true;
      }
      if (windows.size >= limits.maxConcurrent) return false;
      windows.set(id, { start: t, end: t + wanted });
      onChange?.();
      return true;
    },
  };

  return {
    clock,
    openIds() {
      advance();
      return [...windows.keys()];
    },
    nextEndMs() {
      advance();
      let soonest: number | null = null;
      for (const w of windows.values()) soonest = soonest === null ? w.end : Math.min(soonest, w.end);
      return soonest;
    },
    tick() {
      advance();
      return windows.size > 0;
    },
    setReason(reason, on) {
      if (!on) {
        reasons.delete(reason);
        return;
      }
      const first = reasons.size === 0;
      reasons.add(reason);
      if (first && windows.size > 0) {
        advance();
        windows.clear();
        onChange?.();
      }
    },
    suspended() {
      return reasons.size > 0;
    },
    setOnChange(listener) {
      onChange = listener ?? undefined;
    },
    dispose() {
      // Closes every window; a scheduler can be used again (a remounted scene shares it).
      advance();
      windows.clear();
    },
  };
}
