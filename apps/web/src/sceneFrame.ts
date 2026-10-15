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

/**
 * True once the corridor scene has drawn its first frame. Polls the scene's published attributes
 * while its canvas exists. A held or still-loading scene must not count as a frame; a failed
 * renderer switches to text mode, which turns this off. The observer does no work while the lazy
 * corridor chunk has not mounted, and only uses two animation callbacks after a pose is published
 * for the demand-rendered case that has not yet published a non-zero frame count.
 */
export function useFirstSceneFrame(enabled: boolean): boolean {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (!enabled || drawn) return;
    let target: HTMLElement | null = null;
    let raf = 0;
    let sincePose = 0;
    let lastPose: string | undefined;
    const inspect = () => {
      if (!target) return;
      const frames = target.dataset['frames'];
      const pose = target.dataset['pose'];
      if (firstFrameDrawn({ frames, pose }, sincePose)) {
        setDrawn(true);
        return;
      }
      if (pose === undefined) return;
      if (pose !== lastPose) {
        lastPose = pose;
        sincePose = 0;
        raf = window.requestAnimationFrame(tick);
      }
    };
    const tick = () => {
      if (!target) return;
      const pose = target.dataset['pose'];
      if (pose !== lastPose) {
        lastPose = pose;
        sincePose = 0;
      } else {
        sincePose += 1;
      }
      if (firstFrameDrawn({ frames: target.dataset['frames'], pose }, sincePose)) {
        setDrawn(true);
        return;
      }
      raf = window.requestAnimationFrame(tick);
    };
    const attributes = new MutationObserver(inspect);
    const structure = new MutationObserver(() => {
      const next = document.querySelector<HTMLElement>('.tqw-corridor-canvas');
      if (next === target) return;
      attributes.disconnect();
      target = next;
      lastPose = undefined;
      sincePose = 0;
      if (target) {
        attributes.observe(target, { attributes: true, attributeFilter: ['data-frames', 'data-pose'] });
        inspect();
      }
    });
    structure.observe(document.documentElement, { childList: true, subtree: true });
    structure.takeRecords();
    const initial = document.querySelector<HTMLElement>('.tqw-corridor-canvas');
    if (initial) {
      target = initial;
      attributes.observe(target, { attributes: true, attributeFilter: ['data-frames', 'data-pose'] });
      inspect();
    }
    return () => {
      structure.disconnect();
      attributes.disconnect();
      window.cancelAnimationFrame(raf);
    };
  }, [enabled, drawn]);
  return drawn;
}
