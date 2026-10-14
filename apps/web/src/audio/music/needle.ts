/**
 * The gramophone's needle and record, as a pure state machine: what the needle is doing, which
 * record is on, and what has to happen because of it. It knows nothing of audio or of time; the
 * store feeds it events (a verb, the record ending, a timer that came due) and carries out the
 * effects it returns. How loud, how far and how it sounds live elsewhere.
 *
 *   up ──play──▶ lead-in ──▶ playing ──ended──▶ run-out ──▶ gap ──▶ lead-in (the next record)
 *    ▲              │            │                 │         │
 *    └────────────────────── lift ───────────────────────────┘
 *
 *   change (from anywhere but `up`) ──▶ swap ──▶ lead-in
 *
 * `up` is the needle on its rest: silence and a still platter, and nothing starts from it but the
 * visitor. `lead-in` is the needle dropped and the surface crackle before the music. `run-out` is
 * the record's end, the needle in the groove for a few seconds. `gap` is the needle lifted by the
 * machine itself, the pause before the next record. `swap` is one record coming off and another
 * going on, after which the needle drops by itself.
 */

export type NeedleState = 'up' | 'lead-in' | 'playing' | 'run-out' | 'gap' | 'swap';

export interface GramophoneState {
  readonly needle: NeedleState;
  /** The record on the platter, as an index into the catalogue. */
  readonly record: number;
}

/** What the visitor can ask of the gramophone: its three verbs. */
export type Verb = 'play' | 'lift' | 'change';

export type NeedleEvent =
  | { readonly type: 'play' }
  | { readonly type: 'lift' }
  | { readonly type: 'change' }
  | { readonly type: 'lead-in-done' }
  | { readonly type: 'ended' }
  | { readonly type: 'run-out-done' }
  | { readonly type: 'gap-done' }
  | { readonly type: 'swap-done' }
  /** The record could not be played (no format, a failed load): the needle goes back to its rest. */
  | { readonly type: 'failed' };

export type Effect =
  /** The needle meets the record: a soft thump, then surface crackle. */
  | { readonly type: 'drop'; readonly record: number }
  /** The lead-in is over: the music itself begins. */
  | { readonly type: 'start-music'; readonly record: number }
  /** The needle leaves a record, by hand or by the machine: a small lift sound, and the music stops. */
  | { readonly type: 'lift'; readonly byHand: boolean }
  /** The record is over: the needle runs in the groove. */
  | { readonly type: 'run-out' }
  /** A record goes on the platter. */
  | { readonly type: 'swap'; readonly record: number }
  /** Deliver `event` after `afterMs`, in place of any timer already set. */
  | { readonly type: 'after'; readonly event: NeedleEvent['type']; readonly afterMs: number }
  | { readonly type: 'cancel-timer' };

export interface Step {
  readonly state: GramophoneState;
  readonly effects: readonly Effect[];
}

/** The arm's journey between its rest and the groove, which the sound keeps pace with (seconds). */
export const NEEDLE_TRAVEL_S = 0.85;
/** The lead-in: the arm's journey, then a turn of the record (78 rpm is 0.77 s) and a little over on the bare shellac. */
export const LEAD_IN_MS = 2300;
/** The needle in the run-out groove before it lifts. */
export const RUN_OUT_MS = 4200;
/** The pause between one record and the next, drawn between these (the brief: 8 to 15 s). */
export const GAP_MS = { min: 8000, max: 15000 } as const;
/** Taking one record off and putting another on. */
export const SWAP_MS = 900;

/** The needle is on the record: in its lead-in, playing, or in the run-out groove. */
export const needleDown = (needle: NeedleState): boolean => needle === 'lead-in' || needle === 'playing' || needle === 'run-out';

/** The platter turns while the needle is down. */
export const platterTurns = needleDown;

/** The verb the needle's own control offers: lift it while it is down, drop it otherwise. */
export const needleVerb = (needle: NeedleState): 'play' | 'lift' => (needleDown(needle) ? 'lift' : 'play');

const stay = (state: GramophoneState): Step => ({ state, effects: [] });

const drop = (record: number): readonly Effect[] => [{ type: 'drop', record }, { type: 'after', event: 'lead-in-done', afterMs: LEAD_IN_MS }];

/**
 * One step of the machine. `records` is how many are on the shelf; `gapMs` is the pause to use if
 * the machine ends up waiting (the store draws it, so this stays pure).
 */
export function step(state: GramophoneState, event: NeedleEvent, records: number, gapMs: number): Step {
  const nextRecord = (record: number): number => (records > 0 ? (record + 1) % records : 0);
  switch (event.type) {
    case 'play':
      if (records === 0 || needleDown(state.needle)) return stay(state);
      // From the rest, the pause between records or the swap: the needle goes down on the record on the platter.
      return { state: { needle: 'lead-in', record: state.record }, effects: [{ type: 'cancel-timer' }, ...drop(state.record)] };

    case 'lift':
      if (state.needle === 'up') return stay(state);
      // The machine's own pause and a swap have no needle on the record: nothing to lift, but they stop.
      return {
        state: { needle: 'up', record: state.record },
        effects: needleDown(state.needle) ? [{ type: 'cancel-timer' }, { type: 'lift', byHand: true }] : [{ type: 'cancel-timer' }],
      };

    case 'change': {
      if (records === 0) return stay(state);
      const record = nextRecord(state.record);
      if (state.needle === 'up') return { state: { needle: 'up', record }, effects: [{ type: 'swap', record }] };
      return {
        state: { needle: 'swap', record },
        effects: [
          { type: 'cancel-timer' },
          ...(needleDown(state.needle) ? ([{ type: 'lift', byHand: true }] as const) : []),
          { type: 'swap', record },
          { type: 'after', event: 'swap-done', afterMs: SWAP_MS },
        ],
      };
    }

    case 'swap-done':
      if (state.needle !== 'swap') return stay(state);
      return { state: { needle: 'lead-in', record: state.record }, effects: drop(state.record) };

    case 'lead-in-done':
      if (state.needle !== 'lead-in') return stay(state);
      return { state: { needle: 'playing', record: state.record }, effects: [{ type: 'start-music', record: state.record }] };

    case 'ended':
      if (state.needle !== 'playing') return stay(state);
      return { state: { needle: 'run-out', record: state.record }, effects: [{ type: 'run-out' }, { type: 'after', event: 'run-out-done', afterMs: RUN_OUT_MS }] };

    case 'run-out-done':
      if (state.needle !== 'run-out') return stay(state);
      return {
        state: { needle: 'gap', record: nextRecord(state.record) },
        effects: [{ type: 'lift', byHand: false }, { type: 'after', event: 'gap-done', afterMs: gapMs }],
      };

    case 'gap-done':
      if (state.needle !== 'gap') return stay(state);
      return { state: { needle: 'lead-in', record: state.record }, effects: drop(state.record) };

    case 'failed':
      if (state.needle === 'up') return stay(state);
      return {
        state: { needle: 'up', record: state.record },
        effects: needleDown(state.needle) ? [{ type: 'cancel-timer' }, { type: 'lift', byHand: false }] : [{ type: 'cancel-timer' }],
      };
  }
}
