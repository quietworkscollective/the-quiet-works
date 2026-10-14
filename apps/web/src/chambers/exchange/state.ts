export const EXCHANGE_OBJECTS = [
  { id: 'handset', finding: 'handset-first', name: 'Desk handset', action: 'Lift the handset', node: 'inspect_handset' },
  { id: 'rulebook', finding: 'rulebook', name: 'Operator’s rulebook', action: 'Read the rulebook', node: 'inspect_rulebook' },
  { id: 'wiring-diagram', finding: 'wiring-diagram', name: 'Wiring diagram', action: 'Trace the diagram', node: 'inspect_wiring_diagram' },
  { id: 'ladder', finding: 'ladder', name: 'Rolling ladder', action: 'Move the ladder', node: 'inspect_ladder' },
  { id: 'lamp-test', finding: 'lamp-test', name: 'Lamp-test button', action: 'Test the lamps', node: 'inspect_lamp_test' },
  { id: 'tea-flask', finding: 'tea-flask', name: 'Tea flask', action: 'Turn the cap', node: 'inspect_tea_flask' },
  { id: 'cardigan', finding: 'cardigan', name: 'Cardigan on the chair', action: 'Lift the cardigan', node: 'inspect_cardigan' },
  { id: 'shift-roster', finding: 'shift-roster', name: 'Shift roster', action: 'Read the roster', node: 'inspect_shift_roster' },
  { id: 'operator-frame', finding: 'operator-frame', name: 'Operator of the month frame', action: 'Tilt the frame', node: 'inspect_operator_frame' },
  { id: 'wanted-bell', finding: 'wanted-bell', name: 'Operator wanted bell', action: 'Ring the bell', node: 'inspect_wanted_bell' },
] as const;

export type ExchangeObjectId = (typeof EXCHANGE_OBJECTS)[number]['id'];
export const EXCHANGE_LINE_COUNT = 12;
export const CERTIFICATION_LINE = 9;

export type ExchangePhase = 'serving' | 'night-service' | 'operator-lit' | 'operator-ringing';

export interface ExchangeState {
  readonly elapsedMs: number;
  readonly lastActivityMs: number;
  readonly phase: ExchangePhase;
  readonly litLines: readonly number[];
  readonly connectedLines: readonly number[];
  readonly operatorLamp: boolean;
  readonly cordRelease: boolean;
  readonly rulePage: number;
  readonly diagramTraced: boolean;
  readonly lampTestUntil: number;
  readonly lampTestAvailableAt: number;
  readonly discoveries: readonly string[];
  readonly tokens: Readonly<Record<string, string>>;
}

export type ExchangeEvent =
  | { type: 'tick'; elapsedMs: number }
  | { type: 'connect'; target: number | 'operator' }
  | { type: 'inspect'; object: ExchangeObjectId }
  | { type: 'read-next-rule' }
  | { type: 'answer-handset' };

export interface ExchangeTransition {
  readonly state: ExchangeState;
  readonly cues: readonly ('soft-tick' | 'relay-click' | 'cord-fall' | 'night-switch' | 'old-ring' | 'lamp-test' | 'dial-tone' | 'page-turn' | 'desk-bell')[];
  readonly found: readonly { id: string; kind: 'line' | 'secret' }[];
}

const EMPTY: ExchangeTransition = { state: null as unknown as ExchangeState, cues: [], found: [] };
export const EXCHANGE_LAMP_TIMES = [10_000, 18_000, 26_000, 34_000, 42_000, 50_000, 58_000, 84_000, 112_000, 148_000, 194_000, 244_000] as const;
const IDLE_SERVICE_MS = 25_000;
const SATURATION_MS = 300_000;

/** Opaque sealing tokens are mirrored in the private source files, never derived from personal data. */
export const EXCHANGE_TOKENS: Readonly<Record<string, string>> = {
  'handset-first': '71f8521466a98c5f46a640b5227a063b',
  'rulebook': '0f18eae5a9c7c95364160d85e9f5d983',
  'wiring-diagram': 'd42255b559acdb5e89e8468bd456944b',
  'ladder': '8d0ef3412ca7a14de78b5f5799d6cb99',
  'lamp-test': '049fec1ab202a354b7fa14e676a89f12',
  'tea-flask': 'd268d42f08c573f37ae3f622965a604f',
  'cardigan': '1e9ad9350d56adf53619cfedc268c220',
  'shift-roster': '07dbf1ce0bb5da306cc54a52d3fb2bc3',
  'operator-frame': 'ee6eb18a521284e97d01ebcb6db0589b',
  'wanted-bell': '2d869d3c0d2d6a58427295b2d236f13e',
  'operator-ticket': '40869ec74c5e4e96a95f9c9dc479e647',
  'certification-callback': 'f115f456bd878e9d3851a8be9067f41c',
  'rule-14': 'f033ee50c32e4ca3a113be8c0b67b45d',
  'rule-01': '10944f5b9aac29c18e69b75fb19a4547',
  'rule-02': '2364dcb3f1e5e01791fb1afcbad595b2',
  'rule-03': '3797c98952640d82dd5c4ab99b387a6e',
  'rule-04': '4f7f7f4a0d16a1a25c458aa28871534f',
  'rule-05': '5a54df68a3552b998bbab155c820d0aa',
  'rule-06': '6c21f3b4714e318c86307e08e72f8b2d',
  'rule-07': '7f5f788635ca4e4d8f55c2b5bbe691ea',
  'rule-08': '8d4695036f5d2ba4cf88aeb4e808074f',
  'rule-09': '9a24b5e8ce612a8b75d56db311f98e3f',
  'rule-10': 'a2dcf45b0e663f445ad6f1a237695f83',
  'rule-11': 'b3ed8fbf31de42c8879d61a5cab63508',
  'rule-12': 'c48a42e5392912f1785e4a8fe740d3c9',
  'rule-13': 'd8bd3168a9f345a2e34ea67470ce8d9c',
};

export function createExchangeState(): ExchangeState {
  return {
    elapsedMs: 0,
    lastActivityMs: 0,
    phase: 'serving',
    litLines: [],
    connectedLines: [],
    operatorLamp: false,
    cordRelease: false,
    rulePage: 0,
    diagramTraced: false,
    lampTestUntil: 0,
    lampTestAvailableAt: 0,
    discoveries: [],
    tokens: {},
  };
}

function remember(state: ExchangeState, id: string): { state: ExchangeState; finding: { id: string; kind: 'line' | 'secret' } | null } {
  if (state.discoveries.includes(id)) return { state, finding: null };
  const kind = id === 'operator-ticket' || id === 'certification-callback' || id === 'rule-14' ? 'secret' : 'line';
  const token = EXCHANGE_TOKENS[id];
  return {
    state: {
      ...state,
      discoveries: [...state.discoveries, id],
      ...(token === undefined ? {} : { tokens: { ...state.tokens, [id]: token } }),
    },
    finding: { id, kind },
  };
}

function rememberMany(state: ExchangeState, ids: readonly string[]) {
  const found: { id: string; kind: 'line' | 'secret' }[] = [];
  let current = state;
  for (const id of ids) {
    const next = remember(current, id);
    current = next.state;
    if (next.finding) found.push(next.finding);
  }
  return { state: current, found };
}

/** A deterministic room transition. Time arrives only as bounded timer events; no render loop is needed at rest. */
export function transitionExchange(state: ExchangeState, event: ExchangeEvent): ExchangeTransition {
  if (event.type === 'tick') {
    const elapsedMs = Math.max(state.elapsedMs, event.elapsedMs);
    if (state.phase !== 'serving') return { ...EMPTY, state: { ...state, elapsedMs } };
    const due = EXCHANGE_LAMP_TIMES.filter((at) => at <= elapsedMs).length;
    const litLines = Array.from({ length: due }, (_, index) => index + 1).filter((line) =>
      !state.connectedLines.includes(line),
    );
    if (elapsedMs - state.lastActivityMs >= IDLE_SERVICE_MS) {
      return { state: { ...state, elapsedMs, phase: 'night-service', litLines, operatorLamp: true }, cues: ['night-switch'], found: [] };
    }
    if (elapsedMs >= SATURATION_MS) {
      return { state: { ...state, elapsedMs, phase: 'operator-lit', litLines: [], connectedLines: [], operatorLamp: true, cordRelease: true }, cues: ['cord-fall'], found: [] };
    }
    const newlyLit = litLines.length > state.litLines.length;
    return {
      state: { ...state, elapsedMs, litLines },
      cues: newlyLit ? ['soft-tick'] : [],
      found: [],
    };
  }

  if (event.type === 'connect') {
    const activity = { ...state, lastActivityMs: state.elapsedMs };
    if (event.target === 'operator') {
      if (!state.operatorLamp || state.phase === 'operator-ringing') return { ...EMPTY, state };
      return { state: { ...activity, phase: 'operator-ringing', operatorLamp: false }, cues: ['relay-click', 'old-ring'], found: [] };
    }
    if (state.phase !== 'serving' || !state.litLines.includes(event.target) || state.connectedLines.includes(event.target)) {
      return { ...EMPTY, state };
    }
    const connectedLines = [...state.connectedLines, event.target];
    const nextLine = connectedLines.length + 1;
    let next: ExchangeState = {
      ...activity,
      connectedLines,
      litLines: [...state.litLines.filter((line) => line !== event.target), ...(nextLine <= EXCHANGE_LINE_COUNT && !connectedLines.includes(nextLine) ? [nextLine] : [])],
    };
    const found: { id: string; kind: 'line' | 'secret' }[] = [];
    if (event.target === CERTIFICATION_LINE) {
      const remembered = remember(next, 'certification-callback');
      next = remembered.state;
      if (remembered.finding) found.push(remembered.finding);
    }
    if (connectedLines.length >= EXCHANGE_LINE_COUNT) {
      next = { ...next, phase: 'operator-lit', litLines: [], connectedLines: [], operatorLamp: true, cordRelease: true };
      return { state: next, cues: ['relay-click', 'cord-fall'], found };
    }
    return { state: next, cues: ['relay-click'], found };
  }

  if (event.type === 'inspect') {
    let next: ExchangeState = { ...state, lastActivityMs: state.elapsedMs };
    const ids: string[] = [];
    const cues: ExchangeTransition['cues'][number][] = [];
    if (event.object === 'handset') {
      if (state.phase === 'operator-ringing') ids.push('operator-ticket');
      else ids.push('handset-first');
      cues.push(state.phase === 'operator-ringing' ? 'old-ring' : 'dial-tone');
    } else if (event.object === 'rulebook') {
      if (next.rulePage === 0) next = { ...next, rulePage: 1 };
      ids.push('rulebook', `rule-${String(next.rulePage).padStart(2, '0')}`);
    } else if (event.object === 'wiring-diagram') {
      next = { ...next, diagramTraced: true };
      ids.push('wiring-diagram');
    } else if (event.object === 'lamp-test') {
      if (state.elapsedMs >= state.lampTestAvailableAt) {
        next = { ...next, lampTestUntil: state.elapsedMs + 1_000, lampTestAvailableAt: state.elapsedMs + 10_000 };
        ids.push('lamp-test');
        cues.push('lamp-test');
      }
    } else {
      ids.push(event.object);
      cues.push(event.object === 'wanted-bell' ? 'desk-bell' : 'relay-click');
    }
    let found: ExchangeTransition['found'] = [];
    if (ids.length) {
      const remembered = rememberMany(next, ids);
      next = remembered.state;
      found = remembered.found;
    }
    if (next.rulePage > 0 && next.diagramTraced && !next.operatorLamp) {
      next = { ...next, operatorLamp: true };
    }
    return { state: next, cues, found };
  }

  if (event.type === 'read-next-rule') {
    if (state.rulePage < 1 || state.rulePage >= 13) return { ...EMPTY, state };
    const rulePage = state.rulePage + 1;
    let next = { ...state, lastActivityMs: state.elapsedMs, rulePage };
    const remembered = remember(next, `rule-${String(rulePage).padStart(2, '0')}`);
    next = remembered.state;
    const found = remembered.finding ? [remembered.finding] : [];
    if (rulePage === 13) {
      const last = remember(next, 'rule-14');
      next = last.state;
      if (last.finding) found.push(last.finding);
    }
    return { state: next, cues: ['page-turn'], found };
  }

  if (event.type === 'answer-handset') {
    if (state.phase !== 'operator-ringing') return { ...EMPTY, state };
    const remembered = remember({ ...state, lastActivityMs: state.elapsedMs }, 'operator-ticket');
    return { state: remembered.state, cues: ['relay-click'], found: remembered.finding ? [remembered.finding] : [] };
  }
  return { ...EMPTY, state };
}

/** Next bounded state-machine wake: the next lamp, idle service, or saturation cutoff. */
export function nextExchangeTick(state: ExchangeState): number | null {
  if (state.phase !== 'serving') return null;
  const nextLamp = EXCHANGE_LAMP_TIMES.find((at) => at > state.elapsedMs) ?? SATURATION_MS;
  const lampTestEnd = state.lampTestUntil > state.elapsedMs ? state.lampTestUntil : SATURATION_MS;
  return Math.min(nextLamp, state.lastActivityMs + IDLE_SERVICE_MS, SATURATION_MS, lampTestEnd);
}
