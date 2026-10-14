import { OFFICE_PRESS_TIMING, type CertificationStore, type Cue, type MachineLine, type MemoSource } from '@tqw/engine';
import { TIMING } from '../../../timing.ts';

/**
 * Cue timing resolved once, for every scene component.
 *
 * The store emits cues the instant state changes. The scene wants a timeline: when the stamp
 * touches the paper, when the lift actually begins, when the printer starts. The Director turns
 * each cue into an event stamped with absolute `performance.now()` times, using the Office physical profile: contact at T touches at T + 180 ms,
 * and lift at R starts at max(R, T + 180 ms + minDwellMs). Components subscribe here instead of re-deriving that.
 */

export type DirectorEvent =
  | { readonly type: 'contact'; readonly at: number; readonly touchAt: number }
  | {
      readonly type: 'lift';
      /** When the lift starts (never earlier than the minimum dwell). */
      readonly at: number;
      /** Stamp count including this one: the imprint index. */
      readonly n: number;
    }
  | {
      readonly type: 'reply';
      readonly step: number;
      readonly line: MachineLine;
      readonly printAt: number;
      readonly printEnd: number;
    }
  | { readonly type: 'overload'; readonly at: number }
  | { readonly type: 'stillness'; readonly at: number }
  | {
      readonly type: 'memo-revealed';
      readonly source: MemoSource;
      /** When the hatch starts to open. */
      readonly hatchAt: number;
      /** When the memo starts to slide out. */
      readonly slideAt: number;
    }
  | { readonly type: 'reset' };

/** Quiet (stillness) hatch opening: slow, no bell, no shake. */
export const QUIET_HATCH_MS = 900;

/**
 * Offsets inside the fifth-stamp overload, in ms after the printer finishes (S + printMs).
 * Latch and landing follow the shared choreography in TIMING, which the sound desk
 * schedules too, so the hatch lands on its clang.
 */
export const OVERLOAD_SCRIPT = {
  /** Display flickers, then shows the final line. */
  stutterEnd: 430,
  /** Legacy interval retained for the existing director timing contract; the bell stays still. */
  bellEnd: TIMING.bellRingMs,
  /** The hatch unlatches (a small pop), hangs, then falls, landing at S + overloadMs. */
  unlatchAt: TIMING.overloadMs - TIMING.printMs - TIMING.overloadLatchLeadMs,
  hangMs: 250,
  /** Spilled receipts start leaving the slot at these offsets. */
  receiptsAt: 180,
} as const;

export type DirectorListener = (event: DirectorEvent) => void;

export class Director {
  private readonly listeners = new Set<DirectorListener>();
  private detach: (() => void) | null = null;
  private contactCueAt = Number.NEGATIVE_INFINITY;
  private liftAt = Number.NEGATIVE_INFINITY;
  private printEnd = 0;
  private overloadAt = 0;
  private invalidateFn: (() => void) | null = null;

  constructor(private readonly store: CertificationStore) {}

  /** Wire the render loop so every event produces at least one frame. */
  setInvalidate(fn: (() => void) | null): void {
    this.invalidateFn = fn;
  }

  /** Start listening to the store. Returns the cleanup. */
  attach(): () => void {
    this.detach?.();
    const off = this.store.onCue((cue) => this.handle(cue, performance.now()));
    this.detach = () => {
      off();
      this.detach = null;
    };
    return this.detach;
  }

  subscribe(listener: DirectorListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: DirectorEvent): void {
    for (const listener of [...this.listeners]) listener(event);
    this.invalidateFn?.();
  }

  private handle(cue: Cue, now: number): void {
    switch (cue.type) {
      case 'contact': {
        this.contactCueAt = now;
        this.emit({ type: 'contact', at: now, touchAt: now + OFFICE_PRESS_TIMING.contactMs });
        return;
      }
      case 'lift': {
        const earliest = this.contactCueAt + OFFICE_PRESS_TIMING.contactMs + TIMING.minDwellMs;
        this.liftAt = Math.max(now, earliest);
        this.emit({ type: 'lift', at: this.liftAt, n: this.store.getState().stamps });
        return;
      }
      case 'reply': {
        const printAt = this.liftAt + TIMING.replyDelayMs;
        this.printEnd = printAt + TIMING.printMs;
        this.emit({ type: 'reply', step: cue.step, line: cue.line, printAt, printEnd: this.printEnd });
        return;
      }
      case 'overload': {
        this.overloadAt = this.printEnd;
        this.emit({ type: 'overload', at: this.overloadAt });
        return;
      }
      case 'stillness': {
        this.emit({ type: 'stillness', at: now });
        return;
      }
      case 'memo-revealed': {
        if (cue.source === 'overload') {
          const hatchAt = this.overloadAt + OVERLOAD_SCRIPT.unlatchAt;
          this.emit({
            type: 'memo-revealed',
            source: 'overload',
            hatchAt,
            slideAt: this.overloadAt + TIMING.overloadMs - TIMING.printMs + TIMING.memoAfterLandMs,
          });
        } else {
          this.emit({
            type: 'memo-revealed',
            source: 'stillness',
            hatchAt: now,
            slideAt: now + QUIET_HATCH_MS,
          });
        }
        return;
      }
      case 'reset': {
        this.contactCueAt = Number.NEGATIVE_INFINITY;
        this.liftAt = Number.NEGATIVE_INFINITY;
        this.printEnd = 0;
        this.overloadAt = 0;
        this.emit({ type: 'reset' });
        return;
      }
      case 'object':
      case 'memo-opened':
      case 'memo-closed':
        return;
    }
  }
}
