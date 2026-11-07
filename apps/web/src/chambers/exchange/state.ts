import type { DiscoveryStore, RoomStateRecord } from '@tqw/engine';

/**
 * The room's rules as a pure reducer. No field holds time and nothing here schedules anything, so
 * waiting cannot change the room. Views, readers, hint rungs and the last result belong to the
 * interface; only the five persisted fields and the visit's card flag live here.
 */

export type Service = 'day' | 'night';
export type PlugPosition = 'rest' | 'guide' | 'seated';
export type PlatePosition = 'shut' | 'open';
export type LeadPosition = 'clipped' | 'seated';
export type HandsetPosition = 'cradle' | 'off-hook';

export interface ExchangeState {
  readonly service: Service;
  readonly plug: PlugPosition;
  readonly plate: PlatePosition;
  readonly lead: LeadPosition;
  readonly handset: HandsetPosition;
  /** Session only: the wiring card is never a gate, so a reload may forget it. */
  readonly cardRead: boolean;
  /** Finding ids, seeded from the discovery store on mount and never written to the room record. */
  readonly discoveries: readonly string[];
}

/** The jack that carries the solve: third on the lowest row of the twelve. */
export const CERTIFICATION_LINE = 3;
export const LINE_COUNT = 12;
export const OPERATOR_ARCHIVE_TITLE = 'The socket beneath the plate';
export const EXCHANGE_RECORD_VERSION = 1;

interface FindingEntry {
  readonly kind: 'line' | 'secret' | 'payoff';
  readonly title: string;
  /** Opens the item in the sealed file; mirrored in the private source, never derived from personal data. */
  readonly token: string;
}

const paper = (title: string, token: string): FindingEntry => ({ kind: 'line', title, token });
const secret = (title: string, token: string): FindingEntry => ({ kind: 'secret', title, token });
const payoff = (title: string, token: string): FindingEntry => ({ kind: 'payoff', title, token });

/** Every finding the room can record. Titles match the sealed items and reach the shared archive. */
export const EXCHANGE_FINDINGS = {
  'departments-connected': payoff('Departments connected', 'e67d90b6be2986bce036c87bd3a10ea2'),
  'certification-form': paper('Certification form', 'c307b964f3908fd10293170abe72c137'),
  rulebook: paper("Operator's rulebook", '0f18eae5a9c7c95364160d85e9f5d983'),
  'rule-01': paper('Rule 1', '10944f5b9aac29c18e69b75fb19a4547'),
  'rule-02': paper('Rule 2', '2364dcb3f1e5e01791fb1afcbad595b2'),
  'rule-03': paper('Rule 3', '3797c98952640d82dd5c4ab99b387a6e'),
  'rule-04': paper('Rule 4', '4f7f7f4a0d16a1a25c458aa28871534f'),
  'rule-05': paper('Rule 5', '5a54df68a3552b998bbab155c820d0aa'),
  'rule-06': paper('Rule 6', '6c21f3b4714e318c86307e08e72f8b2d'),
  'rule-07': paper('Rule 7', '7f5f788635ca4e4d8f55c2b5bbe691ea'),
  'rule-08': paper('Rule 8', '8d4695036f5d2ba4cf88aeb4e808074f'),
  'rule-09': paper('Rule 9', '9a24b5e8ce612a8b75d56db311f98e3f'),
  'rule-10': paper('Rule 10', 'a2dcf45b0e663f445ad6f1a237695f83'),
  'rule-11': paper('Rule 11', 'b3ed8fbf31de42c8879d61a5cab63508'),
  'rule-12': paper('Rule 12', 'c48a42e5392912f1785e4a8fe740d3c9'),
  'rule-13': paper('Rule 13', 'd8bd3168a9f345a2e34ea67470ce8d9c'),
  'rule-14': secret('Rule 14', 'f033ee50c32e4ca3a113be8c0b67b45d'),
  'wiring-diagram': paper('Wiring diagram', 'd42255b559acdb5e89e8468bd456944b'),
  'fitter-docket': paper("Fitter's docket", 'e4ff4c35642f305c183d8ad3ed0308c9'),
  'handset-first': paper('Desk handset', '71f8521466a98c5f46a640b5227a063b'),
  'socket-beneath-plate': secret(OPERATOR_ARCHIVE_TITLE, 'ae3fc6d7388859f2e9789abb27753103'),
  'operator-ticket': secret('Operator call ticket', '40869ec74c5e4e96a95f9c9dc479e647'),
  cardigan: paper('Cardigan on the chair', '1e9ad9350d56adf53619cfedc268c220'),
  'tea-flask': paper('Tea flask', 'd268d42f08c573f37ae3f622965a604f'),
  'shift-roster': paper('Shift roster', '07dbf1ce0bb5da306cc54a52d3fb2bc3'),
  'shelf-index': paper('Shelf index', '9a826786da7ac9a819926a9bdc154945'),
} as const satisfies Record<string, FindingEntry>;

export type ExchangeFindingId = keyof typeof EXCHANGE_FINDINGS;

export const EXCHANGE_TOKENS: Readonly<Record<ExchangeFindingId, string>> = Object.fromEntries(
  Object.entries(EXCHANGE_FINDINGS).map(([id, entry]) => [id, entry.token]),
) as Record<ExchangeFindingId, string>;

export const isExchangeFinding = (id: string): id is ExchangeFindingId => Object.hasOwn(EXCHANGE_FINDINGS, id);

export const RULE_IDS = [
  'rule-01', 'rule-02', 'rule-03', 'rule-04', 'rule-05', 'rule-06', 'rule-07',
  'rule-08', 'rule-09', 'rule-10', 'rule-11', 'rule-12', 'rule-13',
] as const satisfies readonly ExchangeFindingId[];

export type ExchangeCue =
  | 'card' | 'plug' | 'connect' | 'drawer' | 'lever' | 'plate' | 'ring' | 'dial-tone' | 'open-line' | 'ticket'
  | 'page' | 'tap' | 'diagram' | 'cardigan' | 'flask' | 'shelf';

interface ReadableObject {
  readonly id: string;
  readonly finding: ExchangeFindingId;
  readonly name: string;
  readonly action: string;
  readonly node: string;
  readonly cue: ExchangeCue;
}

/** What can be read by name. The handset and plate are machine controls and have events of their own. */
export const EXCHANGE_OBJECTS = [
  { id: 'rulebook', finding: 'rulebook', name: 'Operator’s rulebook', action: 'Read the rulebook', node: 'inspect_rulebook', cue: 'page' },
  { id: 'wiring-diagram', finding: 'wiring-diagram', name: 'Wiring diagram', action: 'Trace the diagram', node: 'inspect_wiring_diagram', cue: 'diagram' },
  { id: 'cardigan', finding: 'cardigan', name: 'Cardigan on the chair', action: 'Lift the cardigan', node: 'inspect_cardigan', cue: 'cardigan' },
  { id: 'tea-flask', finding: 'tea-flask', name: 'Tea flask', action: 'Turn the cap', node: 'inspect_tea_flask', cue: 'flask' },
  { id: 'shift-roster', finding: 'shift-roster', name: 'Rota', action: 'Read rota', node: 'inspect_shift_roster', cue: 'shelf' },
  { id: 'docket', finding: 'fitter-docket', name: 'Fitter’s docket', action: 'Read docket', node: 'inspect_fitter_docket', cue: 'page' },
  { id: 'index', finding: 'shelf-index', name: 'Index', action: 'Read index', node: 'inspect_shelf_index', cue: 'shelf' },
] as const satisfies readonly ReadableObject[];

export type ExchangeObjectId = (typeof EXCHANGE_OBJECTS)[number]['id'];

export type ExchangeEvent =
  | { type: 'read-wiring-card' }
  | { type: 'select-enquiry-plug' }
  | { type: 'connect'; target: number }
  | { type: 'open-plate' }
  | { type: 'connect-operator-test' }
  | { type: 'lift-handset' }
  | { type: 'read-tickets' }
  | { type: 'inspect'; object: ExchangeObjectId }
  | { type: 'night-service'; enabled: boolean };

export interface ExchangeFinding {
  readonly id: ExchangeFindingId;
  readonly kind: FindingEntry['kind'];
  readonly title: string;
}

export interface ExchangeTransition {
  readonly state: ExchangeState;
  readonly cues: readonly ExchangeCue[];
  readonly found: readonly ExchangeFinding[];
}

export function createExchangeState(): ExchangeState {
  return { service: 'day', plug: 'rest', plate: 'shut', lead: 'clipped', handset: 'cradle', cardRead: false, discoveries: [] };
}

const idle = (state: ExchangeState, ...cues: readonly ExchangeCue[]): ExchangeTransition => ({ state, cues, found: [] });

/** Applies a change. When it moves nothing and finds nothing the same object returns, without its cues. */
function settle(
  state: ExchangeState,
  change: Partial<ExchangeState>,
  ids: readonly ExchangeFindingId[],
  ...cues: readonly ExchangeCue[]
): ExchangeTransition {
  const fresh = ids.filter(id => !state.discoveries.includes(id));
  const moved = Object.entries(change).some(([field, value]) => state[field as keyof ExchangeState] !== value);
  if (!moved && fresh.length === 0) return idle(state);
  return {
    state: { ...state, ...change, discoveries: [...state.discoveries, ...fresh] },
    cues,
    found: fresh.map(id => ({ id, kind: EXCHANGE_FINDINGS[id].kind, title: EXCHANGE_FINDINGS[id].title })),
  };
}

function connect(state: ExchangeState, target: number): ExchangeTransition {
  if (!Number.isInteger(target) || target < 1 || target > LINE_COUNT) return idle(state);
  if (target !== CERTIFICATION_LINE) return idle(state, 'card');
  if (state.plug === 'rest') return idle(state, 'card');
  if (state.plug === 'seated') return idle(state);
  return settle(state, { plug: 'seated' }, ['departments-connected', 'certification-form'], 'connect', 'drawer');
}

function liftHandset(state: ExchangeState): ExchangeTransition {
  if (state.lead === 'seated') return settle(state, { handset: 'off-hook' }, ['socket-beneath-plate'], 'open-line', 'ticket');
  return { ...settle(state, {}, ['handset-first']), cues: ['dial-tone'] };
}

function inspect(state: ExchangeState, id: ExchangeObjectId): ExchangeTransition {
  const object = EXCHANGE_OBJECTS.find(candidate => candidate.id === id);
  if (object === undefined) return idle(state);
  const ids = object.id === 'rulebook' ? [object.finding, ...RULE_IDS] : [object.finding];
  return { ...settle(state, {}, ids), cues: [object.cue] };
}

export function transitionExchange(state: ExchangeState, event: ExchangeEvent): ExchangeTransition {
  switch (event.type) {
    case 'read-wiring-card':
      return state.cardRead ? idle(state, 'card') : settle(state, { cardRead: true }, [], 'card');
    case 'select-enquiry-plug':
      return state.plug === 'rest' ? settle(state, { plug: 'guide' }, [], 'plug') : idle(state);
    case 'connect':
      return connect(state, event.target);
    case 'open-plate':
      return settle(state, { plate: 'open' }, ['rule-14'], 'plate');
    case 'connect-operator-test':
      if (state.plate === 'shut') return idle(state, 'tap');
      return settle(state, { lead: 'seated' }, [], 'ring');
    case 'lift-handset':
      return liftHandset(state);
    case 'read-tickets':
      return state.handset === 'off-hook' ? settle(state, {}, ['operator-ticket']) : idle(state);
    case 'inspect':
      return inspect(state, event.object);
    case 'night-service':
      return settle(state, { service: event.enabled ? 'night' : 'day' }, [], 'lever');
    default:
      return idle(state);
  }
}

interface HeldRecord {
  readonly service: Service;
  readonly plug: PlugPosition;
  readonly lead: LeadPosition;
}

const isOneOf = <T extends string>(value: unknown, ...allowed: readonly T[]): value is T => allowed.includes(value as T);

/** The part of a saved record findings cannot show, or null when the record is missing or refused. */
function readRecord(saved: unknown): HeldRecord | null {
  if (typeof saved !== 'object' || saved === null) return null;
  const record = saved as Record<string, unknown>;
  if (record['phase'] === 'night-service') return { service: 'night', plug: 'rest', lead: 'clipped' };
  const { version, service, plug, plate, lead, handset } = record;
  const valid = Object.keys(record).length === 6
    && version === EXCHANGE_RECORD_VERSION
    && isOneOf<Service>(service, 'day', 'night')
    && isOneOf<PlugPosition>(plug, 'rest', 'guide', 'seated')
    && isOneOf<PlatePosition>(plate, 'shut', 'open')
    && isOneOf<LeadPosition>(lead, 'clipped', 'seated')
    && isOneOf<HandsetPosition>(handset, 'cradle', 'off-hook');
  return valid ? { service, plug, lead } : null;
}

/**
 * Rebuilds the room from a saved record and the visitor's findings. Findings decide every position
 * they can show, so a record claiming more than was found cannot strand a finding behind a control
 * that has already moved. The record adds only what findings cannot show: the service, a plug in
 * the guide and a lead seated before the handset.
 */
export function restoreExchangeState(saved: unknown, found: readonly string[]): ExchangeState {
  const held = readRecord(saved);
  const discoveries = found.filter(isExchangeFinding);
  const tested = discoveries.includes('socket-beneath-plate');
  const plate = tested || discoveries.includes('rule-14') ? 'open' : 'shut';
  return {
    ...createExchangeState(),
    service: held?.service ?? 'day',
    plug: discoveries.includes('departments-connected') ? 'seated' : held?.plug === 'guide' ? 'guide' : 'rest',
    plate,
    lead: tested || (plate === 'open' && held?.lead === 'seated') ? 'seated' : 'clipped',
    handset: tested ? 'off-hook' : 'cradle',
    discoveries,
  };
}

export function exchangeRecord(state: ExchangeState): RoomStateRecord {
  const { service, plug, plate, lead, handset } = state;
  return { version: EXCHANGE_RECORD_VERSION, service, plug, plate, lead, handset };
}

type RoomStore = Pick<DiscoveryStore, 'getState' | 'getRoomState' | 'setRoomState'>;

export function loadExchangeState(store: RoomStore | undefined): ExchangeState {
  if (store === undefined) return createExchangeState();
  const found = store.getState().found.exchange ?? [];
  return restoreExchangeState(store.getRoomState('exchange'), found.map(finding => finding.id));
}

/**
 * Mirrors the room into the one discovery key. ADR 0003 R-1 keeps that key untouched until the
 * first finding, so a room with no Exchange finding writes nothing and its service is not kept.
 */
export function saveExchangeState(store: RoomStore | undefined, state: ExchangeState): void {
  if (store === undefined || (store.getState().found.exchange ?? []).length === 0) return;
  store.setRoomState('exchange', exchangeRecord(state));
}
