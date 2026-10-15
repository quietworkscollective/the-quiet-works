/**
 * The corridor through the real sound desk: rooms, the first gesture, mute, disposal and the
 * Office alongside it. `spineSound.test.ts` covers the voices and their schedule; this file
 * covers what the desk promises around them. Audibility is judged on the graph itself: the gain
 * with which a source reaches the speakers at a given time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { replyFor, type Cue, type SpineCue } from '@tqw/engine';
import { createSoundDesk } from './soundDesk.ts';
import type { SoundRoom } from './types.ts';
import {
  audibleGain,
  context,
  FakeAudioContext,
  FakeBiquad,
  FakeBufferSource,
  FakeCompressor,
  FakeConvolver,
  FakeGain,
  FakeOscillator,
  FakeSource,
  installFakeAudio,
} from './spineTestAudio.ts';

type Desk = ReturnType<typeof createSoundDesk>;

function advance(ctx: FakeAudioContext, seconds: number, step = 0.05): void {
  for (let i = 0; i < Math.round(seconds / step); i += 1) {
    ctx.currentTime += step;
    vi.advanceTimersByTime(step * 1000);
  }
}

/** A desk unlocked in `room` (set before the gesture, as the app does), and its context. */
function unlocked(room?: SoundRoom): { desk: Desk; ctx: FakeAudioContext } {
  const desk = createSoundDesk();
  if (room !== undefined) desk.setRoom(room);
  desk.unlock();
  return { desk, ctx: context() };
}

const OFFICE_DRONE = 73.42;
const contact: Cue = { type: 'contact' };
const open: SpineCue = { type: 'door-open', id: 'certification-office', via: 'door' };
const sealed: SpineCue = { type: 'door-sealed', id: 'apartment' };

/** The Office's ambience: its D2 and A2 drones and the vent, which reads the noise at its natural rate. */
function officeSources(ctx: FakeAudioContext): FakeSource[] {
  const drones = ctx.of(FakeOscillator).filter((o) => o.stopTime === null && [OFFICE_DRONE, 110].some((hz) => Math.abs(o.frequency.valueAt(0) - hz) < 0.01));
  const officeVentFilters = ctx.of(FakeBiquad).filter((filter) => filter.frequency.valueAt(0) === 380);
  const vent = officeVentFilters.flatMap((filter) => ctx.inputsOf(filter)).filter((source): source is FakeBufferSource => source instanceof FakeBufferSource && source.loop && source.stopTime === null);
  return [...drones, ...vent];
}

/** The corridor's tone: the looped noise read at its own rates, and nothing tonal. */
function toneSources(ctx: FakeAudioContext): FakeBufferSource[] {
  return ctx.of(FakeBufferSource).filter((s) => s.loop && s.stopTime === null && s.playbackRate.valueAt(0) !== 1);
}

function exchangeSources(ctx: FakeAudioContext): FakeOscillator[] {
  return ctx.of(FakeOscillator).filter((o) => o.stopTime === null && [60, 120, 180].includes(o.frequency.valueAt(0)));
}

const loudest = (list: readonly FakeSource[], time: number): number => Math.max(0, ...list.map((s) => audibleGain(s, time)));

/** The audible level of a room at `time`: loudest source. Silent is under -100 dB; present is above -60 dB. */
const SILENT = 1e-5;
const PRESENT = 1e-3;

beforeEach(() => {
  installFakeAudio();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('before the first gesture', () => {
  it('creates no AudioContext however the room, the walk and the doors are driven', () => {
    const desk = createSoundDesk();
    desk.setRoom('corridor');
    desk.setRoom('certification-office');
    desk.setWalk(1.1);
    desk.playSpine(open);
    desk.playSpine(sealed);
    desk.playSpine({ type: 'board-open' });
    desk.setWalk(0);
    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('creates none on unlock while muted either, and builds the corridor on the first unmuted gesture', () => {
    const desk = createSoundDesk();
    desk.setRoom('corridor');
    desk.setMuted(true);
    desk.unlock();
    expect(FakeAudioContext.instances).toHaveLength(0);
    desk.setMuted(false);
    desk.unlock();
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(toneSources(context()).length).toBeGreaterThan(4);
  });
});

describe('rooms', () => {
  it('gives the Exchange its own quiet switchboard bed, separate from the corridor and Office', () => {
    const { ctx } = unlocked('exchange');
    expect(exchangeSources(ctx).map(source => source.frequency.valueAt(0)).sort((a, b) => a - b)).toEqual([60, 120, 180]);
    expect(officeSources(ctx)).toEqual([]);
    expect(toneSources(ctx)).toEqual([]);
  });

  it('starts in the room that was set before the gesture: the corridor has its own tone and no Office drone', () => {
    const { ctx } = unlocked('corridor');
    expect(toneSources(ctx).length).toBeGreaterThanOrEqual(5);
    expect(officeSources(ctx)).toEqual([]);
    // The tone fades in over 3 s, like the Office's did.
    expect(loudest(toneSources(ctx), 0.01)).toBeLessThan(SILENT * 100);
    expect(loudest(toneSources(ctx), 3.5)).toBeGreaterThan(PRESENT);
  });

  it('starts in the Office when the room set before the gesture was the Office, and in the Office when nothing was set', () => {
    for (const room of ['certification-office', undefined] as const) {
      const { ctx } = unlocked(room);
      expect(officeSources(ctx).length).toBe(3);
      expect(toneSources(ctx)).toEqual([]);
      expect(loudest(officeSources(ctx), 4)).toBeGreaterThan(PRESENT / 10);
      FakeAudioContext.instances = [];
    }
  });

  it('plays the Office ambience in the Office only: silent in the corridor, audible in the Office', () => {
    const { desk, ctx } = unlocked('certification-office');
    const office = officeSources(ctx);
    ctx.currentTime = 10;
    expect(loudest(office, 10)).toBeGreaterThan(PRESENT / 10);

    desk.setRoom('corridor');
    ctx.currentTime = 20;
    expect(loudest(office, 20)).toBeLessThan(SILENT);
    expect(loudest(toneSources(ctx), 20)).toBeGreaterThan(PRESENT);

    desk.setRoom('certification-office');
    ctx.currentTime = 30;
    expect(loudest(office, 30)).toBeGreaterThan(PRESENT / 10);
    expect(loudest(toneSources(ctx), 30)).toBeLessThan(SILENT);
  });

  it('does the same coming the other way: the Office ambience is built on first entry, audible there and silent when left', () => {
    const { desk, ctx } = unlocked('corridor');
    ctx.currentTime = 12;
    desk.setRoom('certification-office');
    const office = officeSources(ctx);
    expect(office.length).toBe(3);
    expect(loudest(office, 12 + 1.3)).toBeGreaterThan(PRESENT / 10);
    expect(loudest(toneSources(ctx), 12 + 1.3)).toBeLessThan(SILENT);

    ctx.currentTime = 30;
    desk.setRoom('corridor');
    expect(loudest(officeSources(ctx), 31.3)).toBeLessThan(SILENT);
    expect(loudest(toneSources(ctx), 31.3)).toBeGreaterThan(PRESENT);
  });

  it('crossfades over 1.2 s on an equal-power curve: neither room is ever silent in the middle', () => {
    const { desk, ctx } = unlocked('certification-office');
    const office = officeSources(ctx);
    ctx.currentTime = 10;
    const before = loudest(office, 10);
    desk.setRoom('corridor');
    const mid = loudest(office, 10.6);
    const end = loudest(office, 11.2);
    const after = loudest(office, 11.3);
    expect(mid / before).toBeCloseTo(Math.SQRT1_2, 1);
    expect(end).toBeLessThan(before * 0.05);
    expect(after).toBeLessThan(SILENT);
    // The corridor arrives as the Office leaves: at the midpoint both are at 0.707.
    const tone = toneSources(ctx);
    const full = loudest(tone, 12);
    expect(loudest(tone, 10.6) / full).toBeCloseTo(Math.SQRT1_2, 1);
    expect(loudest(tone, 10)).toBeLessThan(full * 0.01);
  });

  it('treats every sealed chamber as the corridor: no room tone of its own is built for a door that does not open', () => {
    for (const id of ['apartment', 'tomorrow-engine', 'great-atrium'] as const) {
      FakeAudioContext.instances = [];
      const { desk, ctx } = unlocked('certification-office');
      ctx.currentTime = 10;
      desk.setRoom(id);
      expect(loudest(officeSources(ctx), 11.5), id).toBeLessThan(SILENT);
      expect(loudest(toneSources(ctx), 11.5), id).toBeGreaterThan(PRESENT);
    }
  });

  it('carries on from where an interrupted crossfade had got to, with no jump', () => {
    const { desk, ctx } = unlocked('certification-office');
    const office = officeSources(ctx);
    ctx.currentTime = 10;
    desk.setRoom('corridor');
    ctx.currentTime = 10.6;
    const mid = loudest(office, 10.6);
    desk.setRoom('certification-office');
    expect(loudest(office, 10.6)).toBeCloseTo(mid, 9);
    // From there it only rises, to full: a fade that jumped to its start would dip first.
    let previous = mid;
    for (let t = 10.65; t <= 10.6 + 1.2; t += 0.05) {
      const level = loudest(office, t);
      expect(level, `at ${t.toFixed(2)} s`).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = level;
    }
    expect(loudest(office, 10.6 + 1.2)).toBeGreaterThan(mid);
    expect(loudest(office, 10.6 + 1.2)).toBeCloseTo(loudest(office, 10.6 + 5), 9);
  });

  it('builds each room tone once: going back and forth makes no new endless sources', () => {
    const { desk, ctx } = unlocked('corridor');
    const endless = (): number => ctx.sources().filter((s) => s.stopTime === null).length;
    ctx.currentTime = 5;
    desk.setRoom('certification-office');
    const both = endless();
    for (let i = 0; i < 4; i += 1) {
      ctx.currentTime += 5;
      desk.setRoom('corridor');
      ctx.currentTime += 5;
      desk.setRoom('certification-office');
    }
    expect(endless()).toBe(both);
  });

  it('does not build the corridor for a session that stays in the Office', () => {
    const { desk, ctx } = unlocked('certification-office');
    const nodes = ctx.nodes.length;
    desk.setRoom('certification-office');
    desk.setWalk(0);
    expect(ctx.nodes).toHaveLength(nodes);
    expect(ctx.nodes.some((n) => n.kind === 'convolver')).toBe(false);
    // Doors and footsteps are the corridor's, and build it when they are needed...
    desk.playSpine({ type: 'chamber-leave', id: 'certification-office' });
    expect(ctx.nodes.some((n) => n.kind === 'convolver')).toBe(true);
    // ...but the tone is not: the Office is still the room.
    expect(toneSources(ctx)).toEqual([]);
  });

  it('keeps the corridor off the Office\'s buses: not through its ambience fade, not touched by a reset or an overload', () => {
    const { desk, ctx } = unlocked('corridor');
    ctx.currentTime = 10;
    desk.playSpine(open);
    const tone = toneSources(ctx);
    const before = loudest(tone, 10);
    expect(before).toBeGreaterThan(PRESENT);

    desk.play(contact);
    desk.play({ type: 'reply', step: 5, line: replyFor(5) });
    desk.play({ type: 'overload' });
    // The overload ducks the Office's ambience 18 dB from about 11.8 s for 1.6 s, and the room
    // returns 3 dB lower. The corridor is not on that bus, so it neither ducks nor settles lower.
    const ducked = ctx.nodes.filter((n): n is FakeGain => n instanceof FakeGain && n.gain.targets().some((t) => t.value < 0.2 && t.value > 0.1 && t.kind === 'exp'));
    expect(ducked.length, 'the overload did duck something').toBeGreaterThan(0);
    for (const t of [10, 12, 12.5, 13, 14, 16, 20]) expect(loudest(tone, t), `at ${t} s`).toBeCloseTo(before, 12);
    ctx.currentTime = 11;
    desk.play({ type: 'reset' });
    expect(loudest(tone, 14)).toBeCloseTo(before, 12);
    // The reset retires the Office's one-shots within 25 ms; a door opened before it is not one of them.
    const door = ctx.sources().filter((s) => s.startTime !== null && s.startTime >= 10 && s.startTime < 10.5 && s.stopTime !== null);
    expect(door.length).toBeGreaterThan(5);
    const handle = door.find((s) => s.startTime === 10);
    expect(handle).toBeDefined();
    if (handle !== undefined) {
      const wet = audibleGain(handle, 10.01);
      desk.play({ type: 'reset' });
      expect(audibleGain(handle, 10.01)).toBeCloseTo(wet, 12);
    }
  });

  it('still has three buses into the master and one limiter: the corridor joins one of them', () => {
    const { desk, ctx } = unlocked('corridor');
    desk.playSpine(open);
    desk.setWalk(1.1);
    advance(ctx, 2);
    const [limiter] = ctx.of(FakeCompressor);
    expect(limiter).toBeDefined();
    const [master] = limiter === undefined ? [] : ctx.inputsOf(limiter);
    expect(master).toBeInstanceOf(FakeGain);
    expect(master === undefined ? [] : ctx.inputsOf(master)).toHaveLength(3);
    expect(ctx.inputsOf(ctx.destination)).toEqual([limiter]);
  });
});

describe('walking through the desk', () => {
  /** The heel of a step: a sine that falls from about 175 Hz. */
  const heels = (ctx: FakeAudioContext): FakeOscillator[] =>
    ctx.of(FakeOscillator).filter((o) => o.type === 'sine' && o.stopTime !== null && o.frequency.valueAt(0) > 160 && o.frequency.valueAt(0) < 195);

  it('walks at about 1.6 steps a second from one setWalk', () => {
    const { desk, ctx } = unlocked('corridor');
    desk.setWalk(1.1);
    advance(ctx, 10);
    expect(heels(ctx).length).toBeGreaterThanOrEqual(15);
    expect(heels(ctx).length).toBeLessThanOrEqual(17);
  });

  it('remembers a walk reported before the gesture and begins it on unlock', () => {
    const desk = createSoundDesk();
    desk.setRoom('corridor');
    desk.setWalk(1.1);
    desk.unlock();
    const ctx = context();
    advance(ctx, 5);
    expect(heels(ctx).length).toBeGreaterThanOrEqual(7);
  });

  it('stops at 0 and plays nothing after', () => {
    const { desk, ctx } = unlocked('corridor');
    desk.setWalk(1.1);
    advance(ctx, 3);
    desk.setWalk(0);
    const count = heels(ctx).length;
    advance(ctx, 5);
    // One step may have been committed inside the grace window; never more.
    expect(heels(ctx).length).toBeLessThanOrEqual(count + 1);
    const settled = heels(ctx).length;
    advance(ctx, 5);
    expect(heels(ctx)).toHaveLength(settled);
  });

  it('builds nothing for a walk that is not a walk: zero, negative, not a number', () => {
    const { desk, ctx } = unlocked('certification-office');
    const nodes = ctx.nodes.length;
    for (const speed of [0, -1, Number.NaN, Number.NEGATIVE_INFINITY]) desk.setWalk(speed);
    expect(ctx.nodes).toHaveLength(nodes);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is quiet in a chamber: the same steps with the room nearly gone', () => {
    const { desk, ctx } = unlocked('certification-office');
    desk.setWalk(1.1);
    advance(ctx, 3);
    expect(heels(ctx).length).toBeGreaterThan(3);
    // No corridor tone was built for a walk in the Office.
    expect(toneSources(ctx)).toEqual([]);
  });
});

describe('muting', () => {
  it('builds nothing while muted: not a cue, not a step, not a room', () => {
    const { desk, ctx } = unlocked('corridor');
    desk.setMuted(true);
    const nodes = ctx.nodes.length;
    for (const cue of [open, sealed, { type: 'board-open' } as const, { type: 'chamber-leave', id: 'certification-office' } as const]) {
      ctx.currentTime += 1;
      desk.playSpine(cue);
    }
    desk.setWalk(1.1);
    desk.setRoom('certification-office');
    desk.setRoom('corridor');
    advance(ctx, 5);
    expect(ctx.nodes).toHaveLength(nodes);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not build a corridor for a walk reported while muted', () => {
    const { desk, ctx } = unlocked('certification-office');
    desk.setMuted(true);
    const nodes = ctx.nodes.length;
    desk.setWalk(1.1);
    desk.playSpine(open);
    advance(ctx, 3);
    expect(ctx.nodes).toHaveLength(nodes);
    expect(ctx.nodes.some((n) => n.kind === 'convolver')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops a walk already under way: no timer, no more steps', () => {
    const { desk, ctx } = unlocked('corridor');
    desk.setWalk(1.1);
    advance(ctx, 2);
    desk.setMuted(true);
    expect(vi.getTimerCount()).toBe(0);
    const nodes = ctx.nodes.length;
    advance(ctx, 5);
    expect(ctx.nodes).toHaveLength(nodes);
  });

  it('applies what changed while it was muted when it is unmuted: the room, and a walk still going', () => {
    const { desk, ctx } = unlocked('corridor');
    ctx.currentTime = 10;
    desk.setMuted(true);
    desk.setRoom('certification-office');
    desk.setWalk(1.1);
    ctx.currentTime = 20;
    desk.setMuted(false);
    expect(officeSources(ctx).length).toBe(3);
    expect(loudest(officeSources(ctx), 21.5)).toBeGreaterThan(PRESENT / 10);
    expect(loudest(toneSources(ctx), 21.5)).toBeLessThan(SILENT);
    // The walk is still going, so the feet begin again.
    const before = ctx.nodes.length;
    advance(ctx, 3);
    expect(ctx.nodes.length).toBeGreaterThan(before + 50);
  });

  it('does not resume a walk that stopped while it was muted', () => {
    const { desk, ctx } = unlocked('corridor');
    const heels = (): number =>
      ctx.of(FakeOscillator).filter((o) => o.type === 'sine' && o.stopTime !== null && o.frequency.valueAt(0) > 160 && o.frequency.valueAt(0) < 195).length;
    desk.setWalk(1.1);
    advance(ctx, 1);
    desk.setMuted(true);
    desk.setWalk(0);
    desk.setMuted(false);
    const before = heels();
    expect(before).toBeGreaterThan(0);
    advance(ctx, 5);
    expect(heels()).toBe(before);
  });
});

describe('disposal', () => {
  it('closes the context, stops every endless source of both rooms, clears the timer, and does nothing afterwards', () => {
    const { desk, ctx } = unlocked('corridor');
    ctx.currentTime = 5;
    desk.setRoom('certification-office');
    ctx.currentTime = 10;
    desk.setRoom('corridor');
    desk.setWalk(1.1);
    advance(ctx, 2);
    desk.playSpine(open);
    expect(ctx.sources().filter((s) => s.stopTime === null).length).toBeGreaterThan(10);
    expect(vi.getTimerCount()).toBe(1);

    desk.dispose();
    expect(ctx.closeCalls).toBe(1);
    expect(ctx.sources().filter((s) => s.stopTime === null)).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    expect(ctx.of(FakeGain).filter((g) => g.connected && g.outputs.has(ctx.destination))).toEqual([]);

    const nodes = ctx.nodes.length;
    desk.unlock();
    desk.setRoom('certification-office');
    desk.setWalk(1.1);
    desk.playSpine(open);
    desk.setMuted(false);
    desk.dispose();
    advance(ctx, 5);
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(ctx.nodes).toHaveLength(nodes);
    expect(ctx.closeCalls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('disposes a desk that never built a corridor without complaint', () => {
    const { desk, ctx } = unlocked('certification-office');
    expect(() => desk.dispose()).not.toThrow();
    expect(ctx.closeCalls).toBe(1);
    const never = createSoundDesk();
    expect(() => never.dispose()).not.toThrow();
  });
});

describe('a platform that cannot do it all', () => {
  /** An AudioContext whose noise sources always fail, and which counts how often the corridor's room is attempted. */
  function brokenNoise(): { rooms: () => number } {
    let rooms = 0;
    vi.stubGlobal(
      'AudioContext',
      class extends FakeAudioContext {
        override createBufferSource = (): FakeBufferSource => {
          throw new Error('InvalidStateError');
        };
        override createConvolver = (): FakeConvolver => {
          rooms += 1;
          return new FakeConvolver(this);
        };
      },
    );
    return { rooms: () => rooms };
  }

  it('never throws out of a corridor call, and does not try to rebuild a corridor it could not build on every frame', () => {
    const { rooms } = brokenNoise();
    const desk = createSoundDesk();
    desk.setRoom('corridor');
    expect(() => desk.unlock()).not.toThrow();
    for (let i = 0; i < 30; i += 1) {
      expect(() => desk.playSpine(sealed)).not.toThrow();
      expect(() => desk.setWalk(1.1)).not.toThrow();
      expect(() => desk.setRoom(i % 2 === 0 ? 'certification-office' : 'corridor')).not.toThrow();
    }
    expect(rooms()).toBe(1);
    expect(() => desk.dispose()).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('closes the context it opened even when the corridor could not be built in it', () => {
    brokenNoise();
    const desk = createSoundDesk();
    desk.setRoom('corridor');
    desk.unlock();
    desk.dispose();
    expect(FakeAudioContext.instances.map((c) => c.closeCalls)).toEqual([1]);
  });
});
