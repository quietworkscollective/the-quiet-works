import { MEMO_001 } from '@tqw/engine';
import type { MemoButtonProps } from './types.ts';

export function MemoButton({ onOpen }: MemoButtonProps) {
  return (
    <button type="button" className="tqw-memo-button" onClick={onOpen}>
      <span className="tqw-memo-button__glyph" aria-hidden="true" />
      <span>Read {MEMO_001.title}</span>
    </button>
  );
}
