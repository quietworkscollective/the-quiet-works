/**
 * When the next frame is drawn (ADR 0004, amending ADR 0001's "zero idle frames" to "no frames
 * except bounded ambient windows"). The scene renders on demand; this is the rule for asking:
 *
 * - while the scene is hidden or off screen, never;
 * - while the camera, a door or a prop is moving or being acted on, at the display's own pace;
 * - while only the hero's slow drift or an open ambient window wants a picture, at the ambient
 *   cadence (`AMBIENT_FRAME_MS`);
 * - otherwise not at all.
 */
export type FramePlan = 'now' | 'ambient' | 'none';

export interface FrameNeeds {
  /** The scene is on screen and the tab is showing. */
  visible: boolean;
  /** The director wants another frame (movement, a door, a prop's action, a glint). */
  busy: boolean;
  /** The only thing keeping the director busy is the hero's drift. */
  ambientOnly: boolean;
  /** At least one ambient window is open. */
  windowOpen: boolean;
}

export function framePlan({ visible, busy, ambientOnly, windowOpen }: FrameNeeds): FramePlan {
  if (!visible) return 'none';
  if (busy && !ambientOnly) return 'now';
  if (busy || windowOpen) return 'ambient';
  return 'none';
}
