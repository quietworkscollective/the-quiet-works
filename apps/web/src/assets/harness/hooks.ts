// Mounts the React hooks (useModel, useSurface) in a real React root so the proof can show that
// unmounting releases every GPU handle. No JSX: this file is plain TypeScript.
import { createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Mesh, PlaneGeometry, type Scene } from 'three';
import { useModel, useSurface } from '../react.ts';

export interface HooksProbe {
  /** Resolves once the model and the surface are both in the scene. */
  readonly ready: Promise<void>;
  /** Unmounts the React tree; the hooks' cleanups release everything. */
  unmount(): void;
}

export function mountHooksProbe(scene: Scene, render: () => void): HooksProbe {
  let resolve: () => void = () => undefined;
  const ready = new Promise<void>((done) => {
    resolve = done;
  });

  function Probe() {
    const model = useModel('office-desk-metal');
    const material = useSurface('plaster-clean', { repeat: 2 });
    useEffect(() => {
      if (!model || !material) return undefined;
      const panel = new Mesh(new PlaneGeometry(2, 2), material);
      panel.position.set(0, 1, -1);
      scene.add(model, panel);
      render(); // textures and geometry reach the GPU only when drawn
      resolve();
      return () => {
        scene.remove(model, panel);
        panel.geometry.dispose();
      };
    }, [model, material]);
    return null;
  }

  const host = document.createElement('div');
  const root = createRoot(host);
  root.render(createElement(Probe));
  return { ready, unmount: () => root.unmount() };
}
