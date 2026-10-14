import { SWING_EASING, SPINE_TIMING } from '../../timing.ts';
import { cubicBezier, clamp01 } from '../../firstPerson/easing.ts';

/**
 * Door choreography as pure functions of time (ADR 0001 "Opening a door"), so the scene, the
 * tests and the sound desk agree on one timeline. All times are milliseconds from the cue.
 */

const swing = cubicBezier(SWING_EASING);

/** The swing begins once the handle has turned and the latch has let go. */
export const SWING_START_MS = SPINE_TIMING.handleTurnMs + SPINE_TIMING.latchMs;
/** The camera starts through the door once it is `entryDelayMs` into its swing. */
export const ENTRY_START_MS = SWING_START_MS + SPINE_TIMING.entryDelayMs;
/** The lever springs back this long after the swing begins, once the leaf is clear of the latch. */
const HANDLE_RELEASE_AFTER_SWING_MS = 120;
const HANDLE_RELEASE_MS = 200;
/** On returning, the visitor sees the door open for this long before it closes. */
export const CLOSE_HOLD_MS = 350;

export interface OpeningFrame {
  /** 0 at rest .. 1 turned. */
  handle: number;
  /** 0 closed .. 1 swung open. */
  open: number;
}

export function openingAt(ms: number): OpeningFrame {
  if (ms <= 0) return { handle: 0, open: 0 };
  let handle: number;
  const releaseAt = SWING_START_MS + HANDLE_RELEASE_AFTER_SWING_MS;
  if (ms < SPINE_TIMING.handleTurnMs) handle = swing(ms / SPINE_TIMING.handleTurnMs);
  else if (ms < releaseAt) handle = 1;
  else handle = 1 - swing((ms - releaseAt) / HANDLE_RELEASE_MS);
  const open = ms < SWING_START_MS ? 0 : swing((ms - SWING_START_MS) / SPINE_TIMING.swingMs);
  return { handle: clamp01(handle), open: clamp01(open) };
}

/** The leaf's openness while it closes behind a returning visitor. */
export function closingAt(ms: number): number {
  if (ms <= CLOSE_HOLD_MS) return 1;
  return 1 - swing((ms - CLOSE_HOLD_MS) / SPINE_TIMING.closeMs);
}

export const CLOSING_END_MS = CLOSE_HOLD_MS + SPINE_TIMING.closeMs;

/** The rattle's phase: in (0, 1] while it plays, 0 at rest. */
export function rattleAt(ms: number): number {
  if (ms <= 0 || ms >= SPINE_TIMING.rattleMs) return 0;
  return ms / SPINE_TIMING.rattleMs;
}

/** Frame-rate independent approach to a target (hover emphasis). */
export function approach(value: number, target: number, dtMs: number, tauMs: number): number {
  const next = value + (target - value) * (1 - Math.exp(-dtMs / tauMs));
  return Math.abs(target - next) < 0.002 ? target : next;
}
