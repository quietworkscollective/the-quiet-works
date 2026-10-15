import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAP_MS, LEAD_IN_MS, RUN_OUT_MS, SWAP_MS, type Effect } from './needle.ts';
import { createGramophoneStore, DEFAULT_LISTENER, type AudioSink, type GramophoneStore } from './store.ts';

/** A stand-in for the audio engine: it records every effect it is told of. */
function sink(): AudioSink & { effects: Effect[]; attached: unknown[] } {
  const effects: Effect[] = [];
  const attached: unknown[] = [];
  return { effects, attached, attach: (state) => attached.push(state), effect: (effect) => effects.push(effect) };
}

const heard = (s: { effects: Effect[] }): string[] => s.effects.map((e) => e.type);

let store: GramophoneStore;
beforeEach(() => {
  vi.useFakeTimers();
  store = createGramophoneStore({ records: 3, random: () => 0.5 });
});
afterEach(() => vi.useRealTimers());

describe('the gramophone store', () => {
  it('starts with the needle up on the first record and nobody listening but the starting view', () => {
    expect(store.getState()).toEqual({ needle: 'up', record: 0 });
    expect(store.getListener()).toBe(DEFAULT_LISTENER);
  });

  it('runs a whole record: lead-in, music, the end, the groove, the lift, the pause, the next record', () => {
    const engine = sink();
    store.bindAudio(engine);
    store.act('play');
    expect(store.getState().needle).toBe('lead-in');
    vi.advanceTimersByTime(LEAD_IN_MS);
    expect(store.getState().needle).toBe('playing');
    expect(engine.effects).toContainEqual({ type: 'start-music', record: 0 });

    store.report('ended');
    expect(store.getState().needle).toBe('run-out');
    vi.advanceTimersByTime(RUN_OUT_MS - 1);
    expect(store.getState().needle).toBe('run-out');
    vi.advanceTimersByTime(1);
    expect(store.getState()).toEqual({ needle: 'gap', record: 1 });
    expect(engine.effects).toContainEqual({ type: 'lift', byHand: false });

    // The pause is drawn from the allowed range: the stand-in's 0.5 gives its middle.
    const middle = (GAP_MS.min + GAP_MS.max) / 2;
    vi.advanceTimersByTime(middle - 1);
    expect(store.getState().needle).toBe('gap');
    vi.advanceTimersByTime(1);
    expect(store.getState()).toEqual({ needle: 'lead-in', record: 1 });
    expect(heard(engine)).toEqual(['drop', 'start-music', 'run-out', 'lift', 'drop']);
  });

  it('draws every pause between records from 8 to 15 s', () => {
    for (const draw of [0, 0.37, 0.999]) {
      const s = createGramophoneStore({ records: 3, random: () => draw });
      s.act('play');
      vi.advanceTimersByTime(LEAD_IN_MS);
      s.report('ended');
      vi.advanceTimersByTime(RUN_OUT_MS);
      expect(s.getState().needle).toBe('gap');
      const pause = Math.floor(GAP_MS.min + draw * (GAP_MS.max - GAP_MS.min));
      expect(pause).toBeGreaterThanOrEqual(8000);
      expect(pause).toBeLessThanOrEqual(15000);
      vi.advanceTimersByTime(pause - 1);
      expect(s.getState().needle).toBe('gap');
      vi.advanceTimersByTime(2);
      expect(s.getState().needle).toBe('lead-in');
      s.act('lift');
    }
  });

  it('keeps one timer at a time: Lift stops the lead-in from ever becoming music', () => {
    const engine = sink();
    store.bindAudio(engine);
    store.act('play');
    vi.advanceTimersByTime(LEAD_IN_MS / 2);
    store.act('lift');
    vi.advanceTimersByTime(60_000);
    expect(store.getState().needle).toBe('up');
    expect(heard(engine)).toEqual(['drop', 'lift']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('changing the record while it plays lifts, swaps and drops on the new one', () => {
    const engine = sink();
    store.bindAudio(engine);
    store.act('play');
    vi.advanceTimersByTime(LEAD_IN_MS);
    store.act('change');
    expect(store.getState()).toEqual({ needle: 'swap', record: 1 });
    vi.advanceTimersByTime(SWAP_MS);
    expect(store.getState()).toEqual({ needle: 'lead-in', record: 1 });
    expect(heard(engine)).toEqual(['drop', 'start-music', 'lift', 'swap', 'drop']);
  });

  it('runs on silently with no engine: the needle drops and the platter state follows', () => {
    store.act('play');
    vi.advanceTimersByTime(LEAD_IN_MS);
    expect(store.getState().needle).toBe('playing');
  });

  it('tells subscribers when the state changes, and only then', () => {
    const seen: string[] = [];
    const off = store.subscribe(() => seen.push(store.getState().needle));
    store.act('lift');
    expect(seen).toEqual([]);
    store.act('play');
    store.act('play');
    expect(seen).toEqual(['lead-in']);
    off();
    vi.advanceTimersByTime(LEAD_IN_MS);
    expect(seen).toEqual(['lead-in']);
  });

  it('starts the first record once, on the first unlock, and never again of its own accord', () => {
    store.autostart();
    expect(store.getState().needle).toBe('lead-in');
    store.act('lift');
    store.autostart();
    expect(store.getState().needle).toBe('up');
  });

  it('does not start a record while the sound is off', () => {
    store.setMuted(true);
    store.autostart();
    expect(store.getState().needle).toBe('up');
    store.setMuted(false);
    store.autostart();
    expect(store.getState().needle).toBe('lead-in');
  });

  it('brings a joining engine up to date, and stops telling one that has left', () => {
    store.act('play');
    const engine = sink();
    const leave = store.bindAudio(engine);
    expect(engine.attached).toEqual([{ needle: 'lead-in', record: 0 }]);
    leave();
    vi.advanceTimersByTime(LEAD_IN_MS);
    expect(engine.effects).toEqual([]);
  });

  it('lets a verb pressed in the page unlock the desk first, once', () => {
    const unlock = vi.fn();
    const forget = store.setUnlocker(unlock);
    store.press('play');
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(store.getState().needle).toBe('lead-in');
    forget();
    store.press('lift');
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it('forgets an unlocker only if it is still the registered one', () => {
    const first = vi.fn();
    const second = vi.fn();
    const forgetFirst = store.setUnlocker(first);
    store.setUnlocker(second);
    forgetFirst();
    store.press('lift');
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('carries the listener to whoever listens, and the record that has begun to the captions', () => {
    const poses: number[] = [];
    const lines: number[] = [];
    store.onListener((p) => poses.push(p.z));
    store.onAnnounce((l) => lines.push(l.record));
    store.setListener({ x: 0, z: 4, yawDeg: 0 });
    store.announce(2);
    expect(poses).toEqual([4]);
    expect(lines).toEqual([2]);
    expect(store.getListener().z).toBe(4);
  });

  it('starts over on reset: needle up, no timers, the starting view', () => {
    store.act('play');
    store.reset();
    expect(store.getState()).toEqual({ needle: 'up', record: 0 });
    expect(vi.getTimerCount()).toBe(0);
    expect(store.getListener()).toBe(DEFAULT_LISTENER);
  });
});
