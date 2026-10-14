import { useEffect, useState } from 'react';

/**
 * Whether the corridor scene has drawn its first frame, read from what the scene already publishes
 * on its container (`data-frames`, the frames drawn so far; `data-pose`, set as the first frame is
 * prepared) so the shell needs nothing more from the scene. `framesSincePose` is how many animation
 * frames have passed since a pose was first seen: a scene that only draws on demand (reduced
 * motion, a still hero) may never publish a non-zero frame count, but a pose two frames old has
 * been rendered.
 *
 * A `onFirstFrame` prop on CorridorSceneProps would say this directly; this is the reading of the
 * existing attributes until then.
 */
export function firstFrameDrawn(published: { frames?: string | undefined; pose?: string | undefined }, framesSincePose: number): boolean {
  if (Number(published.frames ?? 0) >= 1) return true;
  return published.pose !== undefined && framesSincePose >= 2;
}

/** If the scene never says (a failed renderer falls back to text mode, which turns this off), the poster goes anyway. */
export const SCENE_SIGNAL_FALLBACK_MS = 8000;

/**
 * True once the corridor scene has drawn its first frame. Polls the scene's published attributes
 * once per animation frame until it has, then stops: a few frames' work, once per page load.
 * `enabled` is false where there is no scene (text mode).
 */
export function useFirstSceneFrame(enabled: boolean): boolean {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (!enabled || drawn) return;
    let raf = 0;
    let sincePose = 0;
    const tick = () => {
      const el = document.querySelector<HTMLElement>('.tqw-corridor-canvas');
      const pose = el?.dataset['pose'];
      sincePose = pose === undefined ? 0 : sincePose + 1;
      if (firstFrameDrawn({ frames: el?.dataset['frames'], pose }, sincePose)) {
        setDrawn(true);
        return;
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    const fallback = window.setTimeout(() => setDrawn(true), SCENE_SIGNAL_FALLBACK_MS);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(fallback);
    };
  }, [enabled, drawn]);
  return drawn;
}
