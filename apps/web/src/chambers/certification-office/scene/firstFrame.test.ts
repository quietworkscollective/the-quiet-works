import { afterEach, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import { bindAfterFirstFrame } from './firstFrame.ts';

afterEach(() => { vi.useRealTimers(); });
const draw = (scene: Scene) => scene.onAfterRender(null!, scene, null!, null!, null!, null!);

it('waits for the owned room frame before preparing reflections, then disposes them', () => {
  vi.useFakeTimers();
  const scene = new Scene(), unbind = vi.fn(), bind = vi.fn(() => unbind);
  const previous = vi.fn(); scene.onAfterRender = previous;
  const cleanup = bindAfterFirstFrame(scene, bind);
  vi.advanceTimersByTime(1000);
  expect(bind, 'offscreen environment rendering cannot make the room ready').not.toHaveBeenCalled();
  draw(scene); expect(previous).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(299); expect(bind).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(bind).toHaveBeenCalledOnce();
  draw(scene); vi.advanceTimersByTime(1000); expect(bind).toHaveBeenCalledOnce();
  cleanup(); expect(unbind).toHaveBeenCalledOnce();
  expect(scene.onAfterRender).toBe(previous);
});

it('cancels reflection work when the room leaves before the deferred setup', () => {
  vi.useFakeTimers();
  const scene = new Scene(), bind = vi.fn(() => vi.fn());
  const cleanup = bindAfterFirstFrame(scene, bind);
  draw(scene); cleanup(); vi.advanceTimersByTime(1000);
  expect(bind, 'an unmounted room must not allocate another environment').not.toHaveBeenCalled();
});

it('binds once and keeps an outer completed-frame observer attached', () => {
 vi.useFakeTimers();const scene=new Scene(),bind=vi.fn(()=>vi.fn());
 const cleanup=bindAfterFirstFrame(scene,bind),inner=scene.onAfterRender;
 const outer:typeof inner=(...args)=>inner.apply(scene,args);
 scene.onAfterRender=outer;draw(scene);
 expect(scene.onAfterRender).toBe(outer);
 draw(scene);vi.advanceTimersByTime(300);expect(bind).toHaveBeenCalledOnce();
 draw(scene);vi.advanceTimersByTime(1000);expect(bind).toHaveBeenCalledOnce();cleanup();
});
