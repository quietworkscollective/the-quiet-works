import { useCallback, useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';

/** Includes the 400 ms fade and an observable transparent interval, independent of compositor events. */
const REMOVE_AFTER_READY_MS = 3500;

export interface PosterProps {
  /** The hero view, drawn by a script from the real build: landscape and portrait. */
  landscape: string;
  portrait: string;
  /** The live corridor has drawn its first frame: the poster dissolves. */
  ready: boolean;
  /** The poster has finished dissolving and can be removed. */
  onGone(): void;
}

/**
 * A still of the corridor's hero view, shown the instant the page paints so the hero never starts
 * on black while the 3D scene loads, and dissolved (CSS, 400 ms) once the live scene has drawn its
 * first frame. It is decoration: hidden from assistive technology, never catches the pointer, and
 * sits over the canvas but under everything else, so a chamber or the veil is never covered by it.
 * The image is fetched eagerly at high priority (index.html also preloads it, so the request starts
 * before the script has run).
 */
export function Poster({ landscape, portrait, ready, onGone }: PosterProps) {
  const gone = useRef(false);
  const onGoneRef = useRef(onGone);
  useLayoutEffect(() => {
    onGoneRef.current = onGone;
  }, [onGone]);
  const finish = useCallback(() => {
    if (gone.current) return;
    gone.current = true;
    // The deadline must commit DOM removal, not enqueue work behind a busy renderer.
    flushSync(() => onGoneRef.current());
  }, []);

  useLayoutEffect(() => {
    if (!ready) return;
    // Arm at the ready commit: a delayed paint or transition end cannot extend removal.
    const timer = window.setTimeout(finish, REMOVE_AFTER_READY_MS);
    return () => window.clearTimeout(timer);
  }, [ready, finish]);

  return (
    <picture
      className="tqw-poster"
      data-ready={ready}
      aria-hidden="true"
    >
      <source media="(orientation: portrait)" srcSet={portrait} type="image/webp" />
      <img src={landscape} alt="" width={1440} height={900} loading="eager" decoding="async" fetchPriority="high" draggable={false} />
    </picture>
  );
}
