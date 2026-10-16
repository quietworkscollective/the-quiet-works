import type { PropAnimation, PropId } from '../props.ts';

/**
 * The per-frame state the props lane reads (ADR 0004): hover or focus `attention` on each prop's
 * ivory fitting, the prop's own `action` from 0 to 1, and the rare idle `glint`. This module owns
 * the numbers and their timing; the world draws them.
 *
 * `action` is one timeline per activation: it rises 0 -> 1 over `riseMs`, holds at 1 for `holdMs`
 * (the opened drawer, the read card), and falls 1 -> 0 over `returnMs` (the drawer closing, the
 * piece going back). A prop whose end state looks like its rest state (a wheel that has spun down)
 * has `returnMs: 0` and cuts back to 0 at the end of the hold. Activating a prop while it holds
 * starts the return early; while it is rising or falling the activation is ignored.
 */

/** Hover emphasis reaches full strength in this long (ADR: within 100-150 ms) and fades a little slower. */
export const ATTENTION_RISE_MS = 120;
export const ATTENTION_FALL_MS = 150;

export interface ActionTiming {
  riseMs: number;
  holdMs: number;
  returnMs: number;
}

/**
 * How long each prop's action takes. The wheel spins down over 3 s (art consult 5); the rest are
 * under a second to rise, with a hold long enough to see (or, where there is a label, to read) what
 * the action revealed.
 */
export const ACTION_TIMING: Readonly<Record<PropId, ActionTiming>> = {
  'trophy-cabinet': { riseMs: 900, holdMs: 3400, returnMs: 800 },
  'team-photo': { riseMs: 500, holdMs: 3400, returnMs: 500 },
  'watering-can': { riseMs: 1200, holdMs: 1600, returnMs: 900 },
  football: { riseMs: 1400, holdMs: 700, returnMs: 900 },
  'cricket-bat': { riseMs: 1400, holdMs: 700, returnMs: 900 },
  'team-shirts': { riseMs: 900, holdMs: 2400, returnMs: 800 },
  'walking-boots': { riseMs: 900, holdMs: 2600, returnMs: 800 },
  'repair-kit': { riseMs: 900, holdMs: 3200, returnMs: 800 },
  'bicycle-wheel': { riseMs: 3000, holdMs: 400, returnMs: 0 },
  'recipe-drawer': { riseMs: 900, holdMs: 3800, returnMs: 800 },
  chess: { riseMs: 800, holdMs: 1900, returnMs: 800 },
  'work-glove': { riseMs: 900, holdMs: 2400, returnMs: 800 },
};

type Phase = 'idle' | 'rise' | 'hold' | 'return';

interface Run {
  phase: Phase;
  /** Milliseconds into the phase (rise and return). */
  t: number;
  /** When a hold ends, on the real clock: nothing is drawn while it holds, so it cannot be counted in frames. */
  holdEnd: number;
}

export interface PropMotion {
  /** Sets whether the visitor's pointer, focus or framing is on a prop: it lightens and, when it lets go, fades. */
  setEmphasis(id: PropId, on: boolean): void;
  /** Starts a prop's action. False when it is already moving (rising or falling). */
  trigger(id: PropId): boolean;
  /** Sets the idle glint on a prop, 0 to 1. */
  setGlint(id: PropId, value: number): void;
  /** True while a prop's action is running or held. */
  running(id: PropId): boolean;
  /** Which props' actions are running or held. */
  runningIds(): readonly PropId[];
  /** Advances by `dtMs`; true while another frame is needed (not while an action only holds). */
  step(dtMs: number): boolean;
  /** Milliseconds until the soonest hold ends, so the shell can wake for it; null when none holds. */
  nextWakeMs(): number | null;
  /** Everything back to rest (leaving the corridor, reduced motion switched on). */
  reset(): void;
}

export interface PropMotionOptions {
  reduced(): boolean;
  /** The real clock in milliseconds. */
  nowMs?: () => number;
  /** Called when an action finishes its whole timeline. */
  onSettled?(id: PropId): void;
}

export function createPropMotion(animation: PropAnimation, options: PropMotionOptions): PropMotion {
  const ids = Object.keys(animation) as PropId[];
  const nowMs = options.nowMs ?? (() => performance.now());
  const emphasis = new Map<PropId, boolean>();
  const runs = new Map<PropId, Run>();

  function step(dtMs: number): boolean {
    const dt = Math.max(0, dtMs);
    let busy = false;
    for (const id of ids) {
      const m = animation[id];

      // Hover and focus: a linear ramp, so it arrives at a known time.
      const want = emphasis.get(id) === true ? 1 : 0;
      if (m.attention !== want) {
        const rate = dt / (want === 1 ? ATTENTION_RISE_MS : ATTENTION_FALL_MS);
        m.attention = want === 1 ? Math.min(1, m.attention + rate) : Math.max(0, m.attention - rate);
        if (m.attention !== want) busy = true;
      }

      const run = runs.get(id);
      if (!run) continue;
      const timing = ACTION_TIMING[id];
      const reduced = options.reduced();
      if (run.phase === 'rise') {
        run.t += dt;
        if (!reduced && run.t < timing.riseMs) {
          m.action = run.t / timing.riseMs;
          busy = true;
          continue;
        }
        run.phase = 'hold';
        run.holdEnd = nowMs() + timing.holdMs;
        m.action = 1;
      }
      if (run.phase === 'hold') {
        // Nothing moves while it holds, so no frames are drawn: the shell wakes at `nextWakeMs`.
        if (nowMs() < run.holdEnd) continue;
        run.phase = 'return';
        run.t = 0;
        busy = true;
        continue;
      }
      run.t += dt;
      if (reduced || run.t >= timing.returnMs) {
        m.action = 0;
        runs.delete(id);
        options.onSettled?.(id);
        continue;
      }
      m.action = 1 - run.t / timing.returnMs;
      busy = true;
    }
    return busy;
  }

  return {
    setEmphasis(id, on) {
      emphasis.set(id, on);
    },
    trigger(id) {
      const run = runs.get(id);
      if (!run) {
        runs.set(id, { phase: 'rise', t: 0, holdEnd: 0 });
        return true;
      }
      if (run.phase === 'hold') {
        // Activated again while it holds: let it go now.
        run.phase = 'return';
        run.t = 0;
        return true;
      }
      return false;
    },
    setGlint(id, value) {
      animation[id].glint = Math.max(0, Math.min(1, value));
    },
    nextWakeMs() {
      let soonest: number | null = null;
      for (const run of runs.values()) {
        if (run.phase !== 'hold') continue;
        const left = Math.max(0, run.holdEnd - nowMs());
        soonest = soonest === null ? left : Math.min(soonest, left);
      }
      return soonest;
    },
    running: (id) => runs.has(id),
    runningIds: () => [...runs.keys()],
    step,
    reset() {
      runs.clear();
      emphasis.clear();
      for (const id of ids) {
        const m = animation[id];
        m.attention = 0;
        m.action = 0;
        m.glint = 0;
      }
    },
  };
}
