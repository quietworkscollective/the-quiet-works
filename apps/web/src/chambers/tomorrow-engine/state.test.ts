import { describe, expect, it } from 'vitest';
import {
  createTomorrowEngineState,
  nextPrimaryAction,
  payloadForTomorrowEngine,
  transitionTomorrowEngine,
  type TomorrowAction,
} from './state.ts';

const act = (state: ReturnType<typeof createTomorrowEngineState>, action: TomorrowAction) =>
  transitionTomorrowEngine(state, { type: 'action', action });

describe('Tomorrow Engine approved chain', () => {
  it('runs wind, movement record, brake and ticket withdrawal in order', () => {
    let state = createTomorrowEngineState();
    expect(state.phase).toBe('ready');
    expect(nextPrimaryAction(state)).toBe('wind');

    state = act(state, 'wind');
    expect(state.phase).toBe('wound');
    expect(state.station).toBe('winding-control');
    expect(nextPrimaryAction(state)).toBe('read-record');

    state = act(state, 'read-record');
    expect(state.phase).toBe('record-opened');
    expect(state.result).toBe('Date advanced one day. Carriage displacement: zero. Brake released for use.');
    expect(nextPrimaryAction(state)).toBe('brake');

    state = act(state, 'brake');
    expect(state.phase).toBe('braked');
    expect(nextPrimaryAction(state)).toBe('withdraw');

    state = act(state, 'withdraw');
    expect(state.phase).toBe('withdrawn');
    expect(state.completed).toBe(true);
    expect(state.station).toBe('service-hatch');
    expect(state.result).toBe('The date advances; delivery still requires unavailable approval.');
    expect(nextPrimaryAction(state)).toBe('read-ticket');
  });

  it('does not let early or repeated actions skip phases or advance the date twice', () => {
    let state = createTomorrowEngineState();
    state = act(state, 'read-record');
    expect(state.result).toBe('Wind once to produce the movement record.');
    state = act(state, 'brake');
    expect(state.phase).toBe('ready');
    expect(state.result).toBe('Wind once, then open the movement record to release the brake.');
    state = act(state, 'withdraw');
    expect(state.phase).toBe('ready');
    expect(state.result).toBe('Apply brake to release the dispatch ticket.');
    state = act(state, 'wind');
    expect(act(state, 'wind').phase).toBe('wound');
    expect(act(state, 'wind').result).toBe('Movement already recorded.');
  });

  it('reopens the withdrawn ticket at its front without changing completion', () => {
    let state = createTomorrowEngineState();
    state = act(state, 'wind');
    state = act(state, 'read-record');
    state = act(state, 'brake');
    state = act(state, 'withdraw');
    state = act(state, 'turn-over');
    expect(state.ticketFace).toBe('reverse');
    state = act(state, 'withdraw');
    expect(state.phase).toBe('withdrawn');
    expect(state.ticketFace).toBe('front');
    expect(state.completed).toBe(true);
    expect(state.result).toBe('Ticket already withdrawn.');
  });

  it('keeps optional sleeve and stop fittings available and reset retains completion', () => {
    let state = createTomorrowEngineState();
    state = act(state, 'open-sleeve');
    state = act(state, 'lift-stop-tab');
    expect(state.sleeveOpen).toBe(true);
    expect(state.stopTabOpen).toBe(true);
    state = act(state, 'wind');
    state = act(state, 'read-record');
    state = act(state, 'brake');
    state = act(state, 'withdraw');
    const reset = transitionTomorrowEngine(state, { type: 'reset' });
    expect(reset.phase).toBe('ready');
    expect(reset.station).toBe('winding-control');
    expect(reset.sleeveOpen).toBe(false);
    expect(reset.stopTabOpen).toBe(false);
    expect(reset.completed).toBe(true);
    expect(reset.result).toBe('Mechanism reset. Archive retained.');
  });

  it('restores only a script version 6 payload and puts the ticket face back to front', () => {
    const payload = {
      scriptVersion: 6 as const,
      phase: 'withdrawn' as const,
      station: 'service-hatch' as const,
      sleeveOpen: true,
      stopTabOpen: false,
      completed: true,
    };
    const state = createTomorrowEngineState(payload);
    expect(state.phase).toBe('withdrawn');
    expect(state.sleeveOpen).toBe(true);
    expect(state.ticketFace).toBe('front');
    expect(payloadForTomorrowEngine(state)).toEqual(payload);
    expect(createTomorrowEngineState({ scriptVersion: 5, phase: 'wind', unusedHour: true }).phase).toBe('ready');
    expect(createTomorrowEngineState({ phase: 'braked', path: 'brake', lunchNoteRead: true }).phase).toBe('ready');
    expect(createTomorrowEngineState({ phase: 'ready', completed: true }).completed).toBe(true);
  });
});
