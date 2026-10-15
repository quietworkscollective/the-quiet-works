import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/** A chamber that never reports ready is shown anyway after this long: no visitor is left on a veil for ever. */
const READY_FALLBACK_MS = 20_000;

export interface ChamberHostProps {
  chamber: string;
  /** Hold the chamber out of sight until it reports ready. Text mode has no half-built room to hide. */
  hold: boolean;
  /** Out of reach (not engaged, say), whatever its readiness. */
  inert: boolean;
  /** The doorway has reached its seam. Contents may preload before this without showing over it. */
  seam?: boolean | undefined;
  /** The chamber is ready: the shell may finish the threshold. Called each time the chamber says so. */
  onReady(): void;
  fallbackMs?: number | undefined;
  /** The chamber, given the callback it calls when it is ready. */
  children(ready: () => void): ReactNode;
}

/**
 * Where a chamber lives in the game window, and the seam between the doorway and the room.
 *
 * A chamber may prepare in an inert, hidden staging wrapper while the visitor walks. It takes the
 * visible host slot only at the seam, and is never revealed until ready: a half-built room (the
 * empty skeleton of one: a desk with no texture, a lamp with no light) is never seen. If the seam
 * has passed and the room is still not ready, a coal veil is held over it instead. When the room
 * is ready the host and veil cross over `--tqw-seam-ms` (SPINE_TIMING.seamMs, or the short dissolve
 * under reduced motion), set by the shell.
 */
export function ChamberHost({ chamber, hold, inert, seam = true, onReady, fallbackMs = READY_FALLBACK_MS, children }: ChamberHostProps) {
  const [ready, setReady] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [contentMounted, setContentMounted] = useState(false);
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

  // A lazy room may still be loading when a visitor opens its door. Keep a hidden host shell for
  // that empty suspense slot, then move actual room content into the off-screen staging layer.
  // The content check lets the corridor keep its mount-at-the-seam contract once the module lands.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => setContentMounted(host.querySelector('.tqw-app') !== null);
    update();
    const observer = new MutationObserver(update);
    observer.observe(host, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [chamber]);

  const revealed = ready || !hold;
  // An unresolved lazy module gets only a hidden host shell. As soon as its room root mounts,
  // move the contents into the inert staging layer until the camera reaches the seam.
  const waiting = hold && !seam && !contentMounted;
  const staging = hold && !seam && contentMounted;

  return (
    <>
      {hold && seam ? <div className="tqw-seam-veil" data-held={!ready} aria-hidden="true" /> : null}
      <div
        ref={hostRef}
        className={staging ? 'tqw-chamber-preload' : 'tqw-chamber-host'}
        data-chamber={chamber}
        data-ready={revealed}
        data-seam={seam}
        aria-hidden={staging || waiting || undefined}
        inert={staging || inert || !revealed || !seam}
      >
        {children(markReady)}
      </div>
    </>
  );
}
