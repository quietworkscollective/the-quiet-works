import { sameCueTarget, type CueTarget } from './cueText.ts';
import { CUE_TUNING, type CueTuning } from './cueTuning.ts';
import type { Found } from './context.ts';

/**
 * The timing of a contextual cue (art consult 6): a thing must be the steady target for 250 ms
 * before its label appears (so walking past a door is not a flash of text), one label at a time; it
 * is dropped at once when it leaves the (looser) limits that `find` applies, or after 350 ms behind
 * a wall; and it fades out over the same short time it faded in. The tracker holds no geometry:
 * it is fed the latest `find` result and the clock, and says what should be on screen.
 */
export interface TrackerView {
  /** The thing whose label is on screen (fading out when `visible` is false), or null for none. */
  target: CueTarget | null;
  visible: boolean;
}

export interface CueTracker {
  /** Feeds the latest finding (null: nothing found) and returns what is on screen now. */
  update(found: Found | null): TrackerView;
  view(): TrackerView;
  /** Milliseconds until the view would change by itself (a dwell completes, a fade ends), or null. */
  nextWakeMs(): number | null;
  reset(): void;
}

export interface CueTrackerOptions {
  nowMs?: () => number;
  tuning?: CueTuning;
  /** Under reduced motion a label does not fade: it goes the moment it is dropped. */
  reduced?: () => boolean;
}

export function createCueTracker(options: CueTrackerOptions = {}): CueTracker {
  const nowMs = options.nowMs ?? (() => performance.now());
  const tuning = options.tuning ?? CUE_TUNING;
  const reduced = options.reduced ?? (() => false);

  let shown: CueTarget | null = null;
  let pending: { target: CueTarget; since: number } | null = null;
  let occludedSince: number | null = null;
  let leaving: { target: CueTarget; until: number } | null = null;

  function drop(now: number): void {
    if (!shown) return;
    const ms = reduced() ? 0 : tuning.fadeOutMs;
    leaving = ms > 0 ? { target: shown, until: now + ms } : null;
    shown = null;
    occludedSince = null;
  }

  function view(now: number = nowMs()): TrackerView {
    if (shown) return { target: shown, visible: true };
    if (leaving) {
      if (now < leaving.until) return { target: leaving.target, visible: false };
      leaving = null;
    }
    return { target: null, visible: false };
  }

  return {
    update(found) {
      const now = nowMs();
      if (shown) {
        if (found && sameCueTarget(found.target, shown)) {
          pending = null;
          if (found.blocked) {
            occludedSince ??= now;
            if (now - occludedSince >= tuning.occludedMs) drop(now);
          } else {
            occludedSince = null;
          }
          return view(now);
        }
        // Gone (out of the loose limits) or clearly outranked: it goes, and anything else starts its wait.
        drop(now);
      }
      if (found && !found.blocked) {
        if (pending && sameCueTarget(pending.target, found.target)) {
          if (now - pending.since >= tuning.dwellMs) {
            shown = pending.target;
            pending = null;
            leaving = null;
          }
        } else {
          pending = { target: found.target, since: now };
        }
      } else {
        pending = null;
      }
      return view(now);
    },
    view: () => view(),
    nextWakeMs() {
      const now = nowMs();
      let soonest: number | null = null;
      const note = (ms: number) => {
        soonest = soonest === null ? ms : Math.min(soonest, ms);
      };
      if (pending) note(Math.max(0, pending.since + tuning.dwellMs - now));
      if (shown && occludedSince !== null) note(Math.max(0, occludedSince + tuning.occludedMs - now));
      if (leaving) note(Math.max(0, leaving.until - now));
      return soonest;
    },
    reset() {
      shown = null;
      pending = null;
      occludedSince = null;
      leaving = null;
    },
  };
}
