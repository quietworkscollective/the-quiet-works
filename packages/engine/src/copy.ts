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

/** Shown before any evidence has been submitted. */
export const INITIAL_DISPLAY = 'EVIDENCE OF COMPETENCE REQUIRED';

/** The word on the rubber stamp. It never changes; the machine's answer does. */
export const STAMP_WORD = 'APPROVED';

/**
 * Replies to stamps 1..5. The fifth reply is the overload: the machine discovers it has
 * no receiving authority. Index 0 answers the first stamp.
 */
export const ESCALATION: readonly MachineLine[] = [
  { display: 'PROVISIONALLY APPROVED', receipt: 'Pending further evidence.' },
  { display: 'PROOF OUTDATED', receipt: 'Evidence expired on receipt.' },
  { display: 'PLEASE HAVE SOMEONE ELSE CONFIRM', receipt: 'Self-approval is not accepted.' },
  { display: 'CONFIRMATION REQUIRES APPROVAL', receipt: 'Please approve the confirmation.' },
  { display: 'AUTHORITY NOT FOUND', receipt: 'No receiving authority on file.' },
];

/** Bounded, deadpan loop for stamps after the overload. No reward, no punishment. */
export const AFTERMATH: readonly MachineLine[] = [
  { display: 'OFFICE CLOSED FOR REVIEW', receipt: 'Review pending.' },
  { display: 'REVIEW CLOSED FOR OFFICE', receipt: 'Office pending.' },
  { display: 'STATUS: FINE', receipt: 'Filed under fine.' },
];

/** Shown when the visitor stops stamping long enough for the machine to notice. */
export const STILLNESS_LINE: MachineLine = {
  display: 'NO EVIDENCE SUBMITTED',
  receipt: 'Your silence has been filed.',
};

/** Text on the inside of the machine's front hatch, visible once it falls open. */
export const HATCH_INTERIOR = 'RECEIVING AUTHORITY — NOT INSTALLED';

export type MemoSource = 'overload' | 'stillness';

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
    overload: 'Ejected during an authority fault.',
    stillness: 'Issued while nobody was stamping.',
  },
  body: [
    'Thank you for your evidence. Regrettably, the office cannot accept it: nobody here has ever been authorised to decide. The position was advertised once, in 1971, and withdrawn for being too obvious.',
    'The stamp still works beautifully. Many applicants find this comforting.',
    'Please keep your receipt. It is the only document in the building signed by someone who was actually present.',
  ],
};

/** Editorial drafts: public wayfinding and application fittings; founder review precedes release. */
export const OFFICE_LEGIBILITY = {
  sign: 'CERTIFICATES ISSUED HERE',
  certificate: 'CERTIFICATE OF BEING FINE',
  certificateBody: ['This certifies that', 'the bearer is fine.'],
  approvalLine: 'APPROVED BY',
  form: 'APPLICATION FOR CERTIFICATION',
  applicant: 'Applicant: YOU',
  evidence: 'EVIDENCE: STAMP HERE',
  submit: 'Stamp to submit evidence',
  board: 'YOUR APPLICATION',
  lamps: ['RECEIVED', 'CURRENT', 'WITNESSED', 'CONFIRMED', 'APPROVED'],
  catches: ['PROVISIONAL', 'EXPIRED', 'UNSIGNED', 'NEEDS APPROVAL'],
  officer: 'APPROVING OFFICER:',
  vacancy: 'POSITION NOT YET FILLED',
  leave: 'Leave',
  emptySocket: 'empty socket',
} as const;
