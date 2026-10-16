import { useState } from 'react';
import type { MachineReadoutProps } from './types.ts';

const MEMO_NOTICE = 'A memo has slid out of the machine.';

/**
 * Display lines longer than this are "long": status sentences such as PLEASE HAVE SOMEONE
 * ELSE CONFIRM. They get tighter tracking so they sit on one line where they can and
 * never wrap awkwardly at 320 px. Short identifiers keep the generous tracking.
 */
export const LONG_LINE = 20;

/**
 * The machine's reply, as one polite live region. The dock shows it as a line; text mode
 * lays the same element out as an amber display window and a paper receipt. It is the
 * only live region for the machine in either mode.
 *
 * The memo notice is spoken once, in the update that revealed the memo, and is dropped
 * again at the next change so that later replies are not read out with it.
 */
export function MachineReadout({ state, visible }: MachineReadoutProps) {
  const { display, receipt, stamps, memo } = state;
  const version = `${stamps}\u0000${display}\u0000${receipt ?? ''}`;

  // Adjusting state during render: remember the version at which the memo first appeared.
  const [seen, setSeen] = useState<{ revealed: boolean; version: string | null }>({
    revealed: memo.revealed,
    version: null,
  });
  if (seen.revealed !== memo.revealed) {
    setSeen({ revealed: memo.revealed, version: memo.revealed ? version : null });
  }
  const announceMemo = memo.revealed && seen.version === version;

  return (
    <p
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={visible ? 'tqw-readout' : 'tqw-readout tqw-visually-hidden'}
    >
      <span className="tqw-visually-hidden">The machine reads: </span>
      <span className="tqw-readout__display" data-long={display.length > LONG_LINE}>
        {display}
      </span>
      {receipt !== null ? (
        <>
          <span className="tqw-readout__sep">
            {/* Non-breaking before the dash keeps it on the display's line when the readout wraps. */}
            <span aria-hidden="true">{'\u00a0— '}</span>
          </span>
          <span key={version} className="tqw-readout__receipt">
            <span className="tqw-readout__receipt-text">{receipt}</span>
          </span>
        </>
      ) : null}
      {announceMemo ? <span className="tqw-visually-hidden"> {MEMO_NOTICE}</span> : null}
    </p>
  );
}
