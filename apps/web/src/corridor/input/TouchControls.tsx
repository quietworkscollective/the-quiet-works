import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { IGNORE_ATTRIBUTE } from '../../firstPerson/bindings.ts';
import './scene.css';

/**
 * Two hold-to-walk buttons for touch: the corridor's forward and back, always visible on a
 * touch screen because a finger cannot find a key. Real buttons, so they are also reachable
 * and operable from a keyboard or a switch (Space or Enter holds, as a press does). Under
 * reduced motion there is no walking: the same two buttons step to the next and previous view.
 */
export interface TouchControlsProps {
  visible: boolean;
  reducedMotion: boolean;
  /** Forward (+1) or back (-1) while held; 0 on release. */
  onHold(dir: -1 | 0 | 1): void;
  /** Reduced motion: one step to the next (+1) or previous (-1) view. */
  onStep(dir: -1 | 1): void;
}

const NAMES = {
  walk: { forward: 'Walk forward', back: 'Walk back' },
  step: { forward: 'Next view', back: 'Previous view' },
} as const;

function Chevron({ down }: { down: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path
        d={down ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HoldButton({
  dir,
  label,
  reducedMotion,
  onHold,
  onStep,
}: {
  dir: -1 | 1;
  label: string;
  reducedMotion: boolean;
  onHold(dir: -1 | 0 | 1): void;
  onStep(dir: -1 | 1): void;
}) {
  const held = useRef(false);
  const latest = useRef({ reducedMotion, onHold, onStep });
  useEffect(() => {
    latest.current = { reducedMotion, onHold, onStep };
  });

  const press = useCallback(() => {
    if (held.current) return;
    held.current = true;
    if (latest.current.reducedMotion) latest.current.onStep(dir);
    else latest.current.onHold(dir);
  }, [dir]);

  const release = useCallback(() => {
    if (!held.current) return;
    held.current = false;
    if (!latest.current.reducedMotion) latest.current.onHold(0);
  }, []);

  // Never leave the camera walking if the button goes away mid-press.
  useEffect(() => release, [release]);

  return (
    <button
      type="button"
      className="tqw-walk__button"
      data-dir={dir === 1 ? 'forward' : 'back'}
      aria-label={label}
      onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        press();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
          event.preventDefault();
          press();
        }
      }}
      onKeyUp={(event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === ' ' || event.key === 'Enter') release();
      }}
      onBlur={release}
    >
      <Chevron down={dir === -1} />
    </button>
  );
}

export function TouchControls({ visible, reducedMotion, onHold, onStep }: TouchControlsProps) {
  if (!visible) return null;
  const names = reducedMotion ? NAMES.step : NAMES.walk;
  return (
    <div className="tqw-walk" role="group" aria-label="Movement" {...{ [IGNORE_ATTRIBUTE]: '' }}>
      <HoldButton dir={1} label={names.forward} reducedMotion={reducedMotion} onHold={onHold} onStep={onStep} />
      <HoldButton dir={-1} label={names.back} reducedMotion={reducedMotion} onHold={onHold} onStep={onStep} />
    </div>
  );
}
