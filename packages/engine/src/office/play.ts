import type { Finding, FindingKind } from '../discoveries.ts';

export type OfficePlayStep = 'ready' | 'refused' | 'drawer-open' | 'inspection-recorded' | 'resolved';
export type OfficeEvidenceId = 'inspection-copy' | 'routing-slips' | 'register' | 'conduit';

export interface OfficePlayFinding extends Finding {
  readonly title: string;
}

function finding(id: string, kind: FindingKind, title: string): OfficePlayFinding {
  return { id, kind, title };
}

export const OFFICE_PLAY_FINDINGS = {
  applicationReceipt: finding('office-application-receipt', 'line', 'Application receipt'),
  inspectionCopy: finding('office-inspection-copy', 'memo', 'Inspection copy'),
  duckRequisition: finding('office-duck-requisition', 'secret', 'Duck Requisition'),
  queueTicket: finding('office-duck-ticket', 'line', 'Duck and queue ticket'),
  inspectionStamp: finding('office-inspection-stamp', 'secret', 'Inspection stamp'),
  markedCopy: finding('office-marked-copy', 'line', 'Marked inspection copy'),
  emptyBay: finding('office-empty-authority-bay', 'payoff', 'The empty authority bay'),
  completion: finding('office-mystery-resolved', 'payoff', 'Certification Office — mystery resolved'),
  memo: finding('memo-001', 'memo', 'Memo 001'),
  routingSlip: finding('office-routing-slip', 'line', 'Routing Slip'),
  witnessSlip: finding('office-witness-slip', 'line', 'Witness Slip'),
  unrequestedCopy: finding('office-unrequested-copy', 'line', 'Unrequested Copy'),
  certificate: finding('office-certificate-0001', 'secret', 'Certificate 0001'),
  expiredApproval: finding('office-expired-approval', 'line', 'Expired Approval — Sample'),
  chairRepair: finding('office-chair-repair', 'memo', 'Chair Repair Note'),
  induction: finding('office-staff-induction', 'line', 'Staff Induction'),
  conduit: finding('office-q-01', 'secret', 'Q-01 — Public-wall conduit'),
} as const;

export const OFFICE_PLAY_EVIDENCE: Readonly<Record<OfficeEvidenceId, { title: string; lines: readonly string[] }>> = {
  'inspection-copy': {
    title: 'Inspection copy',
    lines: [
      'REQUEST TO INSPECT RECEIVING AUTHORITY',
      'Mark the box SEEN using the small stamp beneath the desk edge.',
      'Inspection does not require approval.',
      'ONE DUCK',
      'Queue ticket supplied.',
      'No authority to approve applications.',
      'Inspection stationery stored alongside.',
    ],
  },
  'routing-slips': {
    title: 'Routing slips',
    lines: [
      'ONWARD ENQUIRIES: THE EXCHANGE',
      'CONNECTION: CERTIFICATION',
      'This route carries enquiries. It does not confer approving authority.',
      'WITNESS SLIP',
      'Receipt of paper witnessed. Authority to approve not established.',
      'UNREQUESTED COPY',
      'Copy produced automatically. No approving signature reproduced.',
    ],
  },
  register: {
    title: 'Certificate register',
    lines: [
      'CERTIFICATE 0001',
      'Prepared before opening. Never issued.',
      'Original retained on the window easel.',
      'Approving signature: blank.',
      'EXPIRED APPROVAL — SAMPLE',
      'Specimen expiry completed. Approval field never signed.',
      'CHAIR REPAIR',
      'Seat repaired. Frame sound. Returned to the approving officer’s position.',
      'Post remains vacant.',
      'STAFF INDUCTION',
      'Approving officer: no appointment entered.',
      'No induction recording issued.',
    ],
  },
  conduit: {
    title: 'Maintenance plate Q-01',
    lines: [
      'Q-01 — PUBLIC-WALL CONDUIT',
      'Cover tethered for maintenance.',
      'Side door operates independently of the certification apparatus.',
      'No approval required to leave.',
      'A.D.',
    ],
  },
};

export const OFFICE_PLAY_HINTS: Readonly<Record<OfficePlayStep, readonly [string, string, string]>> = {
  ready: ['The application is ready.', 'The large press submits it.', 'Tap Stamp.'],
  refused: ['The receipt names an inspection copy.', 'It is in the desk drawer.', 'Tap Open drawer.'],
  'drawer-open': [
    'The inspection box asks for a different mark.',
    'SEEN is on the small stamp beneath the desk edge.',
    'Tap Mark inspection copy.',
  ],
  'inspection-recorded': [
    'The latch is released. The panel is still shut.',
    'The brass pull opens the front hatch.',
    'Tap Pull hatch.',
  ],
  resolved: ['The machine has no approving authority.', 'The receipt is beside the open bay.', 'The mystery is resolved.'],
};

export function restoreOfficePlayStep(findings: readonly Finding[]): OfficePlayStep {
  const found = new Set(findings.map(({ id }) => id));
  if (found.has(OFFICE_PLAY_FINDINGS.emptyBay.id)) return 'resolved';
  if (found.has(OFFICE_PLAY_FINDINGS.markedCopy.id)) return 'inspection-recorded';
  if (found.has(OFFICE_PLAY_FINDINGS.inspectionCopy.id)) return 'drawer-open';
  if (found.has(OFFICE_PLAY_FINDINGS.applicationReceipt.id)) return 'refused';
  return 'ready';
}
