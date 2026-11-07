import type { TomorrowStationId } from './stage.ts';

export const TOMORROW_SCRIPT_VERSION = 6 as const;

export type TomorrowPhase = 'ready' | 'wound' | 'record-opened' | 'braked' | 'withdrawn';
export type TicketFace = 'front' | 'reverse';
export type TomorrowAction =
  | 'wind'
  | 'read-record'
  | 'brake'
  | 'withdraw'
  | 'read-instructions'
  | 'read-ticket'
  | 'open-sleeve'
  | 'lift-stop-tab'
  | 'turn-over'
  | 'show-front'
  | 'arrange-together'
  | 'examine-structure'
  | 'examine-glass'
  | 'examine-casing'
  | 'examine-gearing'
  | 'examine-carriage'
  | 'read-starting-mark'
  | 'read-work-label'
  | 'examine-lamp'
  | 'read-title'
  | 'read-inscription'
  | 'examine-linkage'
  | 'examine-paper-support';

export interface TomorrowRoomPayload {
  scriptVersion: 6;
  phase: TomorrowPhase;
  station: TomorrowStationId;
  sleeveOpen: boolean;
  stopTabOpen: boolean;
  completed: boolean;
}

export interface TomorrowEngineState extends TomorrowRoomPayload {
  result: string;
  acknowledgement: string | null;
  ticketFace: TicketFace;
}

export type TomorrowEngineEvent =
  | { type: 'action'; action: TomorrowAction }
  | { type: 'station'; station: TomorrowStationId }
  | { type: 'restore'; payload: unknown }
  | { type: 'reset' }
  | { type: 'acknowledge'; title: string | null };

const PHASE_RANK: Readonly<Record<TomorrowPhase, number>> = {
  ready: 0,
  wound: 1,
  'record-opened': 2,
  braked: 3,
  withdrawn: 4,
};

const STATION_IDS: readonly TomorrowStationId[] = ['winding-control', 'date-display', 'carriage', 'service-hatch'];

export const TICKET_LINES = [
  'DELIVERY: One completed tomorrow.',
  'INBOUND RECORD: THE EXCHANGE / CERTIFICATION enquiries forwarded here. Routing only; no approval issued.',
  'RELEASE REQUIRES: Certification approval.',
  'RETURN ENQUIRY TO: CERTIFICATION OFFICE — ROUTING TRAY.',
  'DRAWING: GREAT ATRIUM — ROUTING AND SUPPORT SECTION.',
] as const;

export function createTomorrowEngineState(payload?: unknown): TomorrowEngineState {
  const ready: TomorrowEngineState = {
    scriptVersion: TOMORROW_SCRIPT_VERSION,
    phase: 'ready',
    station: 'winding-control',
    sleeveOpen: false,
    stopTabOpen: false,
    completed: false,
    result: 'THE TOMORROW ENGINE',
    acknowledgement: null,
    ticketFace: 'front',
  };
  if (!isPayload(payload)) {
    const completed = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      && (payload as { completed?: unknown }).completed === true;
    return completed ? { ...ready, completed: true } : ready;
  }
  const result = payload.phase === 'withdrawn'
    ? 'The date advances; delivery still requires unavailable approval.'
    : payload.phase === 'braked'
      ? 'Brake applied. Dispatch ticket available — service hatch.'
      : payload.phase === 'record-opened'
        ? 'Date advanced one day. Carriage displacement: zero. Brake released for use.'
        : payload.phase === 'wound'
          ? 'Movement record ready — date display.'
          : ready.result;
  return {
    ...ready,
    phase: payload.phase,
    station: payload.station,
    sleeveOpen: payload.sleeveOpen,
    stopTabOpen: payload.stopTabOpen,
    completed: payload.completed,
    result,
  };
}

export function payloadForTomorrowEngine(state: TomorrowEngineState): TomorrowRoomPayload {
  return {
    scriptVersion: TOMORROW_SCRIPT_VERSION,
    phase: state.phase,
    station: state.station,
    sleeveOpen: state.sleeveOpen,
    stopTabOpen: state.stopTabOpen,
    completed: state.completed,
  };
}

export function isTomorrowPhase(value: unknown): value is TomorrowPhase {
  return value === 'ready' || value === 'wound' || value === 'record-opened' || value === 'braked' || value === 'withdrawn';
}

function isPayload(value: unknown): value is TomorrowRoomPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<TomorrowRoomPayload>;
  const keys = Object.keys(value);
  return candidate.scriptVersion === TOMORROW_SCRIPT_VERSION
    && keys.length === 6
    && ['scriptVersion', 'phase', 'station', 'sleeveOpen', 'stopTabOpen', 'completed'].every((key) => keys.includes(key))
    && isTomorrowPhase(candidate.phase)
    && STATION_IDS.includes(candidate.station as TomorrowStationId)
    && typeof candidate.sleeveOpen === 'boolean'
    && typeof candidate.stopTabOpen === 'boolean'
    && typeof candidate.completed === 'boolean'
    && (candidate.phase !== 'withdrawn' || candidate.completed);
}

function changed(state: TomorrowEngineState, patch: Partial<TomorrowEngineState>): TomorrowEngineState {
  return { ...state, ...patch, scriptVersion: TOMORROW_SCRIPT_VERSION };
}

export function nextPrimaryAction(state: TomorrowEngineState): TomorrowAction {
  switch (state.phase) {
    case 'ready': return 'wind';
    case 'wound': return 'read-record';
    case 'record-opened': return 'brake';
    case 'braked': return 'withdraw';
    case 'withdrawn': return 'read-ticket';
  }
}

export function primaryActionLabel(state: TomorrowEngineState): string {
  const labels: Readonly<Record<TomorrowAction, string>> = {
    wind: 'Wind once',
    'read-record': 'Read movement record',
    brake: 'Apply brake',
    withdraw: 'Withdraw ticket',
    'read-ticket': 'Read dispatch ticket',
    'read-instructions': 'Read instructions',
    'open-sleeve': 'Open hour sleeve',
    'lift-stop-tab': 'Lift stop tab',
    'turn-over': 'Turn over',
    'show-front': 'Show front',
    'arrange-together': 'Arrange together',
    'examine-structure': 'Examine structure',
    'examine-glass': 'Examine clerestory glass',
    'examine-casing': 'Examine engine casing',
    'examine-gearing': 'Examine date gearing',
    'examine-carriage': 'Examine carriage stop',
    'read-starting-mark': 'Read starting mark',
    'read-work-label': 'Read WORK COMPLETED',
    'examine-lamp': 'Examine work light',
    'read-title': 'Read room plaque',
    'read-inscription': 'Read inscription',
    'examine-linkage': 'Examine linkage',
    'examine-paper-support': 'Examine paper support',
  };
  return labels[nextPrimaryAction(state)];
}

export function transitionTomorrowEngine(state: TomorrowEngineState, event: TomorrowEngineEvent): TomorrowEngineState {
  if (event.type === 'station') return changed(state, { station: event.station });
  if (event.type === 'acknowledge') return changed(state, { acknowledgement: event.title });
  if (event.type === 'restore') return createTomorrowEngineState(event.payload);
  if (event.type === 'reset') {
    return {
      ...createTomorrowEngineState(),
      completed: state.completed,
      result: 'Mechanism reset. Archive retained.',
      acknowledgement: null,
    };
  }

  const action = event.action;
  switch (action) {
    case 'wind':
      if (state.phase !== 'ready') return changed(state, { result: 'Movement already recorded.' });
      return changed(state, { phase: 'wound', station: 'winding-control', result: 'Movement record ready — date display.' });
    case 'read-record':
      if (state.phase === 'ready') return changed(state, { result: 'Wind once to produce the movement record.' });
      if (state.phase !== 'wound') return changed(state, { result: 'Movement already read.' });
      return changed(state, {
        phase: 'record-opened',
        station: 'date-display',
        result: 'Date advanced one day. Carriage displacement: zero. Brake released for use.',
      });
    case 'brake':
      if (PHASE_RANK[state.phase] >= PHASE_RANK.braked) return changed(state, { result: 'Brake applied.' });
      if (state.phase !== 'record-opened') return changed(state, { result: 'Wind once, then open the movement record to release the brake.' });
      return changed(state, { phase: 'braked', station: 'winding-control', result: 'Brake applied. Dispatch ticket available — service hatch.' });
    case 'withdraw':
      if (state.phase === 'withdrawn') return changed(state, {
        result: 'Ticket already withdrawn.',
        station: 'service-hatch',
        ticketFace: 'front',
      });
      if (state.phase !== 'braked') return changed(state, { result: 'Apply brake to release the dispatch ticket.' });
      return changed(state, {
        phase: 'withdrawn',
        station: 'service-hatch',
        completed: true,
        ticketFace: 'front',
        result: 'The date advances; delivery still requires unavailable approval.',
      });
    case 'read-instructions':
      if (state.phase === 'ready') return changed(state, { result: 'Available after winding.' });
      return changed(state, { result: 'Winding instructions.' });
    case 'read-ticket':
      if (state.phase !== 'withdrawn') return changed(state, { result: 'Available after ticket withdrawal.' });
      return changed(state, { station: 'service-hatch', ticketFace: 'front', result: 'Dispatch ticket.' });
    case 'open-sleeve':
      return changed(state, {
        sleeveOpen: true,
        station: 'carriage',
        result: state.sleeveOpen ? 'Hour sleeve already open.' : 'Hour sleeve open.',
      });
    case 'lift-stop-tab':
      return changed(state, {
        stopTabOpen: true,
        station: 'carriage',
        result: state.stopTabOpen ? 'Stop tab already lifted.' : 'Stop tab lifted. Wheels turn freely.',
      });
    case 'turn-over':
      return state.phase === 'withdrawn'
        ? changed(state, { station: 'service-hatch', ticketFace: 'reverse', result: 'Return address: preprinted.' })
        : state;
    case 'show-front':
      return state.phase === 'withdrawn'
        ? changed(state, { station: 'service-hatch', ticketFace: 'front', result: 'Dispatch ticket — front.' })
        : state;
    case 'arrange-together':
      return changed(state, { result: 'Joint record.', station: 'carriage' });
    case 'examine-structure': return changed(state, { result: 'Engine-room structure.' });
    case 'examine-glass': return changed(state, { result: 'Clerestory glass.' });
    case 'examine-casing': return changed(state, { result: 'Engine casing.' });
    case 'examine-gearing': return changed(state, { result: 'Date gearing. Operate it with Wind once.' });
    case 'examine-carriage': return changed(state, { result: 'Carriage at starting stop.' });
    case 'read-starting-mark': return changed(state, { result: 'Starting mark. Carriage edge unchanged.' });
    case 'read-work-label': return changed(state, { result: 'WORK COMPLETED' });
    case 'examine-lamp': return changed(state, { result: 'Engine work light.' });
    case 'read-title': return changed(state, { result: 'THE TOMORROW ENGINE' });
    case 'read-inscription': return changed(state, { result: 'PREPARATION FOR PREPARATION.' });
    case 'examine-linkage': return changed(state, { result: 'Inspection linkage.' });
    case 'examine-paper-support': return changed(state, { result: 'Paper support.' });
  }
}

export const TOMORROW_PHASE_RANK = PHASE_RANK;
