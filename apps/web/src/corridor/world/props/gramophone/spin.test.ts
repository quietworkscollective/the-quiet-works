import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AMBIENT_LIFE, type AmbientClock } from '../../../ambient.ts';
import { createSpin, SPIN_RENEW_AFTER_MS, SPIN_RETRY_MS, SPIN_WINDOW_MS, type Spin } from './spin.ts';

/** The corridor's scheduler, as far as the platter sees it: windows open for a while, can be refused, and are counted. */
function scheduler(options: { refuse?: boolean } = {}) {
  const log: { id: string; ms: number; at: number }[] = [];
  const open = new Map<string, number>();
  const clock: AmbientClock & { refuse: boolean } = {
    refuse: options.refuse ?? false,
    now: () => 0,
    requestWindow(id, ms) {
      if (clock.refuse) return false;
      // As the real scheduler does, refuse a window longer than the limit's worth by capping it.
      const capped = Math.min(ms, AMBIENT_LIFE.maxWindowMs);
      log.push({ id, ms: capped, at: Date.now() });
      open.set(id, Date.now() + capped);
      return true;
    },
    active: (id) => (open.get(id) ?? 0) > Date.now(),
  };
  return { clock, log, open };
}

interface World {
  turning: boolean;
  moving: boolean;
  inView: boolean;
  reduced: boolean;
  settled: number;
}

function make(world: World, clock: AmbientClock): Spin {
  return createSpin({
    id: 'gramophone-platter',
    ambient: clock,
    turning: () => world.turning,
    moving: () => world.moving || world.turning,
    inView: () => world.inView,
    reduced: () => world.reduced,
    settle: () => {
      world.settled += 1;
      world.moving = false;
    },
    timers: { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) },
  });
}

let world: World;
beforeEach(() => {
  vi.useFakeTimers();
  world = { turning: true, moving: true, inView: true, reduced: false, settled: 0 };
});
afterEach(() => vi.useRealTimers());

describe('the platter\'s frames', () => {
  it('asks for a window shorter than the scheduler\'s limit, and none longer', () => {
    expect(SPIN_WINDOW_MS).toBeLessThanOrEqual(AMBIENT_LIFE.maxWindowMs);
    const { clock, log } = scheduler();
    make(world, clock).keep();
    expect(log).toHaveLength(1);
    expect(log[0]?.ms).toBe(SPIN_WINDOW_MS);
  });

  it('asks again as the window ends, so the platter\'s turn is not lost, and goes on for as long as the needle is down', () => {
    const { clock, log } = scheduler();
    const spin = make(world, clock);
    spin.keep();
    vi.advanceTimersByTime(SPIN_WINDOW_MS + SPIN_RENEW_AFTER_MS - 1);
    expect(log).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(log).toHaveLength(2);
    // Over a minute, no gap without a window is longer than a couple of frames at 15 a second.
    let gap = 0;
    let longest = 0;
    for (let t = 0; t < 60_000; t += 5) {
      vi.advanceTimersByTime(5);
      gap = clock.active('gramophone-platter') ? 0 : gap + 5;
      longest = Math.max(longest, gap);
    }
    expect(longest).toBeLessThanOrEqual(SPIN_RENEW_AFTER_MS + 10);
    expect(log.length).toBeGreaterThanOrEqual(11);
  });

  it('never asks under reduced motion', () => {
    const { clock, log } = scheduler();
    world.reduced = true;
    const spin = make(world, clock);
    spin.keep();
    vi.advanceTimersByTime(60_000);
    expect(log).toEqual([]);
    expect(spin.waiting()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never asks for a gramophone that cannot be seen, and stops its platter instead of keeping a timer', () => {
    const { clock, log } = scheduler();
    world.inView = false;
    const spin = make(world, clock);
    spin.keep();
    vi.advanceTimersByTime(60_000);
    expect(log).toEqual([]);
    expect(world.settled).toBe(1);
    expect(spin.waiting()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    // The camera draws it into view: the next frame asks again.
    world.inView = true;
    world.moving = true;
    spin.keep();
    expect(log).toHaveLength(1);
  });

  it('stops asking once the needle is up and the platter has run down, with no timer left running', () => {
    const { clock, log } = scheduler();
    const spin = make(world, clock);
    spin.keep();
    expect(spin.waiting()).toBe(true);
    world.turning = false;
    world.moving = false;
    vi.advanceTimersByTime(SPIN_WINDOW_MS + SPIN_RENEW_AFTER_MS + 10);
    expect(log).toHaveLength(1);
    expect(spin.waiting()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps asking for the run-down after the needle lifts, while the platter is still moving', () => {
    const { clock, log } = scheduler();
    world.turning = false;
    world.moving = true;
    make(world, clock).keep();
    expect(log).toHaveLength(1);
  });

  it('tries again every 3 s while the needle is down and the scheduler refuses, and takes the window when it comes', () => {
    const { clock, log } = scheduler({ refuse: true });
    const spin = make(world, clock);
    spin.keep();
    vi.advanceTimersByTime(SPIN_RETRY_MS * 3);
    expect(log).toEqual([]);
    expect(spin.waiting()).toBe(true);
    clock.refuse = false;
    vi.advanceTimersByTime(SPIN_RETRY_MS);
    expect(log).toHaveLength(1);
  });

  it('gives up a platter that is only running down when it is refused: no frames, so it stops where it is', () => {
    const { clock } = scheduler({ refuse: true });
    world.turning = false;
    world.moving = true;
    const spin = make(world, clock);
    spin.keep();
    expect(world.settled).toBe(1);
    expect(spin.waiting()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not ask while a window is already open, and stops its timer on stop()', () => {
    const { clock, log } = scheduler();
    const spin = make(world, clock);
    spin.keep();
    spin.keep();
    expect(log).toHaveLength(1);
    spin.stop();
    expect(spin.waiting()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
