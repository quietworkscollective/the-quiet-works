import { describe, expect, it } from 'vitest';
import { AMBIENT_LIFE, type AmbientClock } from '../../ambient.ts';
import { AmbientScheduler, MOTIONS, type AmbientId, type MotionSpec, type Timers } from './schedule.ts';

/** A one-off, action-started motion, to exercise the scheduler's `triggered` mode. */
const TRIGGERED: MotionSpec = { id: 'board-pin', windowMs: 1400, every: 'triggered', first: 0 };

/** Virtual time: timers fire in order as `advance` carries the clock forward. */
function virtualTimers(): Timers & { advance(ms: number): void } {
  let now = 0;
  let next = 1;
  const queue = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    setTimeout(fn, ms) {
      const id = next;
      next += 1;
      queue.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout(id) {
      queue.delete(id);
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let soonest: [number, { at: number; fn: () => void }] | null = null;
        for (const entry of queue) if (entry[1].at <= end && (!soonest || entry[1].at < soonest[1].at)) soonest = entry;
        if (!soonest) break;
        queue.delete(soonest[0]);
        now = soonest[1].at;
        soonest[1].fn();
      }
      now = end;
    },
  };
}

interface Recorded {
  id: string;
  start: number;
  ms: number;
}

/** A clock that grants every request, so any limit that holds is the scheduler's own. */
function greedyClock(timers: Timers, refuse: () => boolean = () => false): AmbientClock & { windows: Recorded[] } {
  const windows: Recorded[] = [];
  return {
    windows,
    now: () => timers.now() / 1000,
    requestWindow(id, ms) {
      if (refuse()) return false;
      windows.push({ id, start: timers.now(), ms });
      return true;
    },
    active(id) {
      return windows.some((w) => w.id === id && timers.now() >= w.start && timers.now() < w.start + w.ms);
    },
  };
}

function maxOverlap(windows: readonly Recorded[]): number {
  const events = windows.flatMap((w) => [
    [w.start, 1],
    [w.start + w.ms, -1],
  ] as const);
  // Ends sort before starts at the same instant: a window that ends as another begins is not an overlap.
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let open = 0;
  let peak = 0;
  for (const [, d] of events) {
    open += d;
    peak = Math.max(peak, open);
  }
  return peak;
}

const seeded = (seed: number) => {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) % 4294967296;
    return a / 4294967296;
  };
};

describe('ambient window limits', () => {
  it('never asks for a window longer than six seconds, in the table or on the clock', () => {
    for (const m of MOTIONS) expect(m.windowMs, m.id).toBeLessThanOrEqual(AMBIENT_LIFE.maxWindowMs);
    const timers = virtualTimers();
    const clock = greedyClock(timers);
    new AmbientScheduler(clock, { reducedMotion: false, desktop: true, random: seeded(3), timers }).start();
    timers.advance(10 * 60 * 1000);
    expect(clock.windows.length).toBeGreaterThan(30);
    for (const w of clock.windows) expect(w.ms, w.id).toBeLessThanOrEqual(AMBIENT_LIFE.maxWindowMs);
  });

  it('never has more than three windows open, over ten minutes and several jitters', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const timers = virtualTimers();
      const clock = greedyClock(timers);
      new AmbientScheduler(clock, { reducedMotion: false, desktop: true, random: seeded(seed), timers }).start();
      timers.advance(10 * 60 * 1000);
      expect(maxOverlap(clock.windows), `seed ${seed}`).toBeLessThanOrEqual(AMBIENT_LIFE.maxConcurrent);
    }
  });

  it('holds the cap of three even when every motion is due at once and the clock would allow them all', () => {
    // A table that would open nine windows together: only the scheduler's own limit can stop it.
    const everything: MotionSpec[] = MOTIONS.map((m) => ({ ...m, first: 0, windowMs: 5000, every: [6000, 6000] as const }));
    const timers = virtualTimers();
    const clock = greedyClock(timers);
    new AmbientScheduler(clock, { reducedMotion: false, desktop: true, random: seeded(9), timers }, everything).start();
    timers.advance(2 * 60 * 1000);
    expect(clock.windows.length).toBeGreaterThan(10);
    expect(maxOverlap(clock.windows)).toBeLessThanOrEqual(AMBIENT_LIFE.maxConcurrent);
  });

  it('retries after a refusal (hidden, offscreen or at the cap) instead of giving up', () => {
    const timers = virtualTimers();
    let refusals = 3;
    const clock = greedyClock(timers, () => {
      if (refusals > 0) {
        refusals -= 1;
        return true;
      }
      return false;
    });
    new AmbientScheduler(clock, { reducedMotion: false, desktop: true, random: seeded(1), timers }).start();
    timers.advance(30000);
    expect(clock.windows.length).toBeGreaterThan(0);
    // The fan was due at 0 and refused: it opens once the refusals have passed, not never.
    expect(clock.windows.some((w) => w.id === 'lobby-fan')).toBe(true);
  });
});

describe('the hero\'s first ten seconds', () => {
  it('lets the idle board-pin window end before the dust window is due', () => {
    const first = (id: AmbientId): MotionSpec => MOTIONS.find((motion) => motion.id === id)!;
    expect(first('lobby-fan').first).toBe(0);
    expect(first('board-paper').first).toBeLessThanOrEqual(4000);
    expect(first('lobby-dust').first).toBeLessThanOrEqual(8000);
    expect(first('board-pin').first + first('board-pin').windowMs).toBeLessThan(first('lobby-dust').first);
  });

  it('turns the fan from the first frame, lifts a paper corner by 4 s and shows dust by 8 s', () => {
    const timers = virtualTimers();
    const clock = greedyClock(timers);
    new AmbientScheduler(clock, { reducedMotion: false, desktop: true, random: seeded(2), timers }).start();
    timers.advance(10000);
    const first = (id: AmbientId): Recorded | undefined => clock.windows.find((w) => w.id === id);
    expect(first('lobby-fan')?.start, 'fan').toBeLessThanOrEqual(100);
    expect(first('board-paper')?.start, 'paper corner').toBeLessThanOrEqual(4000);
    expect(first('lobby-dust')?.start, 'dust').toBeLessThanOrEqual(8000);
    // The paper's lift (1.8 s) fits inside its window, so it is never cut off mid-way.
    expect(first('board-paper')?.ms ?? 0).toBeGreaterThanOrEqual(1800);
  });

  it('starts the hero schedule when the live world is ready, even after a slow asset load', () => {
    const timers = virtualTimers();
    timers.advance(20_000);
    const readyAt = timers.now();
    const clock = greedyClock(timers);
    new AmbientScheduler(clock, { reducedMotion: false, desktop: true, random: seeded(2), timers }).start();

    expect(clock.windows.find((w) => w.id === 'lobby-fan')?.start).toBe(readyAt);
    timers.advance(8000);
    const first = (id: AmbientId): Recorded | undefined => clock.windows.find((w) => w.id === id);
    expect((first('board-paper')?.start ?? Infinity) - readyAt).toBeLessThanOrEqual(4000);
    expect((first('lobby-dust')?.start ?? Infinity) - readyAt).toBeLessThanOrEqual(8000);
  });

  it('opens the zero-offset fan synchronously for the first world frame', () => {
    const timers = virtualTimers();
    const clock = greedyClock(timers);
    new AmbientScheduler(clock, { reducedMotion: false, desktop: true, random: seeded(2), timers }).start();
    expect(clock.windows.find((w) => w.id === 'lobby-fan')?.start).toBe(0);
    expect(timers.advance).toBeTypeOf('function');
    expect(clock.active('lobby-fan')).toBe(true);
  });
});

describe('reduced motion, phones and stopping', () => {
  it('asks for nothing at all under reduced motion, even for a triggered window', () => {
    const timers = virtualTimers();
    const clock = greedyClock(timers);
    const s = new AmbientScheduler(clock, { reducedMotion: true, desktop: true, random: seeded(1), timers }, [...MOTIONS, TRIGGERED]);
    s.start();
    expect(s.trigger('board-pin')).toBe(false);
    timers.advance(5 * 60 * 1000);
    expect(clock.windows).toHaveLength(0);
  });

  it('keeps the radiator shimmer to desktop', () => {
    for (const desktop of [true, false]) {
      const timers = virtualTimers();
      const clock = greedyClock(timers);
      new AmbientScheduler(clock, { reducedMotion: false, desktop, random: seeded(4), timers }).start();
      timers.advance(5 * 60 * 1000);
      expect(clock.windows.some((w) => w.id === 'radiator-shimmer'), desktop ? 'desktop' : 'phone').toBe(desktop);
    }
  });

  it('opens a triggered window once, on request, and stops cleanly', () => {
    const timers = virtualTimers();
    const clock = greedyClock(timers);
    // No shipped motion is triggered now (the watering can's own drop is the props lane's), but the
    // mechanism stays for the interaction lane: exercised here with a one-off table.
    const s = new AmbientScheduler(clock, { reducedMotion: false, desktop: true, random: seeded(1), timers }, [TRIGGERED]);
    s.start();
    expect(s.trigger('board-pin')).toBe(true);
    expect(clock.windows.filter((w) => w.id === 'board-pin')).toHaveLength(1);
    s.stop();
    const before = clock.windows.length;
    timers.advance(5 * 60 * 1000);
    expect(clock.windows).toHaveLength(before);
    expect(s.trigger('board-pin')).toBe(false);
  });

  it('names the consult\'s motions: eight windows, the pin\'s highlight (the idle cue) among them, and the clock hand riding the rest', () => {
    // The plant\'s sway and the drip were retired when the lobby kept one plant, the props lane\'s, which is wired to the can.
    expect(new Set(MOTIONS.map((m) => m.id)).size).toBe(MOTIONS.length);
    expect(MOTIONS).toHaveLength(8);
    expect(MOTIONS.filter((m) => m.every === 'triggered')).toEqual([]);
    expect(MOTIONS.filter((m) => m.every === 'once').map((m) => m.id)).toEqual(['board-pin']);
  });

  it('shows the pin\'s highlight once, early, and never again', () => {
    const timers = virtualTimers();
    const clock = greedyClock(timers);
    new AmbientScheduler(clock, { reducedMotion: false, desktop: true, random: seeded(5), timers }).start();
    timers.advance(10 * 60 * 1000);
    const pins = clock.windows.filter((w) => w.id === 'board-pin');
    expect(pins).toHaveLength(1);
    expect(pins[0]?.start ?? Infinity).toBeLessThan(4000);
    expect(pins[0]?.ms ?? 0).toBeGreaterThanOrEqual(800);
  });
});
