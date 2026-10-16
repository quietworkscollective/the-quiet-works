import type { OfficeSoundKind } from './office/objects.ts';
import { AFTERMATH, ESCALATION, INITIAL_DISPLAY, type MachineLine, type MemoSource } from './copy.ts';
import type { OfficePlayStep } from './office/play.ts';

/** Kept as an inactive legacy threshold; normal play now submits one application only. */
export const OVERLOAD_AT = 5;

export type Phase = 'awaiting' | 'escalating' | 'overloaded' | 'resolved';

export interface MemoState {
  readonly revealed: boolean;
  readonly source: MemoSource | null;
  readonly open: boolean;
}

export interface CertificationState {
  /** The form is submitted once; later press attempts never create another impression. */
  readonly stamps: number;
  readonly pressing: boolean;
  readonly processing: boolean;
  readonly phase: Phase;
  readonly playStep: OfficePlayStep;
  readonly display: string;
  readonly receipt: string | null;
  readonly stillnessNoticed: boolean;
  readonly memo: MemoState;
}

export type CertificationEvent =
  | { readonly type: 'PRESS' }
  | { readonly type: 'RELEASE' }
  | { readonly type: 'RESPONSE_SETTLED'; readonly step: number }
  | { readonly type: 'STILLNESS' }
  | { readonly type: 'DRAWER_OPENED' }
  | { readonly type: 'INSPECTION_MARKED' }
  | { readonly type: 'PULL_HATCH' }
  | { readonly type: 'RESTORE_PLAY'; readonly step: OfficePlayStep }
  | { readonly type: 'OPEN_MEMO' }
  | { readonly type: 'CLOSE_MEMO' }
  | { readonly type: 'RESET' };

export type Cue =
  | { readonly type: 'object'; readonly kind: OfficeSoundKind }
  | { readonly type: 'contact' }
  | { readonly type: 'lift' }
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
  processing: false,
  phase: 'awaiting',
  playStep: 'ready',
  display: INITIAL_DISPLAY,
  receipt: null,
  stillnessNoticed: false,
  memo: { revealed: false, source: null, open: false },
};

/** The authored press reply, retained for the printer animation and its unit tests. */
export function replyFor(step: number): MachineLine {
  if (!Number.isSafeInteger(step) || step < 1) throw new RangeError(`step must be >= 1, got ${step}`);
  if (step === 1) return lineAt(ESCALATION, 0);
  return lineAt(AFTERMATH, (step - 2) % AFTERMATH.length);
}

function lineAt(lines: readonly MachineLine[], index: number): MachineLine {
  const line = lines[index];
  if (line === undefined) throw new RangeError(`no machine line at index ${index}`);
  return line;
}

function lineForStage(step: OfficePlayStep): MachineLine {
  switch (step) {
    case 'ready':
      return replyFor(1);
    case 'refused':
      return { display: 'APPLICATION ALREADY RECEIVED', receipt: 'INSPECTION COPY: DESK DRAWER' };
    case 'drawer-open':
      return lineAt(AFTERMATH, 0);
    case 'inspection-recorded':
      return lineAt(AFTERMATH, 1);
    case 'resolved':
      return lineAt(AFTERMATH, 2);
  }
}

function phaseForStep(step: OfficePlayStep): Phase {
  if (step === 'ready') return 'awaiting';
  if (step === 'resolved') return 'resolved';
  return 'escalating';
}

function restoredState(step: OfficePlayStep): CertificationState {
  if (step === 'ready') return initialState;
  const complete = step === 'resolved';
  const line = step === 'inspection-recorded'
    ? { display: 'INSPECTION RECORDED', receipt: 'FRONT HATCH RELEASED — PULL TO OPEN' }
    : step === 'resolved'
      ? { display: 'INSPECTION COMPLETE', receipt: 'NO AUTHORITY INSTALLED TO APPROVE APPLICATIONS' }
      : replyFor(1);
  return {
    ...initialState,
    stamps: 1,
    phase: phaseForStep(step),
    playStep: step,
    display: line.display,
    receipt: line.receipt,
    memo: complete ? { revealed: true, source: 'inspection', open: false } : initialState.memo,
  };
}

function revealMemo(memo: MemoState, source: MemoSource): MemoState {
  return memo.revealed ? memo : { revealed: true, source, open: false };
}

export function transition(state: CertificationState, event: CertificationEvent): Transition {
  switch (event.type) {
    case 'PRESS':
      if (state.pressing || state.processing) return { state, cues: [] };
      return { state: { ...state, pressing: true, processing: true }, cues: [{ type: 'contact' }] };

    case 'RELEASE': {
      if (!state.pressing) return { state, cues: [] };
      const firstSubmission = state.playStep === 'ready';
      const line = firstSubmission ? replyFor(1) : lineForStage(state.playStep);
      const nextStep: OfficePlayStep = firstSubmission ? 'refused' : state.playStep;
      return {
        state: {
          ...state,
          stamps: firstSubmission ? 1 : state.stamps,
          pressing: false,
          phase: phaseForStep(nextStep),
          playStep: nextStep,
          display: line.display,
          receipt: line.receipt,
        },
        cues: [
          { type: 'lift' },
          { type: 'reply', step: 1, line },
        ],
      };
    }

    case 'RESPONSE_SETTLED':
      return state.processing && !state.pressing && event.step === state.stamps
        ? { state: { ...state, processing: false }, cues: [] }
        : { state, cues: [] };

    case 'STILLNESS':
      // Waiting never advances or changes the story.
      return { state, cues: [] };

    case 'DRAWER_OPENED':
      return state.playStep === 'refused'
        ? { state: { ...state, playStep: 'drawer-open' }, cues: [] }
        : { state, cues: [] };

    case 'INSPECTION_MARKED': {
      if (state.playStep !== 'drawer-open') return { state, cues: [] };
      const line = lineAt(AFTERMATH, 1);
      return {
        state: { ...state, playStep: 'inspection-recorded', display: line.display, receipt: 'FRONT HATCH RELEASED — PULL TO OPEN' },
        cues: [
          { type: 'reply', step: state.stamps + 1, line: { display: line.display, receipt: 'FRONT HATCH RELEASED — PULL TO OPEN' } },
          { type: 'object', kind: 'metal' },
        ],
      };
    }

    case 'PULL_HATCH': {
      if (state.playStep !== 'inspection-recorded') return { state, cues: [] };
      const line: MachineLine = { display: 'INSPECTION COMPLETE', receipt: 'NO AUTHORITY INSTALLED TO APPROVE APPLICATIONS' };
      const memo = revealMemo(state.memo, 'inspection');
      return {
        state: {
          ...state,
          phase: 'resolved',
          playStep: 'resolved',
          display: line.display,
          receipt: line.receipt,
          memo,
        },
        cues: [
          { type: 'reply', step: state.stamps + 2, line },
          { type: 'memo-revealed', source: 'inspection' },
        ],
      };
    }

    case 'RESTORE_PLAY':
      return { state: restoredState(event.step), cues: [] };

    case 'OPEN_MEMO':
      return !state.memo.revealed || state.memo.open
        ? { state, cues: [] }
        : { state: { ...state, memo: { ...state.memo, open: true } }, cues: [{ type: 'memo-opened' }] };

    case 'CLOSE_MEMO':
      return !state.memo.open
        ? { state, cues: [] }
        : { state: { ...state, memo: { ...state.memo, open: false } }, cues: [{ type: 'memo-closed' }] };

    case 'RESET':
      return { state: initialState, cues: [{ type: 'reset' }] };
  }
}
