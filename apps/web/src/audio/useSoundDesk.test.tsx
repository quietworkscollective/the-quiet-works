// @vitest-environment jsdom
import { StrictMode } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SoundDesk } from './types.ts';
import { useSoundDesk } from './useSoundDesk.ts';

interface FakeDesk extends SoundDesk {
  disposed: boolean;
  unlocks: number;
}

/** A desk that records what reached it; like the real one, a disposed desk ignores everything. */
function fakeDesk(): FakeDesk {
  const desk: FakeDesk = {
    disposed: false,
    unlocks: 0,
    unlock() {
      if (!desk.disposed) desk.unlocks += 1;
    },
    setMuted() {},
    play() {},
    playSpine() {},
    setWalk() {},
    setRoom() {},
    dispose() {
      desk.disposed = true;
    },
  };
  return desk;
}

function recorder() {
  const made: FakeDesk[] = [];
  const create = (): SoundDesk => {
    const desk = fakeDesk();
    made.push(desk);
    return desk;
  };
  return { made, create };
}

describe('useSoundDesk', () => {
  it('reaches a live desk after StrictMode mounts, unmounts and remounts (development)', () => {
    const { made, create } = recorder();
    const { result } = renderHook(() => useSoundDesk(create), { wrapper: StrictMode });
    result.current.unlock();
    const alive = made.filter((desk) => !desk.disposed);
    expect(alive).toHaveLength(1);
    expect(alive[0]?.unlocks).toBe(1);
  });

  it('disposes every desk it made when the page unmounts', () => {
    const { made, create } = recorder();
    const { result, unmount } = renderHook(() => useSoundDesk(create), { wrapper: StrictMode });
    result.current.unlock();
    unmount();
    expect(made.length).toBeGreaterThan(0);
    expect(made.every((desk) => desk.disposed)).toBe(true);
  });

  it('keeps one desk and one stable handle for the life of a production mount', () => {
    const { made, create } = recorder();
    const { result, rerender } = renderHook(() => useSoundDesk(create));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(made).toHaveLength(1);
  });
});
