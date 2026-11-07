import { describe, expect, it } from 'vitest';
import { createDiscoveryStore } from '@tqw/engine';
import { CUES } from './copy.ts';
import {
  EXCHANGE_OBJECTS,
  RULE_IDS,
  createExchangeState,
  exchangeRecord,
  isExchangeFinding,
  loadExchangeState,
  restoreExchangeState,
  saveExchangeState,
  transitionExchange,
  type ExchangeEvent,
  type ExchangeState,
} from './state.ts';

const send = transitionExchange;
const play = (from: ExchangeState, ...events: readonly ExchangeEvent[]) => events.reduce((state, event) => send(state, event).state, from);
const fresh = createExchangeState;
const select: ExchangeEvent = { type: 'select-enquiry-plug' };
const connectCertification: ExchangeEvent = { type: 'connect', target: 3 };
const openPlate: ExchangeEvent = { type: 'open-plate' };
const seatLead: ExchangeEvent = { type: 'connect-operator-test' };
const lift: ExchangeEvent = { type: 'lift-handset' };
const readTickets: ExchangeEvent = { type: 'read-tickets' };

describe('The Exchange state', () => {
  it('holds the five room fields, the card flag and findings, and nothing else', () => {
    expect(fresh()).toEqual({ service: 'day', plug: 'rest', plate: 'shut', lead: 'clipped', handset: 'cradle', cardRead: false, discoveries: [] });
  });

  it('marks the wiring card read with no record, and gates nothing on it', () => {
    const read = send(fresh(), { type: 'read-wiring-card' });
    expect(read.state.cardRead).toBe(true);
    expect(read.found).toEqual([]);
    expect(send(fresh(), select).state.plug).toBe('guide');
  });

  it('returns the same object for an unknown event or a line that does not exist', () => {
    const state = fresh();
    expect(send(state, { type: 'unknown' } as unknown as ExchangeEvent).state).toBe(state);
    for (const target of [0, 13, 2.5]) expect(send(state, { type: 'connect', target }).state).toBe(state);
    expect(send(state, { type: 'inspect', object: 'ladder' } as unknown as ExchangeEvent).state).toBe(state);
  });

  it('records each reading under its own id, once', () => {
    const expected: Readonly<Record<string, string>> = {
      'wiring-diagram': 'wiring-diagram', cardigan: 'cardigan', 'tea-flask': 'tea-flask',
      'shift-roster': 'shift-roster', docket: 'fitter-docket', index: 'shelf-index',
    };
    for (const [object, finding] of Object.entries(expected)) {
      const event = { type: 'inspect', object } as ExchangeEvent;
      const read = send(fresh(), event);
      expect(read.found.map(item => item.id)).toEqual([finding]);
      const again = send(read.state, event);
      expect(again.state).toBe(read.state);
      expect(again.found).toEqual([]);
    }
  });

  it('gives every recorded finding a title, so the Archive needs no fallback', () => {
    const everything = [
      ...EXCHANGE_OBJECTS.map(object => ({ type: 'inspect', object: object.id }) as ExchangeEvent),
      select, connectCertification, openPlate, seatLead, lift, readTickets,
    ];
    let state = send(fresh(), lift).state;
    for (const event of everything) {
      const step = send(state, event);
      for (const item of step.found) expect(item.title.trim(), item.id).not.toBe('');
      state = step.state;
    }
    expect(state.discoveries.every(isExchangeFinding)).toBe(true);
    expect(state.discoveries).toHaveLength(26);
  });

  it('names only cues that have a caption', () => {
    const events: readonly ExchangeEvent[] = [
      { type: 'read-wiring-card' }, select, connectCertification, { type: 'connect', target: 1 }, openPlate, seatLead, lift, readTickets,
      ...EXCHANGE_OBJECTS.map(object => ({ type: 'inspect', object: object.id }) as ExchangeEvent), { type: 'night-service', enabled: true },
    ];
    let state = send(fresh(), seatLead).state;
    for (const event of events) {
      const step = send(state, event);
      for (const cue of step.cues) expect(Object.keys(CUES)).toContain(cue);
      state = step.state;
    }
  });
});

describe('The Exchange room record', () => {
  it('mirrors exactly the five fields and a version', () => {
    expect(exchangeRecord(play(fresh(), select, { type: 'read-wiring-card' }))).toEqual({
      version: 1, service: 'day', plug: 'guide', plate: 'shut', lead: 'clipped', handset: 'cradle',
    });
  });

  it('round-trips a plug in the guide, a seated lead and night service', () => {
    const held = play(fresh(), select, openPlate, seatLead, { type: 'night-service', enabled: true });
    const restored = restoreExchangeState(exchangeRecord(held), held.discoveries);
    expect(restored).toEqual({ ...held, cardRead: false });
  });

  it('derives every position findings can show when the record is missing or refused', () => {
    const found = ['departments-connected', 'certification-form', 'rule-14', 'socket-beneath-plate'];
    for (const saved of [null, undefined, 'night', { version: 99, service: 'lunch' }, { version: 1, service: 'lunch', plug: 'rest', plate: 'shut', lead: 'clipped', handset: 'cradle' }]) {
      expect(restoreExchangeState(saved, found)).toEqual({
        service: 'day', plug: 'seated', plate: 'open', lead: 'seated', handset: 'off-hook', cardRead: false, discoveries: found,
      });
    }
  });

  it('opens the plate from rule-14 alone and leaves the handset on its cradle', () => {
    const state = restoreExchangeState(null, ['rule-14']);
    expect([state.plate, state.lead, state.handset, state.plug]).toEqual(['open', 'clipped', 'cradle', 'rest']);
  });

  it('maps the legacy night-service value to night and nothing else', () => {
    expect(restoreExchangeState({ phase: 'night-service', elapsedMs: 600_000 }, [])).toEqual({ ...fresh(), service: 'night' });
    expect(restoreExchangeState({ phase: 'serving' }, [])).toEqual(fresh());
  });

  it('never strands a finding behind a record that claims more than was found', () => {
    const claim = { version: 1, service: 'day', plug: 'seated', plate: 'open', lead: 'seated', handset: 'off-hook' };
    const restored = restoreExchangeState(claim, []);
    expect(restored).toEqual(fresh());
    expect(send(play(restored, select), connectCertification).found.map(item => item.id)).toEqual(['departments-connected', 'certification-form']);
    expect(send(restored, openPlate).found.map(item => item.id)).toEqual(['rule-14']);
  });

  it('ignores a retired finding left in an older save', () => {
    expect(restoreExchangeState(null, ['ladder', 'cardigan']).discoveries).toEqual(['cardigan']);
  });

  it('writes nothing before the first Exchange finding, even with findings from another room', () => {
    const store = createDiscoveryStore(null);
    store.record('certification-office', { id: 'memo-001', kind: 'memo' });
    saveExchangeState(store, play(fresh(), { type: 'night-service', enabled: true }));
    expect(store.getRoomState('exchange')).toBeNull();
    expect(loadExchangeState(store).service).toBe('day');
  });

  it('keeps the room through the store once something is found, and Forget clears it', () => {
    const store = createDiscoveryStore(null);
    const step = send(play(fresh(), select), { type: 'inspect', object: 'cardigan' });
    for (const finding of step.found) store.record('exchange', finding);
    saveExchangeState(store, step.state);
    expect(loadExchangeState(store)).toEqual({ ...step.state, cardRead: false });
    store.forget();
    expect(store.getRoomState('exchange')).toBeNull();
    expect(loadExchangeState(store)).toEqual(fresh());
  });

  it('survives having no store at all', () => {
    expect(loadExchangeState(undefined)).toEqual(fresh());
    expect(() => saveExchangeState(undefined, fresh())).not.toThrow();
  });

  it('records the rule ids in book order', () => {
    expect(RULE_IDS).toHaveLength(13);
    expect(RULE_IDS[12]).toBe('rule-13');
  });
});
