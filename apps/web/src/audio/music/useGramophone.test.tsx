// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECORDS } from './catalogue.ts';
import { gramophone } from './index.ts';
import { useGramophone, useGramophoneCaptions } from './useGramophone.ts';

beforeEach(() => {
  vi.useFakeTimers();
  gramophone.reset();
});
afterEach(() => {
  gramophone.reset();
  vi.useRealTimers();
});

describe('captions', () => {
  it('names the piece and its composer when a record begins to sound, while captions are on', () => {
    const caption = vi.fn();
    renderHook(() => useGramophoneCaptions(caption, true));
    act(() => gramophone.announce(0));
    act(() => gramophone.announce(1));
    expect(caption.mock.calls.map(([line]) => line)).toEqual(['[gramophone: Satie, Gymnopédie No. 1]', '[gramophone: Chopin, Waltz in A minor]']);
  });

  it('shows nothing while captions are off, and is not even listening', () => {
    const caption = vi.fn();
    renderHook(() => useGramophoneCaptions(caption, false));
    act(() => gramophone.announce(0));
    expect(caption).not.toHaveBeenCalled();
    // Off means no subscription at all: a second announcement has no one to reach.
    const lines: number[] = [];
    const off = gramophone.onAnnounce((l) => lines.push(l.record));
    act(() => gramophone.announce(2));
    expect(lines).toEqual([2]);
    off();
  });

  it('follows the setting as it is switched', () => {
    const caption = vi.fn();
    const { rerender } = renderHook(({ on }) => useGramophoneCaptions(caption, on), { initialProps: { on: false } });
    act(() => gramophone.announce(0));
    rerender({ on: true });
    act(() => gramophone.announce(1));
    rerender({ on: false });
    act(() => gramophone.announce(2));
    expect(caption.mock.calls.map(([line]) => line)).toEqual([RECORDS[1]?.caption]);
  });

  it('captions once under React StrictMode\'s mount, unmount and remount, and stops at unmount', () => {
    const caption = vi.fn();
    const { unmount } = renderHook(() => useGramophoneCaptions(caption, true), { wrapper: StrictMode });
    act(() => gramophone.announce(0));
    expect(caption).toHaveBeenCalledTimes(1);
    unmount();
    act(() => gramophone.announce(1));
    expect(caption).toHaveBeenCalledTimes(1);
  });
});

describe('the gramophone state hook', () => {
  it('follows the needle and the record, and not the listener', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useGramophone();
    });
    expect(result.current).toEqual({ needle: 'up', record: 0 });
    const before = renders;
    act(() => gramophone.setListener({ x: 0, z: 3, yawDeg: 0 }));
    expect(renders).toBe(before);
    act(() => gramophone.act('play'));
    expect(result.current.needle).toBe('lead-in');
    act(() => gramophone.act('change'));
    expect(result.current).toEqual({ needle: 'swap', record: 1 });
  });
});
