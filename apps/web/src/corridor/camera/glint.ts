/**
 * The idle glint (ADR 0004, "Interactive cues"): the corridor's quiet way of saying that some things
 * can be touched. At hand-over the notice board's brass pin catches one 800 ms highlight. After
 * that, one nearby actionable object glints for 600 ms every 18 to 25 seconds, never two at once,
 * and none at all under reduced motion. How bright is the world's business (about 8% at most);
 * this decides which object, when, and the shape of the swell.
 *
 * It reads a real clock and is polled, so a shell can sleep between glints and wake for the next.
 */

export const GLINT = {
  /** The board pin's single highlight, at hand-over. */
  boardMs: 800,
  /** Every later glint. */
  objectMs: 600,
  /** The quiet between one glint's end and the next one's start. */
  minGapMs: 18_000,
  maxGapMs: 25_000,
  /** With nothing nearby to glint, look again after this. */
  retryMs: 2_500,
} as const;

export type GlintTarget =
  | { kind: 'board' }
  | { kind: 'prop'; id: string }
  | { kind: 'door'; id: string };

export const targetKey = (target: GlintTarget): string => (target.kind === 'board' ? 'board' : `${target.kind}:${target.id}`);

export interface GlintFrame {
  target: GlintTarget;
  /** 0 to 1: a smooth swell, nothing at the ends, full at the middle. */
  value: number;
}

export interface GlintContext {
  /** False under reduced motion, while the scene is hidden, off screen or covered, and whenever the visitor is busy. */
  enabled: boolean;
  /** What could glint now: actionable, near and in view. Asked only when a glint is due. */
  candidates(): readonly GlintTarget[];
  /** Asked to open the render window a glint needs; false means try again later. */
  begin?(ms: number): boolean;
}

export interface GlintScheduler {
  /** The visitor has the view at the starting position: the board pin's glint is due. */
  arrived(): void;
  /** Advances to now; returns the glint showing, if any. */
  poll(context: GlintContext): GlintFrame | null;
  /** Milliseconds until the next change (a glint due, or the showing one ending); null when nothing is pending. */
  nextWakeMs(): number | null;
  /** Forgets everything (a new visit to the corridor). */
  reset(): void;
}

export interface GlintOptions {
  nowMs?: () => number;
  random?: () => number;
}

/** A smooth swell from 0 through 1 and back to 0 as `u` goes 0 to 1. */
export const swell = (u: number): number => {
  if (u <= 0 || u >= 1) return 0;
  const s = Math.sin(Math.PI * u);
  return s * s;
};

export function createGlintScheduler(options: GlintOptions = {}): GlintScheduler {
  const nowMs = options.nowMs ?? (() => performance.now());
  const random = options.random ?? Math.random;
  let current: { target: GlintTarget; start: number; ms: number } | null = null;
  /** When the next object glint is due; null until the first quiet interval has been started. */
  let dueAt: number | null = null;
  /** After a refusal (no render window free, nothing nearby), not before this. */
  let blockedUntil = 0;
  let boardPending = false;
  let wasEnabled = false;

  const gap = () => GLINT.minGapMs + random() * (GLINT.maxGapMs - GLINT.minGapMs);

  return {
    arrived() {
      boardPending = true;
    },

    poll(context) {
      const t = nowMs();
      if (!context.enabled) {
        // Nothing glints while the visitor is busy or the scene is quiet; the interval starts afresh after.
        current = null;
        dueAt = null;
        blockedUntil = 0;
        wasEnabled = false;
        return null;
      }
      if (!wasEnabled) {
        wasEnabled = true;
        dueAt = null;
      }
      if (current) {
        const u = (t - current.start) / current.ms;
        if (u < 1) return { target: current.target, value: swell(u) };
        current = null;
        dueAt = t + gap();
      }
      if (t < blockedUntil) return null;
      if (boardPending) {
        if (context.begin && !context.begin(GLINT.boardMs)) {
          blockedUntil = t + GLINT.retryMs;
          return null;
        }
        boardPending = false;
        current = { target: { kind: 'board' }, start: t, ms: GLINT.boardMs };
        return { target: current.target, value: 0 };
      }
      if (dueAt === null) dueAt = t + gap();
      if (t < dueAt) return null;
      const candidates = context.candidates();
      if (candidates.length === 0 || (context.begin && !context.begin(GLINT.objectMs))) {
        blockedUntil = t + GLINT.retryMs;
        return null;
      }
      const target = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))] as GlintTarget;
      current = { target, start: t, ms: GLINT.objectMs };
      return { target, value: 0 };
    },

    nextWakeMs() {
      if (!wasEnabled) return null;
      const t = nowMs();
      if (current) return Math.max(0, current.start + current.ms - t);
      const free = Math.max(0, blockedUntil - t);
      if (boardPending) return free;
      if (dueAt !== null) return Math.max(free, dueAt - t);
      return null;
    },

    reset() {
      current = null;
      dueAt = null;
      blockedUntil = 0;
      boardPending = false;
      wasEnabled = false;
    },
  };
}
