import type { ChamberId, SpineStore } from '@tqw/engine';
import type { CorridorAnimation } from './animation.ts';
import type { PropAnimation, PropId } from './props.ts';
import type { ProgressSource } from './progress.ts';

/**
 * The corridor scene (lobby + corridor), owned by the core. CorridorScene owns the Canvas,
 * camera, input and choreography; CorridorWorld (inside it) owns the architecture, doors, board
 * and light.
 */
export interface CorridorSceneProps {
  spine: SpineStore;
  /** The chamber whose first ready frame may release its pending corridor door. */
  readyChamber: ChamberId | null;
  /** Landing scroll progress; drives the camera while the spine is in the entrance phase. */
  progress: ProgressSource;
  reducedMotion: boolean;
  /** The visitor showed interest in a door (hover, focus, approach): start loading its chamber. */
  onDoorIntent(id: ChamberId): void;
  /**
   * The door choreography reached the seam: the camera is in the doorway, the jamb fills the
   * frame's edges. The core shows the chamber as soon as it is also ready.
   */
  onSeam(): void;
  /** Footstep speed for the sound desk, metres per second (0 when still). */
  onWalk(speedMps: number): void;
  onContextLost(): void;
  /** Deliberate input inside the scene (click, tap, key): the core may unlock audio. */
  onGesture(): void;
  /**
   * ADR 0003: the game window holds the page's input only while engaged. When false, the wheel and
   * vertical swipes scroll the page and keys pass through; drag-to-look and door clicks still work,
   * and a click or tap in the scene asks to engage.
   */
  engaged: boolean;
  /** A click, tap or Enter in the resting game window: the core decides whether to engage. */
  onEngageRequest(): void;
}

export interface CorridorWorldProps {
  animation: CorridorAnimation;
  focus: ChamberId | null;
  reducedMotion: boolean;
  /** The visitor has started the walk-in or opened the game window; photographic dressing may load. */
  decorActive: boolean;
  /** Pointer interest and clicks on chamber doors (blank doors are not interactive). */
  onDoorPointer(id: ChamberId, kind: 'over' | 'out' | 'click'): void;
  /** A clipping on the 3D notice board was chosen. */
  onClipping(id: ChamberId): void;
  /** Per-frame prop state (ADR 0004), written by the camera lane. */
  propAnimation: PropAnimation;
  /** Pointer interest and clicks on a prop's hit area. */
  onPropPointer(id: PropId, kind: 'over' | 'out' | 'click'): void;
}
