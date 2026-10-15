import { describe, expect, it } from 'vitest';
import { EXCHANGE_OBJECTS, EXCHANGE_TOKENS, createExchangeState, nextExchangeTick, transitionExchange } from './state.ts';

const send = (state: ReturnType<typeof createExchangeState>, event: Parameters<typeof transitionExchange>[1]) =>
  transitionExchange(state, event);

describe('The Exchange state machine', () => {
  it('lights the first line after ten seconds and offers a connected line', () => {
    const state = send(createExchangeState(), { type: 'tick', elapsedMs: 10_000 }).state;
    expect(state.litLines).toContain(1);
    expect(send(state, { type: 'connect', target: 1 }).state.connectedLines).toContain(1);
  });

  it('holds every lamp in the test state for exactly one second without a background loop', () => {
    const tested = send(createExchangeState(), { type: 'inspect', object: 'lamp-test' }).state;
    expect(tested.lampTestUntil).toBe(1_000);
    expect(nextExchangeTick(tested)).toBe(1_000);
    expect(nextExchangeTick(send(tested, { type: 'tick', elapsedMs: 1_000 }).state)).toBe(10_000);
  });

  it('keeps the line card and lamp response together, then releases all cords at saturation', () => {
    let state = send(createExchangeState(), { type: 'tick', elapsedMs: 10_000 }).state;
    for (let line = 1; line <= 12; line += 1) {
      if (!state.litLines.includes(line)) state = send(state, { type: 'tick', elapsedMs: state.elapsedMs + 8_000 }).state;
      state = send(state, { type: 'connect', target: line }).state;
    }
    expect(state.phase).toBe('operator-lit');
    expect(state.connectedLines).toEqual([]);
    expect(state.operatorLamp).toBe(true);
    expect(state.cordRelease).toBe(true);
  });

  it('connects the twelve-line path, reveals line nine, then rings and answers the operator', () => {
    let state = send(createExchangeState(), { type: 'tick', elapsedMs: 10_000 }).state;
    const findings: string[] = [];
    for (let line = 1; line <= 12; line += 1) {
      const result = send(state, { type: 'connect', target: line });
      state = result.state;
      findings.push(...result.found.map(found => found.id));
    }
    expect(state.phase).toBe('operator-lit');
    expect(findings).toContain('certification-callback');
    state = send(state, { type: 'connect', target: 'operator' }).state;
    expect(state.phase).toBe('operator-ringing');
    const answered = send(state, { type: 'answer-handset' });
    expect(answered.state.discoveries).toContain('operator-ticket');
    expect(answered.found.map(found => found.id)).toContain('operator-ticket');
  });

  it('opens the investigation route after the rulebook and wiring diagram are inspected', () => {
    let state = createExchangeState();
    state = send(state, { type: 'inspect', object: 'rulebook' }).state;
    state = send(state, { type: 'inspect', object: 'wiring-diagram' }).state;
    expect(state.operatorLamp).toBe(true);
    state = send(state, { type: 'connect', target: 'operator' }).state;
    expect(state.phase).toBe('operator-ringing');
    expect(send(state, { type: 'answer-handset' }).found.map(found => found.id)).toContain('operator-ticket');
  });

  it('opens night service after twenty-five seconds without activity', () => {
    let state = send(createExchangeState(), { type: 'tick', elapsedMs: 25_000 }).state;
    expect(state.phase).toBe('night-service');
    expect(state.operatorLamp).toBe(true);
    expect(state.litLines).toContain(1);
    state = send(state, { type: 'connect', target: 'operator' }).state;
    expect(state.phase).toBe('operator-ringing');
    expect(send(state, { type: 'answer-handset' }).state.discoveries).toContain('operator-ticket');
  });

  it('requires every rule in order before revealing the last-page discovery', () => {
    let state = createExchangeState();
    state = send(state, { type: 'inspect', object: 'rulebook' }).state;
    state = send(state, { type: 'read-next-rule' }).state;
    expect(state.rulePage).toBe(2);
    for (let page = 3; page <= 13; page += 1) state = send(state, { type: 'read-next-rule' }).state;
    expect(state.rulePage).toBe(13);
    expect(state.discoveries).toContain('rule-14');
    expect(state.tokens['rule-14']).toBe(EXCHANGE_TOKENS['rule-14']);
  });

  it('has a DOM-action counterpart for every inspectable object', () => {
    expect(EXCHANGE_OBJECTS.map((item) => item.id)).toEqual([
      'handset', 'rulebook', 'wiring-diagram', 'ladder', 'lamp-test', 'tea-flask',
      'cardigan', 'shift-roster', 'operator-frame', 'wanted-bell',
    ]);
    expect(EXCHANGE_OBJECTS.every((item) => item.action.length > 0 && item.node.length > 0)).toBe(true);
  });

  it('records a sealed finding for each inspectable object action', () => {
    for (const object of EXCHANGE_OBJECTS) {
      const result = send(createExchangeState(), { type: 'inspect', object: object.id });
      expect(result.found.map(item => item.id), object.id).toContain(object.finding);
    }
  });

  it('wakes only for the next authored transition and uses distinct opaque discovery tokens', () => {
    const state = createExchangeState();
    expect(nextExchangeTick(state)).toBe(10_000);
    expect(nextExchangeTick(send(state, { type: 'tick', elapsedMs: 10_000 }).state)).toBe(18_000);
    expect(Object.values(EXCHANGE_TOKENS).every(token => /^[0-9a-f]{32}$/.test(token))).toBe(true);
    expect(new Set(Object.values(EXCHANGE_TOKENS)).size).toBe(Object.keys(EXCHANGE_TOKENS).length);
  });
});
