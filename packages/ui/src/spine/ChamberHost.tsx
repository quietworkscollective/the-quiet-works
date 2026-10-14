import { useCallback, useEffect, useState, type ReactNode } from 'react';

/** A chamber that never reports ready is shown anyway after this long: no visitor is left on a veil for ever. */
const READY_FALLBACK_MS = 20_000;

export interface ChamberHostProps {
  chamber: string;
  /** Hold the chamber out of sight until it reports ready. Text mode has no half-built room to hide. */
  hold: boolean;
  /** Out of reach (not engaged, say), whatever its readiness. */
  inert: boolean;
  /** The chamber is ready: the shell may finish the threshold. Called each time the chamber says so. */
  onReady(): void;
  fallbackMs?: number | undefined;
  /** The chamber, given the callback it calls when it is ready. */
  children(ready: () => void): ReactNode;
}

/**
 * Where a chamber lives in the game window, and the seam between the doorway and the room.
 *
 * A chamber is never revealed until it says it is ready: until then the host is invisible and
 * inert, so a half-built room (the empty skeleton of one: a desk with no texture, a lamp with no
 * light) is never seen. Walking in, the corridor's doorway view is held until the seam; if the seam
 * has passed and the room is still not ready, a coal veil is held over it instead. When the
 * room is ready the host and the veil cross over `--tqw-seam-ms` (SPINE_TIMING.seamMs, or the short
 * dissolve under reduced motion), set by the shell.
 */
export function ChamberHost({ chamber, hold, inert, onReady, fallbackMs = READY_FALLBACK_MS, children }: ChamberHostProps) {
  const [ready, setReady] = useState(false);
  // Revealing is idempotent; telling the shell is repeated each time the chamber says it is ready.
  const markReady = useCallback(() => {
    setReady(true);
    onReady();
  }, [onReady]);

  useEffect(() => {
    if (!hold || ready) return;
    const timer = window.setTimeout(markReady, fallbackMs);
    return () => window.clearTimeout(timer);
  }, [hold, ready, fallbackMs, markReady]);

  const revealed = ready || !hold;
  return (
    <>
      {hold ? <div className="tqw-seam-veil" data-held={!ready} aria-hidden="true" /> : null}
      <div className="tqw-chamber-host" data-chamber={chamber} data-ready={revealed} inert={inert || !revealed}>
        {children(markReady)}
      </div>
    </>
  );
}
