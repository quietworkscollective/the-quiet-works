// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { CertificationStore } from '@tqw/engine';
import type { ChamberProps } from '../types.ts';

const scene = vi.hoisted(() => ({ current: null as null | { store: CertificationStore; onReady: () => void } }));
vi.mock('./scene/OfficeScene.tsx', () => ({ default: (props: NonNullable<typeof scene.current>) => { scene.current = props; return null; } }));
import OfficeChamber from './OfficeChamber.tsx';

afterEach(() => { cleanup(); vi.useRealTimers(); });

it('excludes a slow stamp response and starts twenty seconds of idleness only when it settles', async () => {
  vi.useFakeTimers();
  const props: ChamberProps = {
    settings: { muted: true, reducedMotion: true, captions: false }, text: null,
    sound: { unlock: vi.fn(), setMuted: vi.fn(), play: vi.fn(), playSpine: vi.fn(), setWalk: vi.fn(), setRoom: vi.fn(), dispose: vi.fn() },
    caption: vi.fn(), onReady: vi.fn(), onLeave: vi.fn(), onContextLost: vi.fn(), onSceneError: vi.fn(),
  };
  await act(async () => { render(<OfficeChamber {...props} />); });
  expect(scene.current).not.toBeNull();
  const ready = scene.current!;
  act(() => ready.onReady());
  act(() => ready.store.dispatch({ type: 'PRESS' }));
  act(() => vi.advanceTimersByTime(30_000));
  expect(ready.store.getState().memo.revealed).toBe(false);
  act(() => ready.store.dispatch({ type: 'RELEASE' }));
  act(() => vi.advanceTimersByTime(30_000));
  expect(ready.store.getState().memo.revealed).toBe(false);
  act(() => ready.store.dispatch({ type: 'RESPONSE_SETTLED', step: 1 }));
  act(() => vi.advanceTimersByTime(19_999));
  expect(ready.store.getState().memo.revealed).toBe(false);
  act(() => vi.advanceTimersByTime(1));
  expect(ready.store.getState().memo.source).toBe('stillness');
});
