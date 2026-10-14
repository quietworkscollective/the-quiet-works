import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import type { StampButtonProps } from './types.ts';

const HINT = 'Press and hold to stamp the paper. Release to lift the stamp.';

/** Keys that press the stamp. Space and Enter both activate a native button. */
function isPressKey(event: KeyboardEvent): boolean {
  return event.key === ' ' || event.code === 'Space' || event.key === 'Enter';
}

/**
 * The accessible twin of the 3D stamp.
 *
 * Every gesture produces exactly one press/release pair:
 *  - pointer: down -> up/cancel/lost capture, only for the pointer that started it;
 *  - keyboard: Space/Enter down (repeats ignored) -> the same key up, or blur;
 *  - assistive technology: a click with `detail === 0` while nothing is held
 *    (VoiceOver, Switch Control, voice control) presses and releases at once.
 * preventDefault on the key events stops the browser's synthetic click so nothing
 * fires twice; mouse and touch clicks (`detail >= 1`) are ignored, as the pointer
 * events already reported them.
 */
export function StampButton({ pressing, onPressStart, onPressEnd, variant }: StampButtonProps) {
  const hintId = useId();
  const pointerId = useRef<number | null>(null);
  const heldKey = useRef<string | null>(null);

  const isActive = () => pointerId.current !== null || heldKey.current !== null;

  const endPress = () => {
    pointerId.current = null;
    heldKey.current = null;
    onPressEnd();
  };

  // A stamp that is held when the button unmounts (e.g. the mode switches) must not stick.
  const releaseIfHeld = useEffectEvent(() => {
    if (isActive()) endPress();
  });
  useEffect(() => () => releaseIfHeld(), []);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || isActive()) return;
    pointerId.current = event.pointerId;
    // Capture keeps pointerup coming here even if the finger drifts off the button.
    // Absent in some test environments; real browsers always implement it.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onPressStart();
  };

  const onPointerEnd = (event: PointerEvent<HTMLButtonElement>) => {
    if (pointerId.current !== event.pointerId) return;
    endPress();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!isPressKey(event) || event.ctrlKey || event.metaKey || event.altKey) return;
    // Always: a repeated Enter keydown would otherwise re-click the button.
    event.preventDefault();
    if (event.repeat || isActive()) return;
    heldKey.current = event.key;
    onPressStart();
  };

  const onKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!isPressKey(event)) return;
    // Space clicks on keyup; cancelling it here prevents the synthetic click.
    event.preventDefault();
    if (heldKey.current !== event.key) return;
    endPress();
  };

  const onBlur = () => {
    if (heldKey.current !== null) endPress();
  };

  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0 || isActive()) return;
    onPressStart();
    onPressEnd();
  };

  return (
    <button
      type="button"
      className="tqw-stamp"
      data-variant={variant}
      data-pressing={pressing}
      aria-label="Hold to stamp the form"
      aria-describedby={hintId}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={onBlur}
      onClick={onClick}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="tqw-stamp__face">
        <span className="tqw-stamp__label">Hold to stamp</span>
        <kbd className="tqw-stamp__key">Space</kbd>
      </span>
      <span id={hintId} className="tqw-visually-hidden">
        {HINT}
      </span>
    </button>
  );
}
