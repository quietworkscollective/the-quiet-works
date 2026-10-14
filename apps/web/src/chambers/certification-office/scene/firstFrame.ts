import type { Scene } from 'three';

/** Let the room draw before compiling its procedural reflection environment. */
export function bindAfterFirstFrame(scene: Scene, bind: () => () => void): () => void {
  const previous = scene.onAfterRender;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unbind: (() => void) | undefined;
  let requested = false, cancelled = false;
  const after: Scene['onAfterRender'] = (...args) => {
    previous.apply(scene, args);
    if (requested || cancelled) return;
    requested = true;
    if (scene.onAfterRender === after) scene.onAfterRender = previous;
    timer = setTimeout(() => { if (!cancelled) unbind = bind(); }, 300);
  };
  scene.onAfterRender = after;
  return () => {
    cancelled = true;
    if (scene.onAfterRender === after) scene.onAfterRender = previous;
    clearTimeout(timer);
    unbind?.();
  };
}
