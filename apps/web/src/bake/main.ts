import { measurePhysicalLight } from './calibration.ts';
import { Mesh, type Scene, type WebGLRenderer } from 'three';
import { exportSpace } from './export.ts';

if (!import.meta.env.DEV) throw new Error('The lighting workbench is development-only');
const requestedSpace = new URLSearchParams(location.search).get('space');
const space = requestedSpace === 'office' ? 'office'
  : requestedSpace === 'codex-room' ? 'codex-room'
    : requestedSpace === 'exchange' ? 'exchange'
      : requestedSpace === 'apartment' ? 'apartment' : 'corridor';
const route = space === 'office' ? '/certification-office'
  : space === 'codex-room' ? '/outline-room'
    : space === 'exchange' ? '/the-exchange'
      : space === 'apartment' ? '/apartment' : '/';
history.replaceState(null, '', `${route}?quality=high&bake=off`);
await import('../main.tsx');
const dev = window as unknown as {
  __tqwA1?: { scene: Scene; freeze(): void; render(): { calls: number } };
  __tqwFreeze?: () => void;
  __tqwGl?: WebGLRenderer;
  __tqwScene?: Scene;
  __bake?: { export(sourceInputsHash: string): ReturnType<typeof exportSpace>; calibrate(kind?: 'point' | 'spot'): ReturnType<typeof measurePhysicalLight> };
};
let lastCount = 0;
let stableSince = performance.now();
let frozen = false;
const wait = window.setInterval(() => {
  const scene = space === 'corridor' ? dev.__tqwA1?.scene : dev.__tqwScene;
  if (!scene || !document.querySelector('canvas')) return;
  if (space === 'corridor' && !document.querySelector('canvas[data-world="ready"]')) return;
  let count = 0;
  scene.traverse(o => { if (o instanceof Mesh) count++; });
  if (count < 5) return;
  if (!frozen) {
    if (space === 'corridor') {
      if (!dev.__tqwA1?.render().calls) return;
      dev.__tqwA1.freeze();
    } else {
      if (!dev.__tqwGl?.info.render.frame || !dev.__tqwFreeze) return;
      dev.__tqwFreeze();
    }
    frozen = true;
  }
  if (count !== lastCount) { lastCount = count; stableSince = performance.now(); return; }
  if (performance.now() - stableSince < 500) return;
  clearInterval(wait);
  dev.__bake = { export: sourceInputsHash => exportSpace(scene, space, sourceInputsHash), calibrate: measurePhysicalLight };
}, 100);
