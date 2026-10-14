import { describe, expect, it } from 'vitest';
import {
  initialState,
  OVERLOAD_AT,
  replyFor,
  transition,
  type CertificationEvent,
  type CertificationState,
  type Cue,
} from './certification.ts';
import { AFTERMATH, ESCALATION, INITIAL_DISPLAY, STILLNESS_LINE } from './copy.ts';
import { createCertificationStore } from './store.ts';

function run(events: readonly CertificationEvent[], from = initialState) {
  let state: CertificationState = from;
  const cues: Cue[] = [];
  for (const event of events) {
    const result = transition(state, event);
    state = result.state;
    cues.push(...result.cues);
  }
  return { state, cues };
}

const stamp: readonly CertificationEvent[] = [{ type: 'PRESS' }, { type: 'RELEASE' }];
const stamps = (n: number) => Array.from({ length: n }, () => stamp).flat();

describe('initial state', () => {
  it('asks for evidence and has nothing revealed', () => {
    expect(initialState.display).toBe(INITIAL_DISPLAY);
    expect(initialState.stamps).toBe(0);
    expect(initialState.phase).toBe('awaiting');
    expect(initialState.receipt).toBeNull();
    expect(initialState.memo).toEqual({ revealed: false, source: null, open: false });
  });
});

describe('press and release', () => {
  it('PRESS makes contact without counting a stamp', () => {
    const { state, cues } = run([{ type: 'PRESS' }]);
    expect(state.pressing).toBe(true);
    expect(state.stamps).toBe(0);
    expect(cues).toEqual([{ type: 'contact' }]);
  });

  it('a held key repeating PRESS does not make a second contact', () => {
    const { state, cues } = run([{ type: 'PRESS' }, { type: 'PRESS' }, { type: 'PRESS' }]);
    expect(state.pressing).toBe(true);
    expect(cues.filter((c) => c.type === 'contact')).toHaveLength(1);
  });

  it('RELEASE without a PRESS is ignored and returns the same state object', () => {
    const result = transition(initialState, { type: 'RELEASE' });
    expect(result.state).toBe(initialState);
    expect(result.cues).toEqual([]);
  });

  it('RELEASE completes exactly one stamp and prints the first reply', () => {
    const { state, cues } = run(stamp);
    expect(state.stamps).toBe(1);
    expect(state.pressing).toBe(false);
    expect(state.phase).toBe('escalating');
    expect(state.display).toBe(ESCALATION[0]!.display);
    expect(state.receipt).toBe(ESCALATION[0]!.receipt);
    expect(cues.map((c) => c.type)).toEqual(['contact', 'lift', 'reply']);
  });
});

describe('escalation and overload', () => {
  it('stamps 1..4 escalate through each condition in order without overloading', () => {
    for (let n = 1; n < OVERLOAD_AT; n += 1) {
      const { state, cues } = run(stamps(n));
      expect(state.display).toBe(ESCALATION[n - 1]!.display);
      expect(state.phase).toBe('escalating');
      expect(state.memo.revealed).toBe(false);
      expect(cues.some((c) => c.type === 'overload')).toBe(false);
    }
  });

  it('the fifth stamp, and only the fifth, overloads and reveals the memo', () => {
    expect(OVERLOAD_AT).toBe(5);
    const before = run(stamps(4));
    const fifth = run(stamp, before.state);
    expect(fifth.state.stamps).toBe(5);
    expect(fifth.state.phase).toBe('overloaded');
    expect(fifth.state.display).toBe('AUTHORITY NOT FOUND');
    expect(fifth.state.memo).toEqual({ revealed: true, source: 'overload', open: false });
    expect(fifth.cues.map((c) => c.type)).toEqual([
      'contact',
      'lift',
      'reply',
      'overload',
      'memo-revealed',
    ]);
  });

  it('stamps after the overload cycle a bounded aftermath and never overload again', () => {
    const { state, cues } = run(stamps(OVERLOAD_AT + AFTERMATH.length * 2));
    expect(state.phase).toBe('overloaded');
    expect(cues.filter((c) => c.type === 'overload')).toHaveLength(1);
    expect(cues.filter((c) => c.type === 'memo-revealed')).toHaveLength(1);
    expect(state.display).toBe(AFTERMATH[AFTERMATH.length - 1]!.display);
  });

  it('replyFor maps steps to the escalation then wraps the aftermath', () => {
    expect(replyFor(1)).toBe(ESCALATION[0]);
    expect(replyFor(5)).toBe(ESCALATION[4]);
    expect(replyFor(6)).toBe(AFTERMATH[0]);
    expect(replyFor(8)).toBe(AFTERMATH[2]);
    expect(replyFor(9)).toBe(AFTERMATH[0]);
    expect(() => replyFor(0)).toThrow(RangeError);
  });

  it('reply cues carry the 1-based step that produced them', () => {
    const { cues } = run(stamps(3));
    const steps = cues.flatMap((c) => (c.type === 'reply' ? [c.step] : []));
    expect(steps).toEqual([1, 2, 3]);
  });
});

describe('stillness path', () => {
  it('reveals the memo with the stillness provenance', () => {
    const { state, cues } = run([{ type: 'STILLNESS' }]);
    expect(state.display).toBe(STILLNESS_LINE.display);
    expect(state.receipt).toBe(STILLNESS_LINE.receipt);
    expect(state.memo).toEqual({ revealed: true, source: 'stillness', open: false });
    expect(cues.map((c) => c.type)).toEqual(['stillness', 'memo-revealed']);
  });

  it('is ignored while the stamp is held', () => {
    const { state, cues } = run([{ type: 'PRESS' }, { type: 'STILLNESS' }]);
    expect(state.memo.revealed).toBe(false);
    expect(cues.map((c) => c.type)).toEqual(['contact']);
  });

  it('happens at most once and does not overwrite an overload reveal', () => {
    const afterOverload = run([...stamps(5), { type: 'STILLNESS' }]);
    expect(afterOverload.state.memo.source).toBe('overload');
    expect(afterOverload.state.stillnessNoticed).toBe(false);

    const twice = run([{ type: 'STILLNESS' }, { type: 'STILLNESS' }]);
    expect(twice.cues.filter((c) => c.type === 'stillness')).toHaveLength(1);
  });

  it('a later overload after stillness keeps the stillness provenance and does not re-reveal', () => {
    const { state, cues } = run([{ type: 'STILLNESS' }, ...stamps(5)]);
    expect(state.phase).toBe('overloaded');
    expect(state.memo.source).toBe('stillness');
    expect(cues.filter((c) => c.type === 'memo-revealed')).toHaveLength(1);
  });
});

describe('memo', () => {
  it('cannot be opened before it is revealed', () => {
    const result = transition(initialState, { type: 'OPEN_MEMO' });
    expect(result.state).toBe(initialState);
  });

  it('opens and closes once revealed, preserving its source', () => {
    const opened = run([...stamps(5), { type: 'OPEN_MEMO' }]);
    expect(opened.state.memo).toEqual({ revealed: true, source: 'overload', open: true });
    const closed = run([{ type: 'CLOSE_MEMO' }], opened.state);
    expect(closed.state.memo).toEqual({ revealed: true, source: 'overload', open: false });
    expect(closed.cues).toEqual([{ type: 'memo-closed' }]);
  });

  it('duplicate open and close are no-ops', () => {
    const opened = run([{ type: 'STILLNESS' }, { type: 'OPEN_MEMO' }, { type: 'OPEN_MEMO' }]);
    expect(opened.cues.filter((c) => c.type === 'memo-opened')).toHaveLength(1);
    const closed = run([{ type: 'CLOSE_MEMO' }, { type: 'CLOSE_MEMO' }], opened.state);
    expect(closed.cues).toEqual([{ type: 'memo-closed' }]);
  });
});

describe('reset', () => {
  it('returns to the initial state from anywhere', () => {
    const { state } = run([...stamps(7), { type: 'OPEN_MEMO' }, { type: 'RESET' }]);
    expect(state).toBe(initialState);
  });
});

describe('store', () => {
  it('notifies state listeners only on change, then cue listeners in order', () => {
    const store = createCertificationStore();
    const log: string[] = [];
    store.subscribe(() => log.push(`state:${store.getState().stamps}`));
    store.onCue((cue) => log.push(`cue:${cue.type}`));

    store.dispatch({ type: 'RELEASE' }); // no-op
    store.dispatch({ type: 'PRESS' });
    store.dispatch({ type: 'RELEASE' });

    expect(log).toEqual(['state:0', 'cue:contact', 'state:1', 'cue:lift', 'cue:reply']);
  });

  it('unsubscribed listeners stop receiving', () => {
    const store = createCertificationStore();
    let calls = 0;
    const off = store.subscribe(() => (calls += 1));
    const offCue = store.onCue(() => (calls += 1));
    off();
    offCue();
    store.dispatch({ type: 'PRESS' });
    expect(calls).toBe(0);
  });
});
