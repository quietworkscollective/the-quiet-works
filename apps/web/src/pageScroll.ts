import type { SpineState } from '@tqw/engine';

/**
 * The page's scroll decisions (ADR 0003), kept pure so they can be tested without a browser.
 *
 * The page is one column; the game window is the section the visitor scrolls to. `top` is the
 * scroll position at which the window's top reaches the top of the viewport, so `y / top` is the
 * whole journey from the hero to the window as a 0..1 progress.
 */

/** Scroll position within this many pixels of the game window's top counts as having reached it. */
export const REACH_SLACK_PX = 2;
/** Scrolling back up further than this from the game window's top leaves it (hysteresis, so no flicker). */
export const LEAVE_SLACK_PX = 24;

/** The journey so far, 0 at the top of the hero and 1 at the game window; 0 when there is no run. */
export function progressAt(y: number, top: number): number {
  if (!(top > 0)) return 0;
  return Math.min(1, Math.max(0, y / top));
}

export type PageScrollAction = 'handover' | 'return' | null;

/**
 * What scrolling to `y` means for the spine. Reaching the window's top from the entrance hands over
 * to the corridor; scrolling back above it from the corridor returns to the entrance. Neither ever
 * happens while the window is engaged (the page is held), and a chamber or a threshold is never
 * interrupted by scrolling.
 */
export function scrollAction(input: { y: number; top: number; phase: SpineState['phase']; engaged: boolean }): PageScrollAction {
  const { y, top, phase, engaged } = input;
  if (engaged || !(top > 0)) return null;
  if (phase === 'entrance' && y >= top - REACH_SLACK_PX) return 'handover';
  if (phase === 'corridor' && y < top - LEAVE_SLACK_PX) return 'return';
  return null;
}

/**
 * Whether an Escape key press releases the game window. A dialog closes first: while one is open
 * the browser takes the key to close it and the window keeps its hold. A press something else has
 * already handled is not ours either.
 */
export function escapeReleases(input: {
  key: string;
  defaultPrevented: boolean;
  dialogOpen: boolean;
  engaged: boolean;
  textMode: boolean;
}): boolean {
  if (input.key !== 'Escape' || input.defaultPrevented || input.dialogOpen) return false;
  return input.engaged && !input.textMode;
}
