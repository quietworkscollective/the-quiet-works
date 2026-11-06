import type { Finding, FindingKind } from '@tqw/engine';
import type { TomorrowAction, TomorrowPhase } from './state.ts';
import { TICKET_LINES } from './state.ts';

export interface TomorrowFinding extends Finding {
  title: string;
}

function finding(id: string, kind: FindingKind, title: string): TomorrowFinding {
  return { id, kind, title };
}

export const TOMORROW_FINDINGS = {
  windingInstructions: finding('winding-instructions', 'memo', 'Winding instructions'),
  movementRecord: finding('movement-record', 'memo', 'Movement record'),
  dispatchTicket: finding('dispatch-ticket', 'memo', 'The undelivered tomorrow'),
  sleeveNote: finding('sleeve-note', 'memo', 'Sleeve note'),
  unusedHour: finding('unused-hour', 'specimen', 'Unused Hour'),
  stopInspection: finding('stop-inspection', 'memo', 'Stop inspection'),
  startingStopRubbing: finding('starting-stop-rubbing', 'specimen', 'Starting-stop rubbing'),
  wheelsFree: finding('wheels-free', 'secret', 'The wheels are free'),
  carbonNote: finding('carbon-note', 'memo', 'Carbon note'),
  returnPreprinted: finding('return-preprinted', 'secret', 'The return was already printed'),
  jointRecord: finding('joint-record', 'secret', 'Joint record'),
} as const;

export const TOMORROW_COMPLETION = finding(
  'tomorrow-engine-mystery-resolved',
  'payoff',
  'The Tomorrow Engine — mystery resolved',
);

export const TOMORROW_FINDINGS_BY_ID = new Map(
  [...Object.values(TOMORROW_FINDINGS), TOMORROW_COMPLETION].map((entry) => [entry.id, entry] as const),
);

export const ROOM_COPY = {
  title: 'The Tomorrow Engine',
  plaque: 'THE TOMORROW ENGINE',
  workLabel: 'WORK COMPLETED',
  inscription: 'PREPARATION FOR PREPARATION.',
  dateReady: 'SCHEDULE DATE: 14',
  dateAdvanced: 'SCHEDULE DATE: 15',
  datePrefix: 'SCHEDULE DATE:',
  archive: 'Archive',
  archiveEmpty: 'Found records appear here.',
  leave: 'Leave',
  leaveTitle: 'Return to the corridor',
  hint: 'Hint',
  reset: 'Reset mechanism',
  close: 'Close',
  turnOver: 'Turn over',
  showFront: 'Show front',
  arrangeTogether: 'Arrange together',
  ticketReference: 'Drawing reference: GREAT ATRIUM — ROUTING AND SUPPORT SECTION.',
  returnLabel: 'RETURN ADDRESS: PREPRINTED',
  emptyOfficeEvidence: 'Optional cross-room comparison. Evidence not yet read: Office register. This does not affect dispatch or the Atrium drawing.',
  eligibleOfficeEvidence: 'Optional cross-room comparison available.',
  compareInstruction: 'Compare with the Office register’s Expired Approval sample',
  unavailableAfterWind: 'Available after winding.',
  unavailableAfterTicket: 'Available after ticket withdrawal.',
  fallbackTitle: 'The Tomorrow Engine',
  fallback: 'This room is available as a set of places and actions.',
  retry: 'Try the 3D view again',
  hints: {
    ready: ['The grip is ready.', 'One turn operates the date mechanism.', 'Select Wind once.'],
    wound: ['The date moved. Did the carriage?', 'The movement record is beside the date.', 'Select Read movement record.'],
    'record-opened': ['The brake catch is released.', 'The lever is at the winding control.', 'Select Apply brake.'],
    braked: ['A paper edge is showing.', 'The service hatch holds the dispatch ticket.', 'Select Withdraw ticket.'],
    withdrawn: ['Read dispatch ticket. Its drawing reference names the Great Atrium.'],
  } satisfies Readonly<Record<TomorrowPhase, readonly string[]>>,
} as const;

export const EARLY_RESPONSE: Readonly<Partial<Record<TomorrowAction, string>>> = {
  'read-record': 'Wind once to produce the movement record.',
  brake: 'Wind once, then open the movement record to release the brake.',
  withdraw: 'Apply brake to release the dispatch ticket.',
};

export const DOCUMENTS = {
  'winding-instructions': {
    title: TOMORROW_FINDINGS.windingInstructions.title,
    paragraphs: [
      'One turn advances the date display. The carriage has no release of its own. The grip has been replaced twice; the delivery platform shows less wear. A second turn would supply another date, which is not the part currently missing.',
    ],
  },
  'movement-record': {
    title: TOMORROW_FINDINGS.movementRecord.title,
    paragraphs: [
      'Date advanced one day. Carriage displacement: zero.',
      'The pencil line across the rail still meets the carriage edge. Both measurements were checked against the same turn. The date department may enter its result. Delivery has no movement to enter.',
    ],
  },
  sleeve: {
    title: TOMORROW_FINDINGS.sleeveNote.title,
    paragraphs: [
      'This hour belongs to the date on the display. It was reserved for unloading, but no load reached the platform. The pencilled entry was rubbed out; the printed reservation stayed. Advancing the date did not use the hour.',
      'UNUSED HOUR\nReserved for unloading.\nNo delivery entered.',
      ROOM_COPY.compareInstruction,
    ],
  },
  stop: {
    title: TOMORROW_FINDINGS.stopInspection.title,
    paragraphs: [
      'The bronze stop has a polished patch where the carriage rests. We lifted the wheels for inspection and found them free. The rail was cleaned and the carriage returned to its mark. Nothing in this repair authorises a departure.',
      'STARTING-STOP RUBBING\nContact face polished. Wheels turn freely.',
    ],
  },
  carbon: {
    title: TOMORROW_FINDINGS.carbonNote.title,
    paragraphs: [
      'The return address is printed beneath the carbon, not added after a failed delivery. We ordered the forms that way to save a second operation. There is room for the dispatch clerk’s initials, but no space in which to issue approval.',
      ROOM_COPY.returnLabel,
      ...TICKET_LINES,
    ],
  },
} as const;

export const JOINT_RECORD = {
  title: TOMORROW_FINDINGS.jointRecord.title,
  originals: [
    { title: 'UNUSED HOUR', body: 'Reserved for unloading.\nNo delivery entered.' },
    { title: 'EXPIRED APPROVAL — SAMPLE', body: 'Specimen expiry completed. Approval field never signed.' },
  ],
} as const;

export const TICKET_COPY = TICKET_LINES;

export const ACTION_LABELS: Readonly<Record<TomorrowAction, string>> = {
  wind: 'Wind once',
  'read-record': 'Read movement record',
  brake: 'Apply brake',
  withdraw: 'Withdraw ticket',
  'read-instructions': 'Read instructions',
  'read-ticket': 'Read dispatch ticket',
  'open-sleeve': 'Open hour sleeve',
  'lift-stop-tab': 'Lift stop tab',
  'turn-over': ROOM_COPY.turnOver,
  'show-front': ROOM_COPY.showFront,
  'arrange-together': ROOM_COPY.arrangeTogether,
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

export const SOUND_CAPTIONS = {
  wind: '[Grip creaks; date clicks.]',
  record: '[Paper rasps; catch releases.]',
  brake: '[Brake seats; hatch releases.]',
  ticket: '[Ticket slides onto ledge.]',
  sleeve: '[Sleeve scrape.]',
  tab: '[Hinge tick.]',
  carbon: '[Carbon rustle.]',
  metal: '[Metal tap.]',
} as const;
