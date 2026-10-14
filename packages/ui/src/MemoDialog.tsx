import { useEffect, useId, useRef } from 'react';
import type { MemoDialogProps } from './types.ts';

const FOOTNOTE = 'Fictional office correspondence.';

/**
 * Memo 001 on a native modal `<dialog>`: the browser supplies the top layer, inert
 * background, focus trap, Escape handling and focus restoration to the trigger.
 *
 * `open` drives the dialog; the dialog's own `close` event (Escape, the Close button)
 * reports back through `onClose` exactly once. A close that the parent asked for (open
 * turning false) is not echoed back, so parent and dialog never fight over state.
 */
export function MemoDialog({ memo, source, open, onClose }: MemoDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const closedByParent = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Start reading at the top of the memo rather than at a Close button below the fold.
      headingRef.current?.focus({ preventScroll: true });
    } else if (!open && dialog.open) {
      closedByParent.current = true;
      dialog.close();
    }
  }, [open]);

  const handleClose = () => {
    if (closedByParent.current) {
      closedByParent.current = false;
      return;
    }
    onClose();
  };

  return (
    <dialog ref={dialogRef} className="tqw-memo" aria-labelledby={titleId} onClose={handleClose}>
      <article className="tqw-memo__sheet">
        <header className="tqw-memo__head">
          <h2 id={titleId} ref={headingRef} tabIndex={-1} className="tqw-memo__title">
            {memo.title}
          </h2>
          <p className="tqw-memo__from">{memo.from}</p>
          {source !== null ? <p className="tqw-memo__provenance">{memo.provenance[source]}</p> : null}
        </header>
        <div className="tqw-memo__body">
          {memo.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <footer className="tqw-memo__foot">
          <p className="tqw-memo__note">{FOOTNOTE}</p>
          <button type="button" className="tqw-memo__close" onClick={() => dialogRef.current?.close()}>
            Close memo
          </button>
        </footer>
      </article>
    </dialog>
  );
}
