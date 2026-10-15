import { afterEach, expect, it, vi } from 'vitest';
import type { EffectCallback } from 'react';
import type { BakeBinding } from './runtime.ts';
const state = vi.hoisted(() => ({
  effect: undefined as EffectCallback | undefined,
  bind: vi.fn(),
  root: { scene: { onAfterRender: vi.fn() }, gl: { getContext: () => ({}), getRenderTarget: () => null as object | null, domElement: { dataset: {} as Record<string, string> } }, invalidate: vi.fn() },
}));
vi.mock('react', () => ({ useEffect: (effect: typeof state.effect) => { state.effect = effect; } }));
vi.mock('@react-three/fiber', () => ({ useThree: () => state.root }));
vi.mock('../corridor/world/quality.ts', () => ({ chooseQuality: () => 'full', rendererName: () => 'GPU' }));
vi.mock('./runtime.ts', () => ({ bindBake: state.bind, usesLightmaps: () => true }));
vi.mock('./assets/corridor.ts', () => ({ default: {} }));
import { BakedSpace } from './BakedSpace.tsx';
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); state.root.gl.domElement.dataset = {}; });
it('publishes readiness only after the first completed baked frame', async () => {
  vi.stubGlobal('window', { location: { search: '' } });
  vi.stubGlobal('location', { search: '' });
  let finish: ((binding: BakeBinding) => void) | undefined;
  state.bind.mockReturnValue(new Promise<BakeBinding>(resolve => { finish = resolve; }));
  const ready = vi.fn(() => {
    expect(state.root.gl.domElement.dataset['baked']).toBe('corridor');
    expect(state.root.invalidate).toHaveBeenCalledTimes(1);
  });
  BakedSpace({ space: 'corridor', onReady: ready });
  const cleanup = state.effect?.();
  await vi.waitFor(() => expect(state.bind).toHaveBeenCalledTimes(1));
  expect(ready).not.toHaveBeenCalled();
  const dispose = vi.fn();
  finish?.({ dispose });
  await vi.waitFor(() => expect(state.root.invalidate).toHaveBeenCalledTimes(1));
  expect(ready).not.toHaveBeenCalled();
  const offscreenTarget = {};
  state.root.gl.getRenderTarget = () => offscreenTarget;
  state.root.scene.onAfterRender();
  expect(ready).not.toHaveBeenCalled();
  state.root.gl.getRenderTarget = () => null;
  state.root.scene.onAfterRender();
  expect(ready).toHaveBeenCalledTimes(1);
  state.root.scene.onAfterRender();
  expect(ready).toHaveBeenCalledTimes(1);
  if (typeof cleanup === 'function') cleanup();
  expect(dispose).toHaveBeenCalledTimes(1);
});
it('restores the scene callback when unmounted before the first baked draw', async () => {
  vi.stubGlobal('window', { location: { search: '' } });
  vi.stubGlobal('location', { search: '' });
  const previous = state.root.scene.onAfterRender;
  const dispose = vi.fn();
  state.bind.mockResolvedValue({ dispose });
  const ready = vi.fn();
  BakedSpace({ space: 'corridor', onReady: ready });
  const cleanup = state.effect?.();
  await vi.waitFor(() => expect(state.root.invalidate).toHaveBeenCalledTimes(1));
  expect(state.root.scene.onAfterRender).not.toBe(previous);
  if (typeof cleanup === 'function') cleanup();
  expect(state.root.scene.onAfterRender).toBe(previous);
  state.root.scene.onAfterRender();
  expect(ready).not.toHaveBeenCalled();
  expect(dispose).toHaveBeenCalledTimes(1);
});
it('disposes a completed binding if cleanup precedes the awaiting continuation', async () => {
  vi.stubGlobal('window', { location: { search: '' } });
  vi.stubGlobal('location', { search: '' });
  const dispose = vi.fn();
  state.bind.mockImplementationOnce(async () => {
    queueMicrotask(() => { if (typeof cleanup === 'function') cleanup(); });
    return { dispose };
  });
  const ready = vi.fn();
  BakedSpace({ space: 'corridor', onReady: ready });
  const cleanup = state.effect?.();
  await vi.waitFor(() => expect(dispose).toHaveBeenCalledTimes(1));
  expect(ready).not.toHaveBeenCalled();
  expect(state.root.invalidate).not.toHaveBeenCalled();
  expect(state.root.gl.domElement.dataset['baked']).toBeUndefined();
});

it('passes the lazy-mesh allowance to the corridor binding', async () => {
  vi.stubGlobal('window', { location: { search: '' } });
  vi.stubGlobal('location', { search: '' });
  state.bind.mockResolvedValue({ dispose: vi.fn() });
  BakedSpace({ space: 'corridor', allowLazyMissing: true });
  const cleanup = state.effect?.();
  await vi.waitFor(() => expect(state.bind).toHaveBeenCalledTimes(1));
  expect(state.bind).toHaveBeenCalledWith(state.root.scene, expect.anything(), expect.any(Function), { allowLazyMissing: true });
  if (typeof cleanup === 'function') cleanup();
});
