import type { Target } from './reading.ts';

/**
 * When the gramophone's verb label appears. Controls are contextual, never floating (the founder's
 * rule, art consult 6's numbers): a verb shows only when the visitor is near something and looking
 * at it, after a short wait, one at a time, and goes when they move away, look away, or the thing
 * is hidden. It is pure arithmetic on how the camera sees each fitting, so a test can hold every
 * number to the brief without a camera.
 *
 * It is the gramophone's own, because the corridor's general cue system knows the twelve props and
 * the doors; the numbers are the same ones, and it can be replaced by that system with one change
 * (see the report).
 */
export const CUE = {
  /** Eligible within this many metres of a fitting, ... */
  eligibleM: 2.2,
  /** ... and within this many degrees of the middle of the view (a half-angle). */
  eligibleDeg: 25,
  /** Shown once it has been eligible this long. */
  showAfterMs: 250,
  /** The label fades in and out over this long (the page's CSS). */
  fadeMs: 120,
  /** Hidden beyond this many metres, ... */
  hideM: 2.7,
  /** ... outside this many degrees, ... */
  hideDeg: 35,
  /** ... or once it has been occluded this long. */
  occludedMs: 350,
} as const;

/** How the camera sees one fitting. */
export interface CueView {
  /** Metres from the eye. */
  readonly distance: number;
  /** Degrees between the view direction and the fitting. */
  readonly angleDeg: number;
  /** Something is in the way, or the fitting faces away. */
  readonly occluded: boolean;
}

export interface CueState {
  /** The label on screen, if any. */
  readonly shown: Target | null;
  /** The best eligible target and since when, while the wait is running. */
  readonly waiting: { readonly target: Target; readonly since: number } | null;
  /** Since when the shown target has been occluded. */
  readonly occludedSince: number | null;
}

export const NO_CUE: CueState = { shown: null, waiting: null, occludedSince: null };

export type CueViews = Readonly<Record<Target, CueView | null>>;

const eligible = (v: CueView | null): v is CueView => v !== null && v.distance <= CUE.eligibleM && v.angleDeg <= CUE.eligibleDeg && !v.occluded;

/** One step. `nowMs` is any monotonic clock, in milliseconds. */
export function stepCue(prev: CueState, views: CueViews, nowMs: number): CueState {
  // A label on screen stays until it is beyond the hide limits, or occluded long enough.
  if (prev.shown !== null) {
    const v = views[prev.shown];
    if (v === null || v.distance > CUE.hideM || v.angleDeg > CUE.hideDeg) return NO_CUE;
    if (v.occluded) {
      const since = prev.occludedSince ?? nowMs;
      return nowMs - since >= CUE.occludedMs ? NO_CUE : { shown: prev.shown, waiting: null, occludedSince: since };
    }
    return prev.occludedSince === null ? prev : { shown: prev.shown, waiting: null, occludedSince: null };
  }

  // Nothing shown: the eligible target looked at most directly, nearest on a tie, earns the label by waiting.
  const targets = (Object.keys(views) as Target[]).filter((t) => eligible(views[t]));
  if (targets.length === 0) return NO_CUE;
  targets.sort((a, b) => {
    const va = views[a] as CueView;
    const vb = views[b] as CueView;
    return va.angleDeg - vb.angleDeg || va.distance - vb.distance;
  });
  const best = targets[0] as Target;
  const since = prev.waiting?.target === best ? prev.waiting.since : nowMs;
  if (nowMs - since >= CUE.showAfterMs) return { shown: best, waiting: null, occludedSince: null };
  return { shown: null, waiting: { target: best, since }, occludedSince: null };
}
