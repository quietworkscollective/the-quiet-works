/**
 * Authored copy for the Certification Office prototype (TQW-001).
 *
 * All text here is fictional institutional paperwork, not testimony. Every line is
 * subject to founder editorial review before public release (CLAUDE.md, AGENTS.md #10).
 */

export interface MachineLine {
  /** Uppercase text on the machine's amber display. */
  readonly display: string;
  /** The receipt the machine prints in reply. */
  readonly receipt: string;
}

/** The office's printed demand before the application is submitted. */
export const INITIAL_DISPLAY = 'PROVE YOU ARE FINE';

/** The first paper mark records that the machine held the application. */
export const STAMP_WORD = 'HELD';

/**
 * The first press receives the application and holds its approval request for inspection.
 */
export const ESCALATION: readonly MachineLine[] = [
  { display: 'APPROVAL HELD', receipt: 'RECEIVING AUTHORITY NOT VERIFIED\nINSPECTION COPY: DESK DRAWER' },
];

/** Repeat replies cannot add impressions or advance the inspection. */
export const AFTERMATH: readonly MachineLine[] = [
  { display: 'NOT A SUBMISSION', receipt: 'INSPECTION REQUESTS USE THE SMALL STAMP' },
  { display: 'INSPECTION RECORDED', receipt: 'PULL THE FRONT HATCH' },
  { display: 'APPLICATION RECEIVED', receipt: 'NO AUTHORITY INSTALLED' },
];

/** Text on the inside of the machine's front hatch, visible once it falls open. */
export const HATCH_INTERIOR = 'RECEIVING AUTHORITY — NEVER INSTALLED';

export type MemoSource = 'inspection' | 'overload' | 'stillness';

export interface Memo {
  readonly id: string;
  readonly title: string;
  readonly from: string;
  /** One line describing how the memo reached the visitor, keyed by discovery path. */
  readonly provenance: Readonly<Record<MemoSource, string>>;
  readonly body: readonly string[];
}

export const MEMO_001: Memo = {
  id: 'memo-001',
  title: 'Memo 001',
  from: 'From the desk of the Approving Clerk (position vacant)',
  provenance: {
    inspection: 'Presented when the authority bay is opened.',
    overload: 'Retained inactive legacy route.',
    stillness: 'Retained inactive legacy route.',
  },
  body: [
    'Thank you for your evidence. Your application has been received. It cannot be approved: nobody here has ever been authorised to decide.',
    'The position was advertised once, in 1971, and withdrawn for being too obvious.',
    'The stamp remains in service.',
    'Please keep your receipt. It records receipt of the application, not approval.',
    'Onward enquiries: THE EXCHANGE. Connection: CERTIFICATION.',
  ],
};

/** Editorial drafts: public wayfinding and application fittings; founder review precedes release. */
export const OFFICE_LEGIBILITY = {
  sign: 'CERTIFICATION OFFICE',
  certificate: 'UNISSUED SPECIMEN',
  certificateBody: ['Claim: __________________', 'Signature: __________________'],
  approvalLine: 'APPROVING OFFICER',
  form: 'APPLICATION FOR CERTIFICATION',
  applicant: 'Applicant: __________________',
  evidence: 'OFFICE REQUIREMENT: PROVE YOU ARE FINE',
  stampHere: 'STAMP HERE',
  submit: 'Stamp',
  board: 'APPLICATION',
  lamps: ['RECEIVED', 'INSPECTION', 'RECORDED', 'OPENED', 'COMPLETE'],
  catches: ['HELD', 'SEEN', 'RECORDED', 'OPEN'],
  officer: 'APPROVING OFFICER',
  vacancy: 'POSITION NEVER FILLED',
  leave: 'Leave',
  emptySocket: 'empty socket',
} as const;
