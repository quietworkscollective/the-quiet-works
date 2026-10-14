import type { ChamberId, Cue, SpineCue } from '@tqw/engine';

/** Where the visitor is, for room tone: the corridor (and lobby) or inside a chamber. */
export type SoundRoom = 'corridor' | ChamberId;

/**
 * Runtime sound. Procedural Web Audio only: no files, no network.
 *
 * Contract: no AudioContext exists until `unlock()` is called from inside a deliberate user
 * gesture handler (pointer/key/click). `unlock()` is idempotent and does nothing while muted.
 */
export interface SoundDesk {
  unlock(): void;
  setMuted(muted: boolean): void;
  /** Schedule the sound for one engine cue, honouring `TIMING`. No-op before unlock or while muted. */
  play(cue: Cue): void;
  /** Spine sounds: a door opening or rattling, the board, a door closing behind the visitor. */
  playSpine(cue: SpineCue): void;
  /** Footsteps follow walking speed in metres per second; 0 stops them. No-op before unlock. */
  setWalk(speedMps: number): void;
  /**
   * Crossfade the room tone to `room`. Each room has its own; the office's hum belongs to the
   * office only. The desk remembers the room before unlock and starts in it.
   */
  setRoom(room: SoundRoom): void;
  /** Stop all sources and close the context. The desk is unusable afterwards. */
  dispose(): void;
}
