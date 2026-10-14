import { MEMO_001 } from '../copy.ts';
import type { OfficeMemoId } from './objects.ts';

export interface OfficeMemo {
  readonly id: OfficeMemoId | 'memo-001';
  readonly title: string;
  readonly from: string;
  readonly body: readonly string[];
  readonly classification: 'Counter' | 'Routine' | 'Archive' | 'Personal' | 'Null';
  readonly label: 'Fictional institutional document' | 'Fictional personal memo';
  readonly editorial: boolean;
}

/** Memo 001 remains public; discovered documents are opened from the sealed archive. */
export const OFFICE_MEMOS: readonly OfficeMemo[] = [
  // Lazy references permit copy.ts to re-export this module without an eager import cycle.
  { id: 'memo-001', get title() { return MEMO_001.title; }, get from() { return MEMO_001.from; },
    get body() { return MEMO_001.body; }, classification: 'Counter', label: 'Fictional institutional document', editorial: false },
];
