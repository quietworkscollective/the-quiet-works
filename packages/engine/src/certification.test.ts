import { describe, expect, it } from 'vitest';
import { createCertificationStore } from './store.ts';
import { AFTERMATH, ESCALATION, HATCH_INTERIOR, INITIAL_DISPLAY, MEMO_001, STAMP_WORD } from './copy.ts';
import { initialState, replyFor, transition } from './certification.ts';

function submitOnce() {
  const store = createCertificationStore();
  store.dispatch({ type: 'PRESS' });
  store.dispatch({ type: 'RELEASE' });
  return store;
}

describe('Certification Office: the approved inspection sequence', () => {
  it('starts with a ready application and the authored submission mark', () => {
    expect(initialState).toMatchObject({
      stamps: 0,
      pressing: false,
      processing: false,
      phase: 'awaiting',
      playStep: 'ready',
      display: INITIAL_DISPLAY,
      receipt: null,
      memo: { revealed: false, source: null, open: false },
    });
    expect(STAMP_WORD).toBe('HELD');
  });

  it('press and release produce one held reply and leave the hatch shut', () => {
    const store = createCertificationStore();
    const cues: string[] = [];
    store.onCue(cue => cues.push(cue.type));

    store.dispatch({ type: 'PRESS' });
    expect(store.getState()).toMatchObject({ pressing: true, processing: true, stamps: 0 });
    store.dispatch({ type: 'RELEASE' });

    expect(store.getState()).toMatchObject({
      stamps: 1,
      pressing: false,
      processing: true,
      phase: 'escalating',
      playStep: 'refused',
      display: 'APPROVAL HELD',
      receipt: 'RECEIVING AUTHORITY NOT VERIFIED\nINSPECTION COPY: DESK DRAWER',
      memo: { revealed: false, source: null, open: false },
    });
    expect(cues).toEqual(['contact', 'lift', 'reply']);
  });

  it('a wrong-tool press replies without another impression or progression', () => {
    const store = submitOnce();
    store.dispatch({ type: 'RESPONSE_SETTLED', step: 1 });
    store.dispatch({ type: 'DRAWER_OPENED' });
    store.dispatch({ type: 'PRESS' });
    store.dispatch({ type: 'RELEASE' });

    expect(store.getState()).toMatchObject({
      stamps: 1,
      playStep: 'drawer-open',
      display: 'NOT A SUBMISSION',
      receipt: 'INSPECTION REQUESTS USE THE SMALL STAMP',
      memo: { revealed: false },
    });
  });

  it('waiting never changes the machine, memo or play step', () => {
    const store = submitOnce();
    store.dispatch({ type: 'RESPONSE_SETTLED', step: 1 });
    const before = store.getState();
    const result = transition(before, { type: 'STILLNESS' });
    expect(result.state).toBe(before);
    expect(result.cues).toEqual([]);
  });

  it('drawer, inspection mark and hatch are ordered; only pulling resolves the room', () => {
    const store = submitOnce();
    store.dispatch({ type: 'RESPONSE_SETTLED', step: 1 });
    store.dispatch({ type: 'PULL_HATCH' });
    expect(store.getState().playStep).toBe('refused');
    expect(store.getState().memo.revealed).toBe(false);

    store.dispatch({ type: 'DRAWER_OPENED' });
    expect(store.getState().playStep).toBe('drawer-open');
    store.dispatch({ type: 'PULL_HATCH' });
    expect(store.getState().playStep).toBe('drawer-open');

    store.dispatch({ type: 'INSPECTION_MARKED' });
    expect(store.getState()).toMatchObject({
      stamps: 1,
      playStep: 'inspection-recorded',
      display: 'INSPECTION RECORDED',
      receipt: 'FRONT HATCH RELEASED — PULL TO OPEN',
      memo: { revealed: false },
    });
    store.dispatch({ type: 'PULL_HATCH' });
    expect(store.getState()).toMatchObject({
      stamps: 1,
      phase: 'resolved',
      playStep: 'resolved',
      display: 'INSPECTION COMPLETE',
      receipt: 'NO AUTHORITY INSTALLED TO APPROVE APPLICATIONS',
      memo: { revealed: true, source: 'inspection', open: false },
    });
    expect(HATCH_INTERIOR).toBe('RECEIVING AUTHORITY — NEVER INSTALLED');
    expect(MEMO_001.body).toContain('The stamp remains in service.');
  });

  it('restores the saved step without replaying sound or changing archive state', () => {
    const restored = transition(initialState, { type: 'RESTORE_PLAY', step: 'resolved' });
    expect(restored.cues).toEqual([]);
    expect(restored.state).toMatchObject({
      stamps: 1,
      playStep: 'resolved',
      display: 'INSPECTION COMPLETE',
      memo: { revealed: true, source: 'inspection', open: false },
    });
  });

  it('restores the released latch response rather than a repeated-press reply', () => {
    const restored = transition(initialState, { type: 'RESTORE_PLAY', step: 'inspection-recorded' });
    expect(restored.cues).toEqual([]);
    expect(restored.state).toMatchObject({
      playStep: 'inspection-recorded',
      display: 'INSPECTION RECORDED',
      receipt: 'FRONT HATCH RELEASED — PULL TO OPEN',
    });
  });

  it('does not advance beyond one impression on any repeated stamp', () => {
    const store = submitOnce();
    store.dispatch({ type: 'RESPONSE_SETTLED', step: 1 });
    store.dispatch({ type: 'DRAWER_OPENED' });
    store.dispatch({ type: 'INSPECTION_MARKED' });
    store.dispatch({ type: 'PULL_HATCH' });
    store.dispatch({ type: 'RESPONSE_SETTLED', step: 1 });
    store.dispatch({ type: 'PRESS' });
    store.dispatch({ type: 'RELEASE' });
    expect(store.getState().stamps).toBe(1);
    expect(store.getState().playStep).toBe('resolved');
    expect(store.getState().display).toBe('APPLICATION RECEIVED');
    expect(store.getState().memo.revealed).toBe(true);
  });

  it('uses only non-approval repeat text after the submitted mark', () => {
    expect(replyFor(1)).toBe(ESCALATION[0]);
    expect(replyFor(2)).toBe(AFTERMATH[0]);
    for (const line of [ESCALATION[0]!, ...AFTERMATH]) {
      expect(line.display).not.toMatch(/APPROVED|FINE/);
      expect(line.receipt).not.toMatch(/APPROVED|FINE/);
    }
  });

  it('reset returns the physical sequence to the application without changing saved findings', () => {
    const store = submitOnce();
    store.dispatch({ type: 'RESPONSE_SETTLED', step: 1 });
    store.dispatch({ type: 'RESET' });
    expect(store.getState()).toEqual(initialState);
  });
});
