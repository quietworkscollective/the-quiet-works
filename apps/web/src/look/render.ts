import type { Camera, Scene, WebGLRenderer } from 'three';
import type { LookDriver } from './stack/driver.ts';

/**
 * Where a frame drawn outside the renderer's own loop goes. The corridor's and the Office's
 * dissolves each draw the scene once, by hand, to copy it into an overlay at a hand-over; if they
 * called `gl.render` while the stack is mounted they would copy an unfinished, untone-mapped frame
 * and the picture would jump. They call `renderWithLook` instead: it draws through the stack when
 * one is mounted on that renderer, and plainly when none is (the lite tier, or before the stack
 * has loaded). Type-only import of the driver: this file is in the main bundle, the driver is not.
 */
const mounted = new WeakMap<WebGLRenderer, LookDriver>();

/** Register a mounted driver for its renderer. Returns the function that removes it. */
export function registerLookDriver(renderer: WebGLRenderer, driver: LookDriver): () => void {
  mounted.set(renderer, driver);
  return () => {
    if (mounted.get(renderer) === driver) mounted.delete(renderer);
  };
}

/**
 * The render targets the stack draws a scene into on the way to the screen. Code that waits for
 * "a frame the visitor has seen" (the Office's ready signal) skips offscreen renders, because a
 * dissolve capture or an environment render never reaches the screen; with the stack mounted, the
 * scene itself is drawn offscreen first, into the composer's input buffer, and only the finished
 * picture reaches the canvas. Marking that buffer keeps such waits working on every tier.
 */
const sceneTargets = new WeakSet<object>();

/** Mark a target the stack draws an on-screen frame's scene into. */
export function markSceneTarget(target: object | null): void {
  if (target) sceneTargets.add(target);
}

/** Whether a scene drawn into `target` is on its way to the screen: the canvas, or a marked buffer. */
export function isOnScreenSceneTarget(target: object | null): boolean {
  return target === null || sceneTargets.has(target);
}

/** Draw one frame of `scene` through the stack if there is one on `renderer`, else directly. */
export function renderWithLook(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
  const driver = mounted.get(renderer);
  if (driver && !driver.failed) driver.frame(scene, camera, 0);
  else renderer.render(scene, camera);
}
