import { CERTIFICATION_LINE, OPERATOR_ARCHIVE_TITLE, RULE_IDS, type ExchangeFindingId, type ExchangeState } from './state.ts';

/**
 * Public copy: control labels, the machine's own replies and captions. Anything a reader shows from
 * the sealed file appears here by id only, and opens with its token at runtime (ADR 0002).
 */

export type ViewId = 'wide' | 'jacks' | 'desk-top' | 'kneehole' | 'shelf';

export const STATIONS = [
  { id: 'board', label: 'Board', view: 'wide' },
  { id: 'desk-underside', label: 'Desk underside', view: 'kneehole' },
  { id: 'ticket-shelf', label: 'Ticket shelf', view: 'shelf' },
] as const;

export type StationId = (typeof STATIONS)[number]['id'];

export const VIEW_LABELS: Readonly<Record<ViewId, string>> = {
  wide: 'Wide',
  jacks: 'Jacks',
  'desk-top': 'Desk top',
  kneehole: 'Kneehole',
  shelf: 'Shelf',
};

export const STATION_OF_VIEW: Readonly<Record<ViewId, StationId>> = {
  wide: 'board',
  jacks: 'board',
  'desk-top': 'board',
  kneehole: 'desk-underside',
  shelf: 'ticket-shelf',
};

export const CONTROLS = {
  leave: 'Leave',
  archive: 'Archive',
  hint: 'Hint',
  close: 'Close',
  viewJacks: 'View jacks',
  viewDeskTop: 'View desk top',
  nightService: 'Night service',
  resumeService: 'Resume service',
  readWiringCard: 'Read wiring card',
  selectPlug: 'Select enquiry plug',
  followCord: 'Follow the cord',
  connectCertification: 'Connect CERTIFICATION',
  readForm: 'Read form',
  openPlate: 'Open plate',
  readRule14: 'Read Rule 14',
  connectOperatorTest: 'Connect operator test',
  liftHandset: 'Lift handset',
  readTickets: 'Read tickets',
  readRulebook: 'Read the rulebook',
  traceDiagram: 'Trace the diagram',
  readDocket: 'Read docket',
  readRota: 'Read rota',
  readIndex: 'Read index',
  liftCardigan: 'Lift the cardigan',
  turnCap: 'Turn the cap',
  ringBell: 'Ring the bell',
} as const;

export const WIRING_CARD_TEXT = 'CERTIFICATION: select the enquiry plug, then this jack.';
export const PLUG_PROMPT = 'Enquiry plug selected. Select CERTIFICATION.';
export const FORWARD_LINE = 'FORWARD TO: TOMORROW ENGINE';
export const CARRIES_LINE = 'This connection carries enquiries only.';
export const FORM_LINES = ['CERTIFICATION ENQUIRY', FORWARD_LINE, CARRIES_LINE] as const;
export const CONNECTED_RESULT = [FORWARD_LINE, CARRIES_LINE] as const;
export const PLATE_RESULT = 'The rules omit an operator position the wiring already serves.';
export const PLATE_FACE = 'OPERATOR / RULE 14';
export const OPERATOR_CAPTION = 'OPERATOR TEST — circuit complete';
export const LINE_AVAILABLE = 'Line available';

export const NIGHT_HEADING = 'NIGHT SERVICE';
export const NIGHT_STATUS = 'Connections retained.';
export const NIGHT_ALREADY = 'Already in night service.';

export const PLATE_SHUT = 'The plate covers the socket.';
export const DRAWER_SHUT = 'The drawer is shut.';
export const LEAD_SEATED = 'The lead is seated.';
export const LIP_EMPTY = 'The lip is empty.';
export const SIGN_LINE = 'The sign reads TELEPHONE EXCHANGE.';
export const DESK_LAMP_LINE = 'The desk lamp is on.';
export const CLERESTORY_LINE = 'The clerestory is well out of reach.';
export const CORD_LINE = 'The cord runs from the desk post to the enquiry plug.';

export const ROOM_TITLE = 'The Exchange';
export const TEXT_INTRO = 'The room is ready as a set of places and actions.';
export const TEXT_INTRO_UNSUPPORTED = 'This room is available as a set of places and actions.';
export const TEXT_RETRY = 'Try the 3D view again';
export const ARCHIVE_EMPTY = 'Found records appear here.';

/** What text mode offers in place of the scene's story hotspots, which have no slot of their own. */
export const TEXT_EXAMINES = {
  wide: [['sign', 'Sign'], ['desk-lamp', 'Desk lamp'], ['clerestory', 'Clerestory'], ['cord', 'Enquiry cord']],
  jacks: [['sign', 'Sign'], ['cord', 'Enquiry cord']],
  'desk-top': [['desk-lamp', 'Desk lamp'], ['cord', 'Enquiry cord']],
  kneehole: [['ticket-lip', 'Ticket lip']],
  shelf: [['drawer', 'Drawer']],
} as const satisfies Readonly<Record<ViewId, readonly (readonly [string, string])[]>>;

export type ReaderId = 'result' | 'wiring-card' | 'form' | 'rulebook' | 'diagram' | 'rule-14' | 'docket' | 'socket' | 'tickets' | 'rota' | 'index'
  | 'handset' | 'cardigan' | 'flask' | 'line-card' | 'hint' | 'archive';

export interface ReaderCopy {
  readonly title: string;
  readonly subheading?: string;
  /** Sealed items shown in order, opened by token. */
  readonly sealed?: readonly ExchangeFindingId[];
  /** Public lines, for readers that repeat a machine reply. */
  readonly lines?: readonly string[];
}

export const READERS: Readonly<Record<ReaderId, ReaderCopy>> = {
  /** Holds a result while the night block has replaced the result region. */
  result: { title: 'Result' },
  'wiring-card': { title: 'Wiring card', lines: [WIRING_CARD_TEXT] },
  form: { title: 'Form', lines: FORM_LINES },
  rulebook: { title: 'Rulebook', sealed: ['rulebook', ...RULE_IDS] },
  diagram: { title: 'Wiring diagram', sealed: ['wiring-diagram'] },
  'rule-14': { title: 'Rule 14', sealed: ['rule-14'] },
  docket: { title: 'Fitter’s docket', sealed: ['fitter-docket'] },
  socket: { title: OPERATOR_ARCHIVE_TITLE, sealed: ['socket-beneath-plate'] },
  tickets: { title: 'Operator call ticket', subheading: OPERATOR_CAPTION, sealed: ['operator-ticket'] },
  rota: { title: 'Rota', sealed: ['shift-roster'] },
  index: { title: 'Index', sealed: ['shelf-index'] },
  handset: { title: 'Handset', sealed: ['handset-first'] },
  cardigan: { title: 'Cardigan', sealed: ['cardigan'] },
  flask: { title: 'Flask', sealed: ['tea-flask'] },
  'line-card': { title: 'Line card' },
  hint: { title: 'Hint' },
  archive: { title: 'Archive' },
};

/** The reader an Archive entry opens. */
export const READER_OF_FINDING: Readonly<Record<ExchangeFindingId, ReaderId>> = {
  'departments-connected': 'form',
  'certification-form': 'form',
  rulebook: 'rulebook',
  ...Object.fromEntries(RULE_IDS.map(id => [id, 'rulebook'])) as Record<(typeof RULE_IDS)[number], ReaderId>,
  'rule-14': 'rule-14',
  'wiring-diagram': 'diagram',
  'fitter-docket': 'docket',
  'handset-first': 'handset',
  'socket-beneath-plate': 'socket',
  'operator-ticket': 'tickets',
  cardigan: 'cardigan',
  'tea-flask': 'flask',
  'shift-roster': 'rota',
  'shelf-index': 'index',
};

/** The eleven dim cards in line order, passing over CERTIFICATION. */
const DIM_CARDS = [
  'ROUTE ME TO WHOEVER IS IN CHARGE OF TUESDAY',
  'IS IT TOO LATE TO RETURN THIS',
  'PLEASE HOLD FOR YOURSELF',
  'THE MAN ABOUT THE GUTTERING, AGAIN',
  'WHICHEVER ONE OF US IS DRIVING',
  'WHOEVER HAS THE SPARE KEY',
  'SON, RE: THE SHED',
  'LOST PROPERTY, ONE WEEKEND',
  'ANYONE WHO REMEMBERS HOW THIS WAS MEANT TO GO',
  'THE PERSON I SAID I WOULD CALL BACK',
  'MY FATHER’S EXTENSION, IF KEPT',
] as const;

export const LINE_CARDS: readonly { readonly line: number; readonly card: string }[] = [
  ...DIM_CARDS.slice(0, CERTIFICATION_LINE - 1),
  'CERTIFICATION',
  ...DIM_CARDS.slice(CERTIFICATION_LINE - 1),
].map((card, offset) => ({ line: offset + 1, card }));

const NOTHING_FURTHER = 'The room has nothing further to connect.';

export const HINTS = {
  arrival: ['One card carries a printed name.', 'It is the third jack on the lowest row.', 'Choose Read wiring card.'],
  'card-read': ['The jack is waiting for a plug.', 'The enquiry plug rests on the ledge below the board.', 'Choose Select enquiry plug.'],
  'plug-selected': ['The plug is ready.', 'The bright jack is CERTIFICATION.', 'Choose Connect CERTIFICATION.'],
  connected: ['Follow the cord back.', 'It ends at the desk.', 'Choose Follow the cord. Then choose Read the rulebook.'],
  'rulebook-read': ['The cord runs down through the desk.', 'Something is drawn under the desk.', 'Choose Trace the diagram.'],
  'diagram-read': ['The rules are kept in a book on the desk.', 'Count them.', 'Choose Read the rulebook.'],
  'papers-read': ['The plate under the desk carries a number.', 'The book stops before it.', 'Choose Open plate.'],
  'plate-open': ['A short lead is clipped in the recess.', 'It fits the socket.', 'Choose Connect operator test.'],
  'test-connected': ['Something rang.', 'The telephone is on the desk top.', 'Choose Lift handset.'],
  'handset-lifted': ['Paper fed from the slot.', 'The slot is beneath the socket.', 'Choose Read tickets.'],
  'tickets-read': ['The cardigan and flask have an explanation.', 'The rota is on the ticket shelf.', 'Go to Ticket shelf. Choose Read rota.'],
  done: [NOTHING_FURTHER, NOTHING_FURTHER, NOTHING_FURTHER],
} as const satisfies Record<string, readonly [string, string, string]>;

export type HintStage = keyof typeof HINTS;

/** With the plate still shut, the ladder ends at the first unread paper, then at the plate. */
function connectedStage(discoveries: readonly string[]): HintStage {
  const rulebook = discoveries.includes('rulebook');
  const diagram = discoveries.includes('wiring-diagram');
  if (rulebook && diagram) return 'papers-read';
  if (rulebook) return 'rulebook-read';
  return diagram ? 'diagram-read' : 'connected';
}

/** First match wins. The stage reads progress alone: neither the service nor the station changes it. */
export function hintStage(state: Pick<ExchangeState, 'plug' | 'plate' | 'lead' | 'handset' | 'cardRead' | 'discoveries'>): HintStage {
  if (state.plate === 'open' && state.handset === 'cradle') return state.lead === 'seated' ? 'test-connected' : 'plate-open';
  if (state.plug === 'guide') return 'plug-selected';
  if (state.plug === 'rest') return state.cardRead ? 'card-read' : 'arrival';
  if (state.plate === 'shut') return connectedStage(state.discoveries);
  if (!state.discoveries.includes('operator-ticket')) return 'handset-lifted';
  return state.discoveries.includes('shift-roster') ? 'done' : 'tickets-read';
}

/** The sound each cue plays and the caption that stands in for it. */
export const CUES = {
  card: { kind: 'cloth', caption: '[A card ticks]' },
  plug: { kind: 'cloth', caption: '[Cloth cord moves]' },
  connect: { kind: 'metal', caption: '[A plug seats. A relay clicks.]' },
  drawer: { kind: 'cloth', caption: '[A drawer runs out]' },
  rattle: { kind: 'metal', caption: '[A drawer rattles]' },
  lever: { kind: 'metal', caption: '[A brass lever clunks]' },
  plate: { kind: 'metal', caption: '[A hinge turns. Brass taps a stop.]' },
  ring: { kind: 'bell', caption: '[The desk telephone rings once]' },
  'dial-tone': { kind: 'bell', caption: '[A quiet dial tone begins]' },
  'open-line': { kind: 'cloth', caption: '[Open line. Room tone.]' },
  ticket: { kind: 'cloth', caption: '[Paper feeds from the slot]' },
  page: { kind: 'cloth', caption: '[A page turns]' },
  tap: { kind: 'metal', caption: '[A small tap on brass]' },
  diagram: { kind: 'cloth', caption: '[Paper shifts against the panel]' },
  cardigan: { kind: 'cloth', caption: '[Wool shifts on the chair]' },
  flask: { kind: 'metal', caption: '[A flask cap turns]' },
  bell: { kind: 'bell', caption: LINE_AVAILABLE },
  shelf: { kind: 'cloth', caption: '[Paper lifts from the shelf]' },
  door: { kind: 'metal', caption: '[A door latch clicks]' },
} as const satisfies Record<string, { kind: 'metal' | 'cloth' | 'bell'; caption: string }>;

export type CueId = keyof typeof CUES;

export const HUM_CAPTION = '[A low switchboard hum under quiet line noise]';
