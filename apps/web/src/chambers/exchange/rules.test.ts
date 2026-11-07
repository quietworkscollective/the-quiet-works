import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HINTS, LINE_CARDS, READERS, hintStage } from './copy.ts';
import { DOOR } from './door.ts';
import {
  CERTIFICATION_LINE,
  EXCHANGE_OBJECTS,
  OPERATOR_ARCHIVE_TITLE,
  RULE_IDS,
  createExchangeState,
  transitionExchange,
  type ExchangeEvent,
} from './state.ts';

const ROOM = fileURLToPath(new URL('.', import.meta.url));

function roomSources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === 'assets' ? [] : roomSources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const send = transitionExchange;
const play = (...events: readonly ExchangeEvent[]) => events.reduce((state, event) => send(state, event).state, createExchangeState());
const readCard: ExchangeEvent = { type: 'read-wiring-card' };
const select: ExchangeEvent = { type: 'select-enquiry-plug' };
const connect: ExchangeEvent = { type: 'connect', target: CERTIFICATION_LINE };
const openPlate: ExchangeEvent = { type: 'open-plate' };
const seatLead: ExchangeEvent = { type: 'connect-operator-test' };
const lift: ExchangeEvent = { type: 'lift-handset' };
const readTickets: ExchangeEvent = { type: 'read-tickets' };
const night: ExchangeEvent = { type: 'night-service', enabled: true };
const resume: ExchangeEvent = { type: 'night-service', enabled: false };
const otherLines = Array.from({ length: 12 }, (_, offset) => offset + 1).filter(line => line !== CERTIFICATION_LINE);

/** Every event but the switch, in an order that visits every position of every part. */
const everyOtherEvent: readonly ExchangeEvent[] = [
  lift, seatLead, readTickets, readCard, select,
  ...otherLines.map(target => ({ type: 'connect', target }) as ExchangeEvent),
  connect, openPlate, seatLead, lift, readTickets,
  ...EXCHANGE_OBJECTS.map(object => ({ type: 'inspect', object: object.id }) as ExchangeEvent),
];

describe('Exchange ruling B2: elapsed time and the switch', () => {
  it('runs no timer anywhere in the room', () => {
    const sources = roomSources(ROOM);
    expect(sources.length).toBeGreaterThan(5);
    for (const path of sources) expect(readFileSync(path, 'utf8'), path).not.toMatch(/\b(setTimeout|setInterval|requestIdleCallback)\b/);
  });

  it('changes nothing on a tick at the old idle and saturation times', () => {
    for (const elapsedMs of [25_000, 112_000, 300_000]) {
      const before = createExchangeState();
      const after = transitionExchange(before, { type: 'tick', elapsedMs } as unknown as ExchangeEvent);
      expect(after.state).toBe(before);
      expect(after.cues).toEqual([]);
      expect(after.found).toEqual([]);
    }
  });

  it('enters night service only by the switch', () => {
    let state = createExchangeState();
    for (const event of everyOtherEvent) {
      state = send(state, event).state;
      expect([event.type, state.service]).toEqual([event.type, 'day']);
    }
    expect(state.handset).toBe('off-hook');
    expect(send(state, night).state.service).toBe('night');
  });

  it('resumes from night service in one event, from every state the room can reach', () => {
    let state = createExchangeState();
    for (const event of everyOtherEvent) {
      state = send(state, event).state;
      const held = send(state, night).state;
      expect(held.service).toBe('night');
      const resumed = send(held, resume).state;
      expect(resumed).toEqual(state);
    }
  });

  it('touches only the service when the lever moves', () => {
    const before = play(select, connect, openPlate);
    const after = send(before, night);
    expect(after.state).toEqual({ ...before, service: 'night' });
    expect(after.found).toEqual([]);
    expect(after.cues).toEqual(['lever']);
    expect(send(after.state, night).state).toBe(after.state);
  });

  it('gates nothing: the whole solve and the operator test work in night service', () => {
    const selected = send(play(night), select).state;
    expect(selected.plug).toBe('guide');
    const connected = send(selected, connect);
    expect(connected.found.map(item => item.id)).toEqual(['departments-connected', 'certification-form']);
    expect(connected.state.service).toBe('night');
    const tested = [openPlate, seatLead, lift].reduce((state, event) => send(state, event).state, connected.state);
    expect(tested.handset).toBe('off-hook');
    expect(tested.service).toBe('night');
  });
});

describe('Exchange ruling B3: one solve, one line', () => {
  it('puts CERTIFICATION on line 3, the third jack of the lowest row', () => {
    expect(CERTIFICATION_LINE).toBe(3);
    expect(LINE_CARDS[2]).toEqual({ line: 3, card: 'CERTIFICATION' });
    expect(LINE_CARDS.map(card => card.line)).toEqual(Array.from({ length: 12 }, (_, offset) => offset + 1));
    expect(new Set(LINE_CARDS.map(card => card.card)).size).toBe(12);
  });

  it('needs no reading before the plug and keeps the plug on any other jack', () => {
    const selected = play(select);
    expect(selected.plug).toBe('guide');
    expect(selected.cardRead).toBe(false);
    for (const target of otherLines) {
      const other = send(selected, { type: 'connect', target });
      expect(other.state).toBe(selected);
      expect(other.found).toEqual([]);
    }
  });

  it('forwards nothing and records nothing on Connect with the plug at rest', () => {
    const before = createExchangeState();
    const early = send(before, connect);
    expect(early.state).toBe(before);
    expect(early.found).toEqual([]);
  });

  it('seats the plug and records the solve and the form, in that order', () => {
    const connected = send(play(select), connect);
    expect(connected.state.plug).toBe('seated');
    expect(connected.found).toEqual([
      { id: 'departments-connected', kind: 'payoff', title: 'Departments connected' },
      { id: 'certification-form', kind: 'line', title: 'Certification form' },
    ]);
    expect(connected.cues).toEqual(['connect', 'drawer']);
  });

  it('treats a repeat Connect as no change at all', () => {
    const connected = play(readCard, select, connect);
    expect(connected.plug).toBe('seated');
    const repeat = send(connected, connect);
    expect(repeat.state).toBe(connected);
    expect(repeat.found).toEqual([]);
    expect(repeat.cues).toEqual([]);
    expect(send(connected, select).state).toBe(connected);
  });

  it('holds the seated plug when another jack is touched', () => {
    const connected = play(select, connect);
    for (const target of otherLines) expect(send(connected, { type: 'connect', target }).state).toBe(connected);
  });

  it('leaves a plug already in the guide where it is when selected again', () => {
    const selected = play(select);
    const again = send(selected, select);
    expect(again.state).toBe(selected);
    expect(again.cues).toEqual([]);
  });
});

describe('Exchange operator test', () => {
  const opened = () => send(createExchangeState(), openPlate);

  it('records Rule 14 on Open plate, once', () => {
    const open = opened();
    expect(open.state.plate).toBe('open');
    expect(open.found).toEqual([{ id: 'rule-14', kind: 'secret', title: 'Rule 14' }]);
    const repeat = send(open.state, openPlate);
    expect(repeat.state).toBe(open.state);
    expect(repeat.found).toEqual([]);
    expect(repeat.cues).toEqual([]);
  });

  it('leaves the lead clipped while the plate is shut', () => {
    const before = createExchangeState();
    const early = send(before, seatLead);
    expect(early.state).toBe(before);
    expect(early.cues).toEqual(['tap']);
    expect(early.found).toEqual([]);
  });

  it('records nothing on Connect operator test and rings once', () => {
    const tested = send(opened().state, seatLead);
    expect(tested.state.lead).toBe('seated');
    expect(tested.found).toEqual([]);
    expect(tested.cues).toEqual(['ring']);
    const repeat = send(tested.state, seatLead);
    expect(repeat.state).toBe(tested.state);
    expect(repeat.cues).toEqual([]);
  });

  it('records the archive title on Lift handset, under the script id, once', () => {
    const tested = send(opened().state, seatLead).state;
    const lifted = send(tested, lift);
    expect(lifted.state.handset).toBe('off-hook');
    expect(lifted.found).toEqual([{ id: 'socket-beneath-plate', kind: 'secret', title: OPERATOR_ARCHIVE_TITLE }]);
    expect(lifted.cues).toEqual(['open-line', 'ticket']);
    const repeat = send(lifted.state, lift);
    expect(repeat.state).toBe(lifted.state);
    expect(repeat.found).toEqual([]);
    expect(repeat.cues).toEqual([]);
  });

  it('gives the early handset its reading and leaves the test available', () => {
    const early = send(createExchangeState(), lift);
    expect(early.found.map(item => item.id)).toEqual(['handset-first']);
    expect(early.state.handset).toBe('cradle');
    expect(early.cues).toEqual(['dial-tone']);
    const again = send(early.state, lift);
    expect(again.state).toBe(early.state);
    expect(again.found).toEqual([]);
    const later = [openPlate, seatLead].reduce((state, event) => send(state, event).state, early.state);
    expect(send(later, lift).state.handset).toBe('off-hook');
  });

  it('keeps the handset on its cradle while the plate is open and the lead clipped', () => {
    const lifted = send(opened().state, lift);
    expect(lifted.state.handset).toBe('cradle');
    expect(lifted.found.map(item => item.id)).toEqual(['handset-first']);
  });

  it('reaches the operator ticket only after the handset, through Read tickets', () => {
    const before = createExchangeState();
    expect(send(before, readTickets).state).toBe(before);
    const seated = play(openPlate, seatLead);
    expect(send(seated, readTickets).found).toEqual([]);
    const lifted = play(openPlate, seatLead, lift);
    const read = send(lifted, readTickets);
    expect(read.found).toEqual([{ id: 'operator-ticket', kind: 'secret', title: 'Operator call ticket' }]);
    expect(send(read.state, readTickets).found).toEqual([]);
  });

  it('does not need the board solved, and the board does not need the test', () => {
    const lifted = play(openPlate, seatLead, lift);
    expect(lifted.plug).toBe('rest');
    expect(play(select, connect).lead).toBe('clipped');
    expect(play(select, connect).plate).toBe('shut');
  });
});

describe('Exchange notes', () => {
  it('records the rulebook and all thirteen rules on one reading, and never Rule 14', () => {
    const read = send(createExchangeState(), { type: 'inspect', object: 'rulebook' });
    expect(read.found.map(item => item.id)).toEqual(['rulebook', ...RULE_IDS]);
    expect(read.found.every(item => item.title !== '')).toBe(true);
    expect(read.found.map(item => item.id)).not.toContain('rule-14');
  });

  it('offers no retired object, so no lamp test can latch', () => {
    const ids: readonly string[] = EXCHANGE_OBJECTS.map(object => object.id);
    for (const retired of ['ladder', 'lamp-test', 'operator-frame', 'wanted-bell']) expect(ids).not.toContain(retired);
  });

  it('names no retired finding or event in the state machine', () => {
    expect(readFileSync(join(ROOM, 'state.ts'), 'utf8')).not.toMatch(/certification-callback|'operator-test'|answer-handset|read-next-rule/);
  });

  it('keeps the store and its second storage key deleted', () => {
    const sources = roomSources(ROOM);
    expect(sources.map(path => path.slice(ROOM.length))).not.toContain('store.ts');
    for (const path of sources) expect(readFileSync(path, 'utf8'), path).not.toContain('unheld.exchange.v1');
  });

  it('has the rulebook reader show every rule from the sealed file alone', () => {
    expect(READERS.rulebook.sealed).toEqual(['rulebook', ...RULE_IDS]);
    expect(READERS.rulebook.lines).toBeUndefined();
  });
});

describe('Exchange hints', () => {
  const stagePath = (events: readonly ExchangeEvent[]) => hintStage(play(...events));

  it('walks the rows in order along the printed route', () => {
    const rota: ExchangeEvent = { type: 'inspect', object: 'shift-roster' };
    expect(stagePath([])).toBe('arrival');
    expect(stagePath([readCard])).toBe('card-read');
    expect(stagePath([select])).toBe('plug-selected');
    expect(stagePath([select, connect])).toBe('connected');
    expect(stagePath([select, connect, openPlate])).toBe('plate-open');
    expect(stagePath([select, connect, openPlate, seatLead])).toBe('test-connected');
    expect(stagePath([select, connect, openPlate, seatLead, lift])).toBe('handset-lifted');
    expect(stagePath([select, connect, openPlate, seatLead, lift, readTickets])).toBe('tickets-read');
    expect(stagePath([select, connect, openPlate, seatLead, lift, readTickets, rota])).toBe('done');
  });

  it('ends the connected rungs at the next unread step: rulebook, then diagram, then plate', () => {
    const rulebook: ExchangeEvent = { type: 'inspect', object: 'rulebook' };
    const diagram: ExchangeEvent = { type: 'inspect', object: 'wiring-diagram' };
    const lastRung = (events: readonly ExchangeEvent[]) => HINTS[stagePath(events)][2];
    expect(lastRung([select, connect])).toBe('Choose Follow the cord. Then choose Read the rulebook.');
    expect(lastRung([select, connect, rulebook])).toBe('Choose Trace the diagram.');
    expect(lastRung([select, connect, rulebook, diagram])).toBe('Choose Open plate.');
    expect(lastRung([select, connect, diagram])).toBe('Choose Read the rulebook.');
    for (const route of [[select, connect, rulebook], [select, connect, rulebook, diagram]]) {
      expect(HINTS[stagePath(route)].join(' '), 'a read rulebook is never asked for again').not.toContain('Read the rulebook');
    }
  });

  it('puts an open plate with the handset down ahead of an unfinished board', () => {
    expect(stagePath([openPlate])).toBe('plate-open');
    expect(stagePath([openPlate, seatLead])).toBe('test-connected');
  });

  it('returns to the board once the handset is lifted and the board is unfinished', () => {
    expect(stagePath([openPlate, seatLead, lift])).toBe('arrival');
  });

  it('gives the same stage in either service', () => {
    const routes: readonly (readonly ExchangeEvent[])[] = [[], [select], [select, connect], [openPlate], [select, connect, openPlate, seatLead, lift]];
    for (const route of routes) expect(hintStage(send(play(...route), night).state)).toBe(hintStage(play(...route)));
  });

  it('prints the arrival rungs without leaning on the lamp, which night service dims', () => {
    expect(HINTS.arrival).toEqual(['One card carries a printed name.', 'It is the third jack on the lowest row.', 'Choose Read wiring card.']);
    expect(Object.keys(HINTS)).not.toContain('night');
  });
});

describe('The Exchange door', () => {
  it('keeps the annex plaque and engaged lamp', () => {
    expect(DOOR.plaque).toEqual({ text: 'THE EXCHANGE', code: 'ANNEX · BAY 06' });
    expect(DOOR.topper).toBe('lamp');
  });
});
