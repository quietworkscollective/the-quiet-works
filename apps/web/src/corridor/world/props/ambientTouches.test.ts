import { describe, expect, it } from 'vitest';
import { AMBIENT_LIFE, type AmbientClock } from '../../ambient.ts';
import { sleeveShape, startTouches, tagShape, TOUCHES, type Timers } from './ambientTouches.ts';

/** Timers that run only when the test says so, in order of time. */
function fakeTimers(): Timers & { advance(ms: number): void; pending(): number } {
  let now = 0;
  let next = 1;
  const queue = new Map<number, { at: number; fn: () => void }>();
  return {
    set(fn, ms) {
      const id = next;
      next += 1;
      queue.set(id, { at: now + ms, fn });
      return id;
    },
    clear(handle) {
      queue.delete(handle as number);
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...queue.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        queue.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
    pending: () => queue.size,
  };
}

interface Request {
  id: string;
  ms: number;
  at: number;
}

/** A scheduler that records what it is asked for, grants or refuses as told, and keeps its own clock. */
function fakeClock(timers: { advance(ms: number): void }, grant: () => boolean = () => true) {
  let ambientNow = 0;
  let elapsed = 0;
  const requests: Request[] = [];
  const open = new Map<string, { until: number }>();
  const clock: AmbientClock = {
    now: () => ambientNow,
    requestWindow(id, ms) {
      requests.push({ id, ms, at: elapsed });
      if (!grant()) return false;
      open.set(id, { until: elapsed + ms });
      return true;
    },
    active: (id) => (open.get(id)?.until ?? -1) > elapsed,
  };
  return {
    clock,
    requests,
    /** Move wall time on by `ms`, advancing the ambient clock only while a window is open. */
    step(ms: number) {
      for (let spent = 0; spent < ms; spent += 20) {
        timers.advance(20);
        elapsed += 20;
        if ([...open.values()].some((w) => w.until > elapsed)) ambientNow += 0.02;
      }
    },
  };
}

describe('the props\' own ambient touches', () => {
  it('asks for at most two kinds of window, each within the scheduler\'s limit', () => {
    expect(Object.keys(TOUCHES).length).toBeLessThanOrEqual(2);
    for (const touch of Object.values(TOUCHES)) {
      expect(touch.windowMs).toBeLessThanOrEqual(AMBIENT_LIFE.maxWindowMs);
      expect(touch.everyMs[0]).toBeGreaterThanOrEqual(20_000);
    }
  });

  it('asks for nothing under reduced motion: no request, no timer, no motion', () => {
    const timers = fakeTimers();
    const { clock, requests, step } = fakeClock(timers);
    const touches = startTouches(clock, true, timers);
    expect(timers.pending()).toBe(0);
    step(120_000);
    expect(requests).toEqual([]);
    expect(touches.drive()).toEqual({ sleeve: 0, tag: 0 });
    touches.stop();
  });

  it('asks in bounded windows, every half minute or so, never two of one kind close together', () => {
    const timers = fakeTimers();
    const { clock, requests, step } = fakeClock(timers);
    const touches = startTouches(clock, false, timers);
    step(10 * 60_000);
    touches.stop();
    expect(new Set(requests.map((r) => r.id))).toEqual(new Set(Object.values(TOUCHES).map((t) => t.id)));
    for (const r of requests) expect(r.ms).toBeLessThanOrEqual(AMBIENT_LIFE.maxWindowMs);
    for (const touch of Object.values(TOUCHES)) {
      const mine = requests.filter((r) => r.id === touch.id);
      expect(mine.length, `${touch.id} windows in ten minutes`).toBeGreaterThanOrEqual(12);
      expect(mine.length).toBeLessThanOrEqual(26);
      for (let i = 1; i < mine.length; i += 1) expect((mine[i]?.at ?? 0) - (mine[i - 1]?.at ?? 0), touch.id).toBeGreaterThanOrEqual(touch.everyMs[0] - 20);
    }
  });

  it('backs off when the scheduler says no: one ask every few seconds at most', () => {
    const timers = fakeTimers();
    const { clock, requests, step } = fakeClock(timers, () => false);
    const touches = startTouches(clock, false, timers);
    step(5 * 60_000);
    touches.stop();
    for (const touch of Object.values(TOUCHES)) {
      const mine = requests.filter((r) => r.id === touch.id);
      for (let i = 1; i < mine.length; i += 1) expect((mine[i]?.at ?? 0) - (mine[i - 1]?.at ?? 0), touch.id).toBeGreaterThanOrEqual(2_980);
    }
  });

  it('stops asking when stopped, and clears its timers', () => {
    const timers = fakeTimers();
    const { clock, requests, step } = fakeClock(timers);
    const touches = startTouches(clock, false, timers);
    step(60_000);
    const before = requests.length;
    touches.stop();
    expect(timers.pending()).toBe(0);
    step(10 * 60_000);
    expect(requests.length).toBe(before);
  });

  it('moves only inside a window, from rest to rest, and never past its range', () => {
    const timers = fakeTimers();
    const { clock, step } = fakeClock(timers);
    const touches = startTouches(clock, false, timers);
    let moving = 0;
    let quiet = 0;
    let largest = 0;
    let lastInWindow = 0;
    for (let t = 0; t < 4 * 60_000; t += 20) {
      step(20);
      const d = touches.drive();
      largest = Math.max(largest, Math.abs(d.sleeve), Math.abs(d.tag));
      if (clock.active('prop-sleeve') || clock.active('prop-tag')) moving += 1;
      else {
        quiet += 1;
        // Outside every window both motions are exactly at rest.
        expect(d).toEqual({ sleeve: 0, tag: 0 });
      }
      lastInWindow = Math.max(lastInWindow, Math.abs(d.sleeve) + Math.abs(d.tag));
    }
    touches.stop();
    expect(moving).toBeGreaterThan(0);
    expect(quiet).toBeGreaterThan(moving * 2);
    expect(largest).toBeLessThanOrEqual(1);
    expect(lastInWindow).toBeGreaterThan(0.3);
  });

  it('shapes each motion to start at rest and end at rest', () => {
    for (const shape of [sleeveShape, tagShape]) {
      expect(shape(0)).toBe(0);
      expect(shape(1)).toBe(0);
      expect(Math.abs(shape(0.0001))).toBeLessThan(0.01);
      expect(Math.abs(shape(0.9999))).toBeLessThan(0.05);
      let peak = 0;
      for (let u = 0; u <= 1; u += 0.001) peak = Math.max(peak, Math.abs(shape(u)));
      expect(peak).toBeLessThanOrEqual(1.001);
      expect(peak).toBeGreaterThan(0.6);
    }
  });
});
