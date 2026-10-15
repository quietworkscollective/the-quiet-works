export const APARTMENT_OBJECTS = [
  { id: 'phone', label: 'Phone', action: 'Read the phone', station: 'threshold', description: 'A quiet phone rests on the table.' },
  { id: 'kettle', label: 'Kettle', action: 'Test the switch', station: 'kitchen', description: 'An enamel kettle sits beside the sink.' },
  { id: 'faucet', label: 'Faucet', action: 'Turn the valve', station: 'kitchen', description: 'A chrome valve controls a short run of water.' },
  { id: 'keys', label: 'Keys', action: 'Arrange the keys', station: 'threshold', description: 'Three brass keys rest on an entry shelf.' },
  { id: 'chair', label: 'Kitchen chair', action: 'Slide the chair', station: 'table', description: 'A wooden chair waits beside the table.' },
  { id: 'bill', label: 'Unpaid bill', action: 'Read the bill', station: 'table', description: 'A cream paper bill lies on the table.' },
  { id: 'cup', label: 'Cup and saucer', action: 'Lift the cup', station: 'table', description: 'Two unmatched cups share the table.' },
  { id: 'magnet', label: 'Refrigerator magnet', action: 'Turn the magnet', station: 'kitchen', description: 'A painted magnet holds a blank list.' },
  { id: 'window', label: 'Window latch', action: 'Open the window', station: 'window', description: 'A brass latch opens a narrow gap.' },
  { id: 'cushion', label: 'Sofa cushion', action: 'Lift the cushion', station: 'sofa', description: 'A worn cushion rests on the sofa.' },
  { id: 'platform', label: 'Floor seam', action: 'Inspect the platform', station: 'window', description: 'A flush wooden platform has a brass seam and a low gate.' },
  { id: 'underside', label: 'Table underside', action: 'Inspect beneath the table', station: 'table', description: 'A pencil mark sits beneath the table.' },
] as const;

export type ApartmentObjectId = (typeof APARTMENT_OBJECTS)[number]['id'];
export type ApartmentStationId = (typeof APARTMENT_OBJECTS)[number]['station'];
export type ReplyChoice = 'fine' | 'tired' | 'talk-later' | 'not-sure' | 'still-here' | 'later-please' | 'unsure';
export type ReplySet = 'closed' | 'default' | 'revised' | 'unsure';
export type ApartmentPath = 'none' | 'engage' | 'investigate' | 'stop';
export type ApartmentFindingId =
  | 'phone-message' | 'reply-options-default' | 'reply-options-revised' | 'reply-unsure' | 'outward-reply'
  | 'unpaid-bill' | 'missed-call' | 'bent-house-key' | 'bent-house-key-note' | 'under-saucer'
  | 'fourth-line' | 'repair-patch' | 'saucer-inscription';

export interface ApartmentState {
  path: ApartmentPath;
  phoneInspections: number;
  replySet: ReplySet;
  selectedReply: ReplyChoice | null;
  outwardReply: boolean;
  idleElapsedMs: number;
  unansweredElapsedMs: number;
  waiting: boolean;
  elevatorAvailable: boolean;
  elevatorGateRaised: boolean;
  elevatorPlatformIntact: true;
  kettleOn: boolean;
  faucetFlow: 0 | 1 | 2;
  keyArrangement: 0 | 1;
  keyArrangementCount: number;
  chairSlid: boolean;
  billRead: boolean;
  cupLifted: boolean;
  saucerTurned: boolean;
  magnetTurned: boolean;
  windowOpen: boolean;
  cushionLifted: boolean;
  platformInspected: boolean;
  touched: readonly ApartmentObjectId[];
  found: readonly ApartmentFindingId[];
}

export type ApartmentEvent =
  | { type: 'touch'; object: ApartmentObjectId; action?: 'turn-saucer' | 'compare-latch' }
  | { type: 'reply'; choice: ReplyChoice }
  | { type: 'wait' }
  | { type: 'tick'; elapsedMs: number }
  | { type: 'select-elevator' }
  | { type: 'reset-elevator' };

export const APARTMENT_TOKENS: Readonly<Record<ApartmentFindingId, string>> = {
  'phone-message': 'apartment-phone-message',
  'reply-options-default': 'apartment-reply-options-default',
  'reply-options-revised': 'apartment-reply-options-revised',
  'reply-unsure': 'apartment-reply-unsure',
  'outward-reply': 'apartment-outward-reply',
  'unpaid-bill': 'apartment-unpaid-bill',
  'missed-call': 'apartment-missed-call',
  'bent-house-key': 'apartment-bent-house-key',
  'bent-house-key-note': 'apartment-bent-house-key-note',
  'under-saucer': 'apartment-under-saucer',
  'fourth-line': 'apartment-fourth-line',
  'repair-patch': 'apartment-repair-patch',
  'saucer-inscription': 'apartment-saucer-inscription',
};

export function createApartmentState(): ApartmentState {
  return {
    path: 'none', phoneInspections: 0, replySet: 'closed', selectedReply: null, outwardReply: false,
    idleElapsedMs: 0, unansweredElapsedMs: 0, waiting: false, elevatorAvailable: false,
    elevatorGateRaised: false, elevatorPlatformIntact: true, kettleOn: false, faucetFlow: 0,
    keyArrangement: 0, keyArrangementCount: 0, chairSlid: false, billRead: false, cupLifted: false,
    saucerTurned: false, magnetTurned: false, windowOpen: false, cushionLifted: false,
    platformInspected: false, touched: [], found: [],
  };
}

function addFindings(state: ApartmentState, ...findings: ApartmentFindingId[]): readonly ApartmentFindingId[] {
  return [...new Set([...state.found, ...findings])];
}

function replySetFor(state: ApartmentState): ReplySet {
  if (state.selectedReply) return state.replySet;
  if (state.unansweredElapsedMs >= 20_000) return 'unsure';
  if (state.phoneInspections >= 3) return 'revised';
  if (state.phoneInspections > 0) return 'default';
  return 'closed';
}

function allowedReply(choice: ReplyChoice, set: ReplySet): boolean {
  if (set === 'default') return choice === 'fine' || choice === 'tired' || choice === 'talk-later';
  if (set === 'revised') return choice === 'not-sure' || choice === 'still-here' || choice === 'later-please';
  return set === 'unsure' && choice === 'unsure';
}

function addTouch(state: ApartmentState, object: ApartmentObjectId): readonly ApartmentObjectId[] {
  return state.touched.includes(object) ? state.touched : [...state.touched, object];
}

export function transitionApartmentState(state: ApartmentState, event: ApartmentEvent): ApartmentState {
  if (event.type === 'tick') {
    const elapsedMs = Math.max(0, Math.min(20_000, Math.floor(event.elapsedMs)));
    const idleElapsedMs = Math.min(12_000, state.idleElapsedMs + elapsedMs);
    const unansweredElapsedMs = state.selectedReply ? state.unansweredElapsedMs : Math.min(20_000, state.unansweredElapsedMs + elapsedMs);
    const next = {
      ...state,
      idleElapsedMs,
      unansweredElapsedMs,
      elevatorAvailable: state.elevatorAvailable || state.touched.length > 0 || idleElapsedMs >= 12_000,
      replySet: state.selectedReply ? state.replySet : unansweredElapsedMs >= 20_000 ? 'unsure' as const : state.replySet,
      path: !state.selectedReply && unansweredElapsedMs >= 20_000 && state.path === 'none' ? 'stop' as const : state.path,
    };
    if (next.replySet === 'unsure' && !next.found.includes('reply-unsure')) next.found = addFindings(state, 'reply-unsure');
    return next;
  }

  if (event.type === 'wait') {
    return { ...state, waiting: true };
  }

  if (event.type === 'reply') {
    if (!allowedReply(event.choice, replySetFor(state))) return state;
    const path = state.path === 'none' ? 'engage' : state.path;
    return {
      ...state,
      path,
      replySet: replySetFor(state),
      selectedReply: event.choice,
      outwardReply: true,
      found: addFindings(state, 'outward-reply'),
    };
  }

  if (event.type === 'select-elevator') {
    if (!state.elevatorAvailable) return state;
    return { ...state, elevatorGateRaised: true };
  }

  if (event.type === 'reset-elevator') return { ...state, elevatorGateRaised: false };

  const common = {
    ...state,
    touched: addTouch(state, event.object),
    elevatorAvailable: true,
  };
  switch (event.object) {
    case 'phone': {
      const phoneInspections = Math.min(3, state.phoneInspections + 1);
      const replySet = state.selectedReply ? state.replySet : state.unansweredElapsedMs >= 20_000 ? 'unsure' : phoneInspections >= 3 ? 'revised' : 'default';
      const path = state.path === 'none' && phoneInspections >= 3 ? 'investigate' : state.path;
      return {
        ...common,
        phoneInspections,
        replySet,
        path,
        found: addFindings(state, 'phone-message', 'missed-call', replySet === 'revised' ? 'reply-options-revised' : replySet === 'unsure' ? 'reply-unsure' : 'reply-options-default'),
      };
    }
    case 'kettle': return { ...common, kettleOn: !state.kettleOn };
    case 'faucet': return { ...common, faucetFlow: ((state.faucetFlow + 1) % 3) as 0 | 1 | 2 };
    case 'keys': {
      if (event.action === 'compare-latch' && state.keyArrangementCount > 0) {
        return { ...common, found: addFindings(state, 'bent-house-key-note') };
      }
      const keyArrangementCount = Math.min(2, state.keyArrangementCount + 1);
      const revealed = keyArrangementCount >= 2 ? ['bent-house-key'] as const : [];
      return { ...common, keyArrangement: state.keyArrangement === 0 ? 1 : 0, keyArrangementCount, found: addFindings(state, ...revealed) };
    }
    case 'chair': return { ...common, chairSlid: !state.chairSlid };
    case 'bill': return { ...common, billRead: true, found: addFindings(state, 'unpaid-bill') };
    case 'cup': {
      if (event.action === 'turn-saucer' && state.cupLifted && state.chairSlid) {
        return { ...common, saucerTurned: true, found: addFindings(state, 'saucer-inscription') };
      }
      const cupLifted = !state.cupLifted;
      return { ...common, cupLifted, found: cupLifted && state.chairSlid ? addFindings(state, 'under-saucer') : state.found };
    }
    case 'magnet': return { ...common, magnetTurned: !state.magnetTurned };
    case 'window': return { ...common, windowOpen: !state.windowOpen };
    case 'cushion': return { ...common, cushionLifted: !state.cushionLifted, found: addFindings(state, 'repair-patch') };
    case 'platform': return { ...common, platformInspected: true };
    case 'underside': return state.waiting || state.unansweredElapsedMs >= 20_000
      ? { ...common, found: addFindings(state, 'fourth-line') }
      : common;
  }
}

export function nextApartmentTick(state: ApartmentState): number | null {
  const idle = state.elevatorAvailable ? Infinity : Math.max(0, 12_000 - state.idleElapsedMs);
  const unanswered = state.selectedReply ? Infinity : Math.max(0, 20_000 - state.unansweredElapsedMs);
  const next = Math.min(idle, unanswered);
  return Number.isFinite(next) ? next : null;
}
