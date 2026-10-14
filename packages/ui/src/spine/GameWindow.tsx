import { useEffect, useRef } from 'react';
import { CORRIDOR_COPY, GAME_WINDOW_COPY, LANDING, MENU_COPY } from '@tqw/engine';
import { ToggleIcon } from '../ToggleIcon.tsx';
import type { GameWindowProps } from './types.ts';
import { useFullscreen } from './useFullscreen.ts';

/** Where the chrome begins to appear, and is fully there: the last fifth of the run, as the smoke clears. */
const CHROME_FROM = 0.8;

/**
 * The game window (ADR 0003): the page's centrepiece, full bleed, with no frame. Its own strip and
 * its engagement state make it read as an interactive window.
 *
 * Resting: a restrained strip, "The Quiet Works" and Fullscreen, a coal fade above the scene, and
 * a 48 px "Enter The Quiet Works" near the foot with a line saying what it does. The scene is seen
 * but inert. Engaged: the Enter control gives way to "Leave · Esc" with the location, the scrim
 * lifts, and only the controls that matter remain. The words, the controls and the behaviour
 * agree; no border colour carries the meaning.
 *
 * The window is a sticky layer pinned over the hero and the smoke run (CSS) and is the element the
 * Fullscreen API takes, so the world, the veil, the chrome and any chamber all go with it.
 * Its controls stay out of the page, and out of the tab order, until the smoke has cleared.
 */
export function GameWindow({
  progress,
  engaged,
  location,
  onReturn,
  onEnter,
  onLeave,
  onOpenMenu,
  sound,
  onFullscreenChange,
  veil,
  text,
  children,
}: GameWindowProps) {
  const windowRef = useRef<HTMLDivElement>(null);
  const enterRef = useRef<HTMLButtonElement>(null);
  const leaveRef = useRef<HTMLButtonElement>(null);
  const fullscreen = useFullscreen(windowRef, onFullscreenChange);
  const wasEngaged = useRef(engaged);

  // The chrome fades in as the smoke clears, and is hidden (and unfocusable) until then.
  useEffect(() => {
    const node = windowRef.current;
    if (!node || text) return;
    const paint = (value: number) => {
      const reveal = Math.min(1, Math.max(0, (value - CHROME_FROM) / (1 - CHROME_FROM)));
      node.style.setProperty('--tqw-chrome-o', reveal.toFixed(3));
      node.dataset['chrome'] = reveal > 0 ? 'on' : 'off';
    };
    paint(progress.get());
    return progress.subscribe(paint);
  }, [progress, text]);

  // The control that changes state hands focus to the one that replaces it, so a keyboard visitor
  // is never left on something that has just disappeared.
  useEffect(() => {
    if (wasEngaged.current === engaged) return;
    wasEngaged.current = engaged;
    const active = document.activeElement;
    const free = !active || active === document.body || windowRef.current?.contains(active);
    if (free) (engaged ? leaveRef.current : enterRef.current)?.focus({ preventScroll: true });
  }, [engaged]);

  if (text) {
    return (
      <section id="game" className="tqw-game tqw-game--text" aria-label={GAME_WINDOW_COPY.label}>
        {children}
      </section>
    );
  }

  return (
    <section id="game" className="tqw-game" aria-label={GAME_WINDOW_COPY.label}>
      <div
        ref={windowRef}
        className="tqw-game__window"
        data-engaged={engaged}
        data-fullscreen={fullscreen.active}
        data-chrome="off"
      >
        <div className="tqw-game__world">{children}</div>
        {veil}
        <div className="tqw-game__scrim" aria-hidden="true" />
        <div className="tqw-game__chrome">
          <header className="tqw-game__strip">
            {engaged ? (
              <div className="tqw-game__where">
                <button
                  ref={leaveRef}
                  type="button"
                  className="tqw-game__leave"
                  aria-keyshortcuts="Escape"
                  onClick={onLeave}
                >
                  <span>{GAME_WINDOW_COPY.leave}</span>
                  <span className="tqw-game__key" aria-hidden="true">
                    · {GAME_WINDOW_COPY.leaveKey}
                  </span>
                </button>
                <p className="tqw-game__location">{location}</p>
              </div>
            ) : (
              <p className="tqw-game__title">{GAME_WINDOW_COPY.title}</p>
            )}
            <div className="tqw-game__tools">
              {engaged && onReturn ? (
                <button type="button" className="tqw-game__tool" onClick={onReturn}>
                  {CORRIDOR_COPY.backToCorridor}
                </button>
              ) : null}
              {sound ? (
                <button
                  type="button"
                  className="tqw-game__tool tqw-game__tool--icon"
                  aria-pressed={!sound.muted}
                  title={MENU_COPY.sound}
                  onClick={sound.onToggle}
                >
                  <ToggleIcon kind="muted" pressed={!sound.muted} />
                  <span className="tqw-visually-hidden">{MENU_COPY.sound}</span>
                </button>
              ) : null}
              {fullscreen.supported ? (
                <button type="button" className="tqw-game__tool tqw-game__tool--fullscreen" onClick={fullscreen.toggle}>
                  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.4">
                    {fullscreen.active ? (
                      <path d="M7 3v4H3M13 3v4h4M7 17v-4H3M13 17v-4h4" />
                    ) : (
                      <path d="M3 7V3h4M17 7V3h-4M3 13v4h4M17 13v4h-4" />
                    )}
                  </svg>
                  <span className="tqw-game__tool-label">
                    {fullscreen.active ? GAME_WINDOW_COPY.exitFullscreen : GAME_WINDOW_COPY.fullscreen}
                  </span>
                </button>
              ) : null}
              <button type="button" className="tqw-game__tool" aria-haspopup="dialog" onClick={onOpenMenu}>
                {MENU_COPY.menu}
              </button>
            </div>
          </header>
          {engaged ? null : (
            <div className="tqw-game__enter">
              <button ref={enterRef} type="button" className="tqw-game__enter-button" onClick={onEnter}>
                {LANDING.enter}
              </button>
              <p className="tqw-game__enter-line">{GAME_WINDOW_COPY.enterLine}</p>
            </div>
          )}
          <p className="tqw-game__mode">{engaged ? GAME_WINDOW_COPY.modeEngaged : GAME_WINDOW_COPY.modeResting}</p>
        </div>
      </div>
    </section>
  );
}
