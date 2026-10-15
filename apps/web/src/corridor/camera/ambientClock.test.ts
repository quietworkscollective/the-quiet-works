import { describe, expect, it } from 'vitest';
import { AMBIENT_LIFE } from '../ambient.ts';
import { createAmbientScheduler } from './ambientClock.ts';

/** A scheduler on a clock the test moves by hand, counting how often it asked for a frame. */
function setup() {
  let t = 1000;
  let changes = 0;
  const s = createAmbientScheduler({ nowMs: () => t, onChange: () => (changes += 1) });
  return {
    s,
    clock: s.clock,
    advance: (ms: number) => {
      t += ms;
    },
    changes: () => changes,
  };
}

describe('the contract the scheduler is built to', () => {
  it('is ADR 0004: at most three motions at once, windows of at most six seconds', () => {
    expect(AMBIENT_LIFE.maxConcurrent).toBe(3);
    expect(AMBIENT_LIFE.maxWindowMs).toBe(6000);
  });
});

describe('concurrency', () => {
  it('opens windows for three motions and refuses a fourth, opening nothing for it', () => {
    const { clock, s } = setup();
    expect(clock.requestWindow('fan', 3000)).toBe(true);
    expect(clock.requestWindow('paper', 3000)).toBe(true);
    expect(clock.requestWindow('dust', 3000)).toBe(true);
    expect(clock.requestWindow('plant', 3000)).toBe(false);
    expect(clock.active('plant')).toBe(false);
    expect(s.openIds()).toEqual(['fan', 'paper', 'dust']);
  });

  it('never has more than three open however many ask, at any moment of a long run', () => {
    const { clock, s, advance } = setup();
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    let worst = 0;
    for (let step = 0; step < 400; step += 1) {
      for (const id of ids) clock.requestWindow(id, 1000 + ((step * 37 + id.charCodeAt(0)) % 5000));
      worst = Math.max(worst, s.openIds().length);
      advance(250);
    }
    expect(worst).toBe(3);
  });

  it('asking again for a motion that already has a window does not take a second slot', () => {
    const { clock, s } = setup();
    for (let i = 0; i < 10; i += 1) expect(clock.requestWindow('fan', 2000)).toBe(true);
    expect(s.openIds()).toEqual(['fan']);
    expect(clock.requestWindow('paper', 2000)).toBe(true);
    expect(clock.requestWindow('dust', 2000)).toBe(true);
  });

  it('gives a slot back when a window ends', () => {
    const { clock, advance } = setup();
    clock.requestWindow('a', 1000);
    clock.requestWindow('b', 4000);
    clock.requestWindow('c', 4000);
    expect(clock.requestWindow('d', 1000)).toBe(false);
    advance(1001);
    expect(clock.active('a')).toBe(false);
    expect(clock.requestWindow('d', 1000)).toBe(true);
  });
});

describe('duration', () => {
  it('caps a long request at six seconds', () => {
    const { clock, advance } = setup();
    expect(clock.requestWindow('fan', 60_000)).toBe(true);
    advance(5999);
    expect(clock.active('fan')).toBe(true);
    advance(2);
    expect(clock.active('fan')).toBe(false);
  });

  it('holds a short request to what it asked for', () => {
    const { clock, advance } = setup();
    clock.requestWindow('paper', 1800);
    advance(1799);
    expect(clock.active('paper')).toBe(true);
    advance(2);
    expect(clock.active('paper')).toBe(false);
  });

  it('lets a window be extended, but never past six seconds from when it began', () => {
    const { clock, advance } = setup();
    clock.requestWindow('fan', 4000);
    advance(3000);
    expect(clock.requestWindow('fan', 4000)).toBe(true);
    advance(2999);
    expect(clock.active('fan')).toBe(true);
    advance(2);
    expect(clock.active('fan')).toBe(false);
  });

  it('starts a fresh window, with its own six seconds, when asked after one has ended', () => {
    const { clock, advance } = setup();
    clock.requestWindow('fan', 6000);
    advance(6001);
    expect(clock.active('fan')).toBe(false);
    expect(clock.requestWindow('fan', 6000)).toBe(true);
    advance(5999);
    expect(clock.active('fan')).toBe(true);
  });

  it('refuses a window of no length or of nonsense', () => {
    const { clock, s } = setup();
    for (const ms of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(clock.requestWindow('fan', ms)).toBe(false);
    expect(s.openIds()).toEqual([]);
  });

  it('reports when the soonest window ends, on the real clock', () => {
    const { clock, s, advance } = setup();
    expect(s.nextEndMs()).toBeNull();
    clock.requestWindow('a', 3000);
    clock.requestWindow('b', 1000);
    expect(s.nextEndMs()).toBe(2000);
    advance(1001);
    expect(s.nextEndMs()).toBe(4000);
    advance(5000);
    expect(s.nextEndMs()).toBeNull();
    expect(s.tick()).toBe(false);
  });
});

describe('ambient time', () => {
  it('advances only inside windows: it does not move across the quiet between them', () => {
    const { clock, advance } = setup();
    expect(clock.now()).toBe(0);
    advance(10_000);
    expect(clock.now()).toBe(0);
    clock.requestWindow('fan', 2000);
    advance(1000);
    expect(clock.now()).toBeCloseTo(1, 9);
    advance(5000);
    // The window ended at 2 s of ambient time; the other four seconds were quiet.
    expect(clock.now()).toBeCloseTo(2, 9);
    advance(60_000);
    expect(clock.now()).toBeCloseTo(2, 9);
    clock.requestWindow('fan', 1000);
    advance(500);
    expect(clock.now()).toBeCloseTo(2.5, 9);
  });

  it('runs once, not once per open window', () => {
    const { clock, advance } = setup();
    clock.requestWindow('a', 3000);
    clock.requestWindow('b', 3000);
    clock.requestWindow('c', 3000);
    advance(1000);
    expect(clock.now()).toBeCloseTo(1, 9);
  });

  it('keeps counting while any window is open, and stops when the last one ends', () => {
    const { clock, advance } = setup();
    clock.requestWindow('short', 1000);
    clock.requestWindow('long', 4000);
    advance(3000);
    expect(clock.now()).toBeCloseTo(3, 9);
    advance(3000);
    expect(clock.now()).toBeCloseTo(4, 9);
  });
});

describe.each([['reduced-motion'], ['hidden'], ['offscreen'], ['covered']] as const)('while %s', (reason) => {
  it('refuses every window, and ambient time stands still', () => {
    const { clock, s, advance } = setup();
    s.setReason(reason, true);
    expect(s.suspended()).toBe(true);
    expect(clock.requestWindow('fan', 3000)).toBe(false);
    expect(clock.active('fan')).toBe(false);
    advance(5000);
    expect(clock.now()).toBe(0);
  });

  it('closes windows that are open the moment it begins, and freezes ambient time there', () => {
    const { clock, s, advance, changes } = setup();
    clock.requestWindow('fan', 6000);
    clock.requestWindow('paper', 6000);
    advance(1500);
    const before = changes();
    s.setReason(reason, true);
    expect(s.openIds()).toEqual([]);
    expect(clock.active('fan')).toBe(false);
    expect(changes()).toBe(before + 1);
    expect(clock.now()).toBeCloseTo(1.5, 9);
    advance(10_000);
    expect(clock.now()).toBeCloseTo(1.5, 9);
  });

  it('lets windows open again once it ends', () => {
    const { clock, s } = setup();
    s.setReason(reason, true);
    s.setReason(reason, false);
    expect(s.suspended()).toBe(false);
    expect(clock.requestWindow('fan', 3000)).toBe(true);
  });
});

describe('several reasons', () => {
  it('refuses windows until every reason has ended', () => {
    const { clock, s } = setup();
    s.setReason('hidden', true);
    s.setReason('reduced-motion', true);
    s.setReason('hidden', false);
    expect(clock.requestWindow('fan', 3000)).toBe(false);
    s.setReason('reduced-motion', false);
    expect(clock.requestWindow('fan', 3000)).toBe(true);
  });
});

describe('asking for a frame', () => {
  it('tells the shell when a window opens or is extended, but not when a request is refused', () => {
    const { clock, s, changes } = setup();
    clock.requestWindow('fan', 3000);
    expect(changes()).toBe(1);
    clock.requestWindow('fan', 3000);
    expect(changes()).toBe(2);
    s.setReason('hidden', true);
    const afterClose = changes();
    clock.requestWindow('fan', 3000);
    expect(changes()).toBe(afterClose);
  });

  it('closes every window when it is disposed, and can be used again by a remounted scene', () => {
    const { clock, s } = setup();
    clock.requestWindow('fan', 3000);
    s.dispose();
    expect(s.openIds()).toEqual([]);
    expect(clock.requestWindow('fan', 3000)).toBe(true);
  });

  it('tells a listener set later, and none after it is cleared', () => {
    let told = 0;
    const s = createAmbientScheduler({ nowMs: () => 0 });
    s.setOnChange(() => (told += 1));
    s.clock.requestWindow('fan', 1000);
    expect(told).toBe(1);
    s.setOnChange(null);
    s.clock.requestWindow('paper', 1000);
    expect(told).toBe(1);
  });
});
