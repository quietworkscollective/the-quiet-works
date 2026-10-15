import { useEffect, useId } from 'react';
import { BOARD } from '@tqw/engine';
import { publicClipping } from './chamberCopy.ts';
import type { NoticeBoardProps } from './types.ts';
import { useModalDialog } from './useModalDialog.ts';

/** The three stocks the clippings are cut from, in the order they are pinned up. */
const STOCKS = ['bone', 'buff', 'grey-green'] as const;

/**
 * The notice board as a modal dialog: the lobby's board in the DOM. An olive felt field in an oak
 * frame, one clipping per chamber on bone, buff or grey-green stock, each pinned a degree or so
 * off true (none in reduced motion; CSS owns that). Choosing an open clipping goes straight in; a
 * sealed one says "Not yet open" in words.
 */
export function NoticeBoard({ open, chambers, onChoose, onClose }: NoticeBoardProps) {
  const ref = useModalDialog(open, onClose);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    // Native dialog focus can select the scroller; start at its first room action instead.
    ref.current?.querySelector<HTMLButtonElement>('.tqw-clipping__go, .tqw-board__close')?.focus();
  }, [open, ref]);
  return (
    <dialog ref={ref} className="tqw-board" aria-labelledby={titleId}>
      <div className="tqw-board__sheet">
        <header className="tqw-board__head">
          <h2 id={titleId} className="tqw-board__title">
            {BOARD.title}
          </h2>
          <p className="tqw-board__intro">{BOARD.intro}</p>
        </header>
        <div className="tqw-board__frame">
          <ul className="tqw-board__clippings">
            {chambers.map((chamber, index) => {
              const clipping = publicClipping(chamber, !import.meta.env.DEV);
              return (
              <li
                key={chamber.id}
                className="tqw-clipping"
                data-status={chamber.status}
                data-stock={STOCKS[index % STOCKS.length]}
              >
                <h3 className="tqw-clipping__headline">{clipping.headline}</h3>
                <p className="tqw-clipping__dek">{clipping.dek}</p>
                <p className="tqw-clipping__dateline">{clipping.dateline}</p>
                {chamber.status === 'open' ? (
                  <button
                    type="button"
                    className="tqw-clipping__go"
                    onClick={() => onChoose(chamber.id)}
                    aria-label={`${BOARD.open}: ${chamber.title}`}
                  >
                    <span>{BOARD.open}</span>
                    <svg viewBox="0 0 28 10" width="28" height="10" aria-hidden="true" focusable="false">
                      <path d="M0 5h26M22 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                  </button>
                ) : (
                  <p className="tqw-clipping__status">
                    <span className="tqw-visually-hidden">{chamber.title}: </span>
                    <span className="tqw-clipping__stamp">{BOARD.sealed}</span>
                  </p>
                )}
              </li>
              );
            })}
          </ul>
        </div>
        <div className="tqw-board__foot">
          <button type="button" className="tqw-board__close" onClick={onClose}>
            {BOARD.close}
          </button>
        </div>
      </div>
    </dialog>
  );
}
