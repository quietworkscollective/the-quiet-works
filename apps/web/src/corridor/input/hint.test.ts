import { afterEach, describe, expect, it } from 'vitest';
import { CORRIDOR_PROPS } from '@tqw/engine';
import { createFirstHint, HINT_LIFETIME_MS, pageVisit, type Visit } from './hint.ts';

function setup(visit: Visit = { offered: false }) {
  const events: boolean[] = [];
  const timers: { fn: () => void; ms: number; live: boolean }[] = [];
  const hint = createFirstHint({
    visit,
    onChange: (v) => events.push(v),
    schedule: (fn, ms) => {
      const t = { fn, ms, live: true };
      timers.push(t);
      return () => {
        t.live = false;
      };
    },
  });
  return { hint, events, timers, visit };
}

afterEach(() => {
  pageVisit.offered = false;
});

describe('the first-encounter hint', () => {
  it('is the contract’s line', () => {
    expect(CORRIDOR_PROPS.firstHint).toBe('Choose the board or a door to look closer.');
  });

  it('appears once the visitor can act', () => {
    const { hint, events } = setup();
    expect(hint.visible()).toBe(false);
    expect(hint.offer()).toBe(true);
    expect(hint.visible()).toBe(true);
    expect(events).toEqual([true]);
  });

  it('is dismissible, and then gone', () => {
    const { hint, events } = setup();
    hint.offer();
    hint.dismiss();
    expect(hint.visible()).toBe(false);
    expect(events).toEqual([true, false]);
    hint.dismiss();
    expect(events).toEqual([true, false]);
  });

  it('goes by itself after a while if left alone', () => {
    const { hint, timers, events } = setup();
    hint.offer();
    expect(timers).toHaveLength(1);
    expect(timers[0]!.ms).toBe(HINT_LIFETIME_MS);
    timers[0]!.fn();
    expect(hint.visible()).toBe(false);
    expect(events).toEqual([true, false]);
  });

  it('does not come back once it has been shown, however many times it is offered', () => {
    const { hint, events } = setup();
    hint.offer();
    hint.dismiss();
    expect(hint.offer()).toBe(false);
    expect(hint.offer()).toBe(false);
    expect(events).toEqual([true, false]);
  });

  it('is once per visit, not once per scene: a second scene in the same visit does not show it', () => {
    const visit: Visit = { offered: false };
    const first = setup(visit);
    first.hint.offer();
    first.hint.dispose();
    const second = setup(visit);
    expect(second.hint.offer()).toBe(false);
    expect(second.events).toEqual([]);
  });

  it('keeps the page\u2019s own visit in this module: two scenes with no visit given share it', () => {
    pageVisit.offered = false;
    const events: boolean[] = [];
    const first = createFirstHint({ onChange: (v) => events.push(v), schedule: () => () => {} });
    expect(first.offer()).toBe(true);
    first.dispose();
    const second = createFirstHint({ onChange: (v) => events.push(v), schedule: () => () => {} });
    expect(second.offer()).toBe(false);
    expect(events).toEqual([true, false]);
    pageVisit.offered = false;
  });

  it('is shown again by a new visit', () => {
    const first = setup();
    first.hint.offer();
    const second = setup();
    expect(second.hint.offer()).toBe(true);
  });

  it('takes the line away when the scene is torn down, and cancels its timer', () => {
    const { hint, timers, events } = setup();
    hint.offer();
    hint.dispose();
    expect(events).toEqual([true, false]);
    expect(timers[0]!.live).toBe(false);
  });

  it('keeps nothing in storage: it never touches localStorage or sessionStorage', () => {
    const touched: string[] = [];
    const trap = (name: string) =>
      new Proxy({}, { get: (_t, key) => (touched.push(`${name}.${String(key)}`), undefined), set: () => (touched.push(name), true) });
    const g = globalThis as Record<string, unknown>;
    const saved = { localStorage: g['localStorage'], sessionStorage: g['sessionStorage'] };
    Object.defineProperty(g, 'localStorage', { configurable: true, value: trap('localStorage') });
    Object.defineProperty(g, 'sessionStorage', { configurable: true, value: trap('sessionStorage') });
    try {
      const { hint } = setup();
      hint.offer();
      hint.dismiss();
      hint.dispose();
    } finally {
      Object.defineProperty(g, 'localStorage', { configurable: true, value: saved.localStorage });
      Object.defineProperty(g, 'sessionStorage', { configurable: true, value: saved.sessionStorage });
    }
    expect(touched).toEqual([]);
  });
});
