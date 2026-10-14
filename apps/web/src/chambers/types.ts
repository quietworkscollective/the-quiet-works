import type { ComponentType } from 'react';
import type { DiscoveryStore } from '@tqw/engine';
import type { SoundDesk } from '../audio/types.ts';
import type { DoorSpec } from '../corridor/doorKit.ts';

/** Why text mode is showing: chosen by the visitor, no WebGL2, or the 3D view crashed. */
export type TextReason = 'chosen' | 'unsupported' | 'contextLost';

export interface CoreSettings {
  muted: boolean;
  reducedMotion: boolean;
  captions: boolean;
}

/**
 * What the core hands every chamber. A chamber owns its scene and its own state machine; the
 * core owns settings, the sound desk's lifecycle, captions, text mode and the way out.
 */
export interface ChamberProps {
  settings: CoreSettings;
  /** Non-null when the chamber must render its text mode. `retry` is offered after a crash. */
  text: { reason: TextReason; retry?: (() => void) | undefined } | null;
  sound: SoundDesk;
  /** Show a caption line (the core decides whether captions are on). */
  caption(text: string): void;
  /**
   * Call once the chamber is ready to be seen: its first 3D frame is drawn, or its text mode is
   * mounted. The threshold completes when the door choreography has also finished.
   */
  onReady(): void;
  /** The chamber's own way out (a diegetic exit). The core also offers "Return to the corridor". */
  onLeave(): void;
  /** The chamber's WebGL context was lost: the core switches everything to text mode. */
  onContextLost(): void;
  /** The chamber's 3D view failed to mount. */
  onSceneError(): void;
  /**
   * The visitor's on-device discoveries (ADR 0003). A chamber records a finding the moment the
   * visitor makes it: `discoveries.record(chamberId, { id, kind })`. Optional until the page shell
   * wires the store in; chambers must work without it.
   */
  discoveries?: DiscoveryStore | undefined;
}

export type ChamberComponent = ComponentType<ChamberProps>;

export interface ChamberModule {
  /** Every chamber introduces its own door, open or sealed. */
  door: DoorSpec;
  /** Present for open chambers: loads the chamber's code. Called early to preload. */
  load?: () => Promise<{ default: ChamberComponent }>;
}
