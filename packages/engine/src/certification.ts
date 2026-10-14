import type { OfficeSoundKind } from './office/objects.ts';
/**
 * The Certification Office as one deterministic finite state machine.
 *
 * Every input path — 3D pointer, touch, DOM button, keyboard, assistive-technology click —
 * dispatches the same events into `transition`. Renderers (WebGL scene, semantic DOM
 * mode) and side effects (sound, captions) only read state and cues; they never decide.
 */
import {
  AFTERMATH,
  ESCALATION,
  INITIAL_DISPLAY,
  STILLNESS_LINE,
  type MachineLine,
  type MemoSource,
} from './copy.ts';

/** The fifth completed stamp overloads the machine. */
export const OVERLOAD_AT = ESCALATION.length;

/** Milliseconds without a press before the machine notices the stillness. */
export const STILLNESS_MS = 20_000;

export type Phase =
  /** No evidence submitted yet. */
  | 'awaiting'
  /** Stamps 1..4: each approval exposes another condition. */
  | 'escalating'
  /** The machine has discovered it has no receiving authority. */
  | 'overloaded';

export interface MemoState {
  readonly revealed: boolean;
  /** Which discovery path revealed it first; later paths do not overwrite it. */
  readonly source: MemoSource | null;
  readonly open: boolean;
}

export interface CertificationState {
  /** Completed stamp actions (press followed by release). */
  readonly stamps: number;
  /** True while the stamp is held against the paper. */
  readonly pressing: boolean;
  readonly phase: Phase;
  readonly display: string;
  /** Text of the most recent receipt, or null before the first one. */
  readonly receipt: string | null;
  readonly stillnessNoticed: boolean;
  readonly memo: MemoState;
}

export type CertificationEvent =
  /** Stamp makes contact with the paper (pointer down, key down). */
  | { readonly type: 'PRESS' }
  /** Stamp lifts (pointer up or cancel, key up, window blur while held). */
  | { readonly type: 'RELEASE' }
  /** STILLNESS_MS elapsed with no press. Dispatched by the host's timer. */
  | { readonly type: 'STILLNESS' }
  | { readonly type: 'OPEN_MEMO' }
  | { readonly type: 'CLOSE_MEMO' }
  | { readonly type: 'RESET' };

/**
 * One-shot side-effect requests derived from a transition. Sound, captions and
 * one-shot animations subscribe to these; they carry no authority over state.
 */
export type Cue =
  | { readonly type: 'object'; readonly kind: OfficeSoundKind }
  | { readonly type: 'contact' }
  | { readonly type: 'lift' }
  /** The machine prints a reply. `step` is the 1-based stamp count that caused it. */
  | { readonly type: 'reply'; readonly step: number; readonly line: MachineLine }
  | { readonly type: 'overload' }
  | { readonly type: 'stillness' }
  | { readonly type: 'memo-revealed'; readonly source: MemoSource }
  | { readonly type: 'memo-opened' }
  | { readonly type: 'memo-closed' }
  | { readonly type: 'reset' };

export interface Transition {
  readonly state: CertificationState;
  readonly cues: readonly Cue[];
}

export const initialState: CertificationState = {
  stamps: 0,
  pressing: false,
  phase: 'awaiting',
  display: INITIAL_DISPLAY,
  receipt: null,
  stillnessNoticed: false,
  memo: { revealed: false, source: null, open: false },
};

/** The machine's reply to the `step`th completed stamp (1-based). */
export function replyFor(step: number): MachineLine {
  if (step < 1) throw new RangeError(`step must be >= 1, got ${step}`);
  if (step <= ESCALATION.length) return lineAt(ESCALATION, step - 1);
  return lineAt(AFTERMATH, (step - ESCALATION.length - 1) % AFTERMATH.length);
}

function lineAt(lines: readonly MachineLine[], index: number): MachineLine {
  const line = lines[index];
  if (line === undefined) throw new RangeError(`no machine line at index ${index}`);
  return line;
}

function revealMemo(memo: MemoState, source: MemoSource): MemoState {
  return memo.revealed ? memo : { revealed: true, source, open: false };
}

export function transition(state: CertificationState, event: CertificationEvent): Transition {
  switch (event.type) {
    case 'PRESS': {
      if (state.pressing) return { state, cues: [] };
      return { state: { ...state, pressing: true }, cues: [{ type: 'contact' }] };
    }

    case 'RELEASE': {
      if (!state.pressing) return { state, cues: [] };
      const step = state.stamps + 1;
      const line = replyFor(step);
      const cues: Cue[] = [{ type: 'lift' }, { type: 'reply', step, line }];
      let phase: Phase = state.phase === 'overloaded' ? 'overloaded' : 'escalating';
      let memo = state.memo;
      if (step === OVERLOAD_AT) {
        phase = 'overloaded';
        cues.push({ type: 'overload' });
        if (!memo.revealed) {
          memo = revealMemo(memo, 'overload');
          cues.push({ type: 'memo-revealed', source: 'overload' });
        }
      }
      return {
        state: {
          ...state,
          stamps: step,
          pressing: false,
          phase,
          display: line.display,
          receipt: line.receipt,
          memo,
        },
        cues,
      };
    }

    case 'STILLNESS': {
      // Stopping is a discovery path, but only once, and never while the stamp is held.
      if (state.pressing || state.stillnessNoticed || state.memo.revealed) {
        return { state, cues: [] };
      }
      return {
        state: {
          ...state,
          stillnessNoticed: true,
          display: STILLNESS_LINE.display,
          receipt: STILLNESS_LINE.receipt,
          memo: revealMemo(state.memo, 'stillness'),
        },
        cues: [{ type: 'stillness' }, { type: 'memo-revealed', source: 'stillness' }],
      };
    }

    case 'OPEN_MEMO': {
      if (!state.memo.revealed || state.memo.open) return { state, cues: [] };
      return {
        state: { ...state, memo: { ...state.memo, open: true } },
        cues: [{ type: 'memo-opened' }],
      };
    }

    case 'CLOSE_MEMO': {
      if (!state.memo.open) return { state, cues: [] };
      return {
        state: { ...state, memo: { ...state.memo, open: false } },
        cues: [{ type: 'memo-closed' }],
      };
    }

    case 'RESET':
      return { state: initialState, cues: [{ type: 'reset' }] };
  }
}
