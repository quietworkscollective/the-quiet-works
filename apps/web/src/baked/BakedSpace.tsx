import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { chooseQuality, rendererName } from '../corridor/world/quality.ts';
import { isOnScreenSceneTarget } from '../look/render.ts';
import { bindBake, usesLightmaps, type BakeBinding } from './runtime.ts';

export function BakedSpace({ space, onReady }: { space: 'corridor' | 'office'; onReady?: () => void }) {
  const { scene, gl, invalidate } = useThree();
  useEffect(() => {
    if (!usesLightmaps(chooseQuality(rendererName(gl.getContext()), window.location.search)) || new URLSearchParams(location.search).get('bake') === 'off') { onReady?.(); return; }
    let cancelled = false;
    let binding: BakeBinding | undefined;
    let restoreAfterRender: (() => void) | undefined;
    const load = space === 'corridor' ? import('./assets/corridor.ts') : import('./assets/office.ts');
    void load.then(async ({ default: assets }) => {
      if (cancelled) return;
      if (!assets) throw new Error('Missing baked assets');
      const bindingStarted = performance.now();
      binding = await bindBake(scene, assets, () => cancelled);
      if (cancelled) binding.dispose();
      else {
        gl.domElement.dataset['baked'] = space;
        if (import.meta.env.DEV) gl.domElement.dataset['bakeBindMs'] = (performance.now() - bindingStarted).toFixed(1);
        const previous = scene.onAfterRender;
        const afterRender: typeof previous = (...args) => {
          previous.apply(scene, args);
          if (!isOnScreenSceneTarget(gl.getRenderTarget())) return;
          restoreAfterRender?.();
          if (!cancelled) onReady?.();
        };
        restoreAfterRender = () => {
          if (scene.onAfterRender === afterRender) scene.onAfterRender = previous;
          restoreAfterRender = undefined;
        };
        // Texture upload and shader compilation happen during this first draw.
        scene.onAfterRender = afterRender;
        invalidate();
      }
    }).catch((error: unknown) => { if (!cancelled) { console.error('Baked lighting could not be applied', error); onReady?.(); } });
    return () => { cancelled = true; restoreAfterRender?.(); binding?.dispose(); if (gl.domElement.dataset['baked'] === space) { delete gl.domElement.dataset['baked']; delete gl.domElement.dataset['bakeBindMs']; } };
  }, [scene, gl, invalidate, space, onReady]);
  return null;
}
