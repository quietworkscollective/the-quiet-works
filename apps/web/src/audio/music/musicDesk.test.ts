/**
 * The gramophone through the real sound desk: the first gesture, the rooms, mute, the page, the
 * needle's verbs, the corridor's distance and disposal. `needle.test.ts`, `space.test.ts` and
 * `store.test.ts` cover the machine, the fall-off and the store; this file covers what the desk
 * promises around them. Audibility is judged on the graph itself: the gain with which the music
 * reaches the speakers at a given time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSoundDesk } from '../soundDesk.ts';
import type { SoundRoom } from '../types.ts';
import { audibleGain, FakeAudioContext, FakeBiquad, FakeBufferSource, FakeConvolver, FakeGain, FakeOscillator, FakePanner } from '../spineTestAudio.ts';
import { gramophone } from './index.ts';
import { LEAD_IN_MS, RUN_OUT_MS, SWAP_MS } from './needle.ts';
import { GRAMOPHONE, mixAt } from './space.ts';
import { FakeAudioElement, FakeMediaSource, installMusicAudio, musicContext, type MusicFakeContext } from './testAudio.ts';
import { FIRST_FADE_IN_S, LIFT_FADE_OUT_S, ROOM_FADE_IN_S, ROOM_FADE_OUT_S } from './musicSound.ts';

/** The brief's figures, written out here so a test never takes them from the code it holds to them. */
const FADE_IN_AT_START_S = 3;
const CHAMBER_FADE_OUT_S = 1.5;
const CORRIDOR_RETURN_S = 3;

type Desk = ReturnType<typeof createSoundDesk>;

async function advance(ctx: FakeAudioContext, seconds: number, step = 0.05): Promise<void> {
  for (let i = 0; i < Math.round(seconds / step); i += 1) {
    ctx.currentTime += step;
    await vi.advanceTimersByTimeAsync(step * 1000);
  }
}

let elements: () => FakeAudioElement[];

beforeEach(() => {
  elements = installMusicAudio().elements;
  vi.useFakeTimers();
  gramophone.reset();
});
afterEach(() => {
  gramophone.reset();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A desk unlocked in `room` (set before the gesture, as the app does), and its context. */
function unlocked(room: SoundRoom = 'corridor'): { desk: Desk; ctx: MusicFakeContext } {
  const desk = createSoundDesk();
  desk.setRoom(room);
  desk.unlock();
  return { desk, ctx: musicContext() };
}

const media = (ctx: FakeAudioContext): FakeMediaSource => {
  const [source] = ctx.of(FakeMediaSource as unknown as new (c: FakeAudioContext) => FakeMediaSource);
  if (!source) throw new Error('the gramophone built no media source');
  return source;
};
/** How loud the music is at the speakers now: the graph's gain from the element to the destination. */
const level = (ctx: FakeAudioContext): number => audibleGain(media(ctx), ctx.currentTime);
const element = (): FakeAudioElement => {
  const [first] = elements();
  if (!first) throw new Error('no audio element was made');
  return first;
};
const plays = (el: FakeAudioElement): number => el.log.filter((l) => l.startsWith('play')).length;
/** The record's surface: looping noise at its own speed (the corridor's tone reads the same noise at other speeds). */
const surfaceLoops = (ctx: FakeAudioContext): FakeBufferSource[] => ctx.of(FakeBufferSource).filter((s) => s.loop && s.stopTime === null && s.playbackRate.valueAt(0) === 1);

/** Everything up to full volume: unlock, the lead-in, the first record's 3 s fade-in. */
async function playing(room: SoundRoom = 'corridor'): Promise<{ desk: Desk; ctx: MusicFakeContext }> {
  const made = unlocked(room);
  await advance(made.ctx, LEAD_IN_MS / 1000 + FADE_IN_AT_START_S + 0.5);
  return made;
}

describe('the fades', () => {
  it('are the brief\'s: 3 s in at the start, 1.5 s out inside a chamber, 3 s back in the corridor, a quarter second to lift', () => {
    expect([FIRST_FADE_IN_S, ROOM_FADE_OUT_S, ROOM_FADE_IN_S, LIFT_FADE_OUT_S]).toEqual([FADE_IN_AT_START_S, CHAMBER_FADE_OUT_S, CORRIDOR_RETURN_S, 0.25]);
  });
});

describe('no audio element before the first gesture', () => {
  it('makes no element, no AudioContext and no request however the room, the walk, the verbs and the listener are driven', () => {
    const desk = createSoundDesk();
    desk.setRoom('corridor');
    desk.setRoom('certification-office');
    desk.setRoom('corridor');
    desk.setWalk(1.1);
    desk.setMuted(true);
    desk.setMuted(false);
    gramophone.setListener({ x: 0, z: 3, yawDeg: 0 });
    gramophone.act('play');
    gramophone.act('lift');
    gramophone.act('change');
    vi.advanceTimersByTime(60_000);
    expect(elements()).toHaveLength(0);
    expect(FakeAudioContext.instances).toHaveLength(0);
    desk.dispose();
  });

  it('makes exactly one element on the first unlock, and plays it there, inside the gesture, silently, until the lead-in is over', async () => {
    const desk = createSoundDesk();
    desk.setRoom('corridor');
    desk.unlock();
    const ctx = musicContext();
    expect(elements()).toHaveLength(1);
    expect(element().preload).toBe('none');
    // The record is asked for and played inside the unlock itself, before any timer has run: a browser
    // decides whether a page may play sound by whether play() is called inside a gesture.
    expect(element().src).toMatch(/satie-gymnopedie-1.*\.webm$/);
    expect(plays(element())).toBe(1);
    // But it is silent: the lead-in is the needle alone on the shellac.
    await advance(ctx, 1.5);
    expect(level(ctx)).toBe(0);
    element().currentTime = 2.2;
    await advance(ctx, 1);
    // The music begins from its first groove, without a second play(), and comes up from silence.
    expect(element().currentTime).toBe(0);
    expect(plays(element())).toBe(1);
    await advance(ctx, 4);
    expect(level(ctx)).toBeGreaterThan(0.01);
  });

  it('does nothing while muted: an unlock with the sound off makes no element, and unmuting then does', () => {
    const desk = createSoundDesk();
    desk.setRoom('corridor');
    desk.setMuted(true);
    desk.unlock();
    expect(elements()).toHaveLength(0);
    desk.setMuted(false);
    desk.unlock();
    expect(elements()).toHaveLength(1);
    desk.dispose();
  });

  it('keeps one element for the life of a desk, however many more gestures follow', async () => {
    const { desk, ctx } = unlocked();
    desk.unlock();
    desk.unlock();
    await advance(ctx, 2);
    desk.unlock();
    expect(elements()).toHaveLength(1);
  });
});

describe('the first record', () => {
  it('begins after the lead-in and comes up from silence over three seconds', async () => {
    const { ctx } = unlocked();
    await advance(ctx, LEAD_IN_MS / 1000);
    const start = ctx.currentTime;
    const early = level(ctx);
    expect(early).toBeLessThan(0.02);
    await advance(ctx, FADE_IN_AT_START_S / 2);
    const mid = level(ctx);
    await advance(ctx, FADE_IN_AT_START_S / 2 + 0.2);
    const done = level(ctx);
    expect(early).toBeLessThan(mid);
    expect(mid).toBeLessThan(done);
    expect(mid).toBeGreaterThan(done * 0.2);
    expect(mid).toBeLessThan(done * 0.8);
    expect(ctx.currentTime - start).toBeGreaterThanOrEqual(FADE_IN_AT_START_S);
    // And it holds there.
    await advance(ctx, 5);
    expect(level(ctx)).toBeCloseTo(done, 6);
  });

  it('is caption-announced once, when the record has begun to sound', async () => {
    const lines: number[] = [];
    gramophone.onAnnounce((l) => lines.push(l.record));
    const { ctx } = unlocked();
    await advance(ctx, LEAD_IN_MS / 1000 + 0.1);
    expect(lines).toEqual([0]);
    await advance(ctx, 5);
    expect(lines).toEqual([0]);
  });

  it('waits in a chamber: no file is requested until the visitor is in the corridor, and then it begins at once', async () => {
    const { desk, ctx } = unlocked('certification-office');
    await advance(ctx, 10);
    expect(elements()).toHaveLength(1);
    expect(element().src).toBe('');
    expect(plays(element())).toBe(0);
    expect(level(ctx)).toBe(0);
    desk.setRoom('corridor');
    await advance(ctx, 0.1);
    expect(plays(element())).toBe(1);
    expect(element().src).not.toBe('');
  });
});

describe('mute', () => {
  it('follows the Sound setting exactly: off silences and pauses the record where it is, on lets it go on', async () => {
    const { desk, ctx } = await playing();
    expect(level(ctx)).toBeGreaterThan(0.01);
    element().currentTime = 41.5;
    desk.setMuted(true);
    await advance(ctx, 0.3);
    expect(level(ctx)).toBe(0);
    expect(element().paused).toBe(true);
    await advance(ctx, 20);
    desk.setMuted(false);
    await advance(ctx, 0.3);
    expect(element().paused).toBe(false);
    expect(element().currentTime).toBe(41.5);
    expect(level(ctx)).toBeGreaterThan(0.01);
    expect(plays(element())).toBe(2);
  });

  it('does not start a record by itself while the sound is off, and the needle verbs still move the machine', async () => {
    const { desk, ctx } = await playing();
    desk.setMuted(true);
    gramophone.act('lift');
    gramophone.act('play');
    await advance(ctx, LEAD_IN_MS / 1000 + 0.5);
    expect(gramophone.getState().needle).toBe('playing');
    expect(element().paused).toBe(true);
    expect(level(ctx)).toBe(0);
  });
});

describe('rooms', () => {
  it('fades out over 1.5 s inside a chamber, then pauses the record; every chamber, sealed or open, does the same', async () => {
    for (const room of ['certification-office', 'apartment', 'great-atrium'] as const) {
      gramophone.reset();
      vi.clearAllTimers();
      const { desk, ctx } = await playing();
      const full = level(ctx);
      desk.setRoom(room);
      await advance(ctx, CHAMBER_FADE_OUT_S / 2);
      const mid = level(ctx);
      expect(mid).toBeGreaterThan(full * 0.3);
      expect(mid).toBeLessThan(full * 0.95);
      await advance(ctx, CHAMBER_FADE_OUT_S / 2 + 0.05);
      expect(level(ctx)).toBeLessThan(full * 1e-3);
      await advance(ctx, 0.3);
      expect(element().paused).toBe(true);
      desk.dispose();
    }
  });

  it('returns over 3 s in the corridor, resuming the record where it was left', async () => {
    const { desk, ctx } = await playing();
    const full = level(ctx);
    element().currentTime = 17.25;
    desk.setRoom('certification-office');
    await advance(ctx, CHAMBER_FADE_OUT_S + 0.5);
    expect(element().paused).toBe(true);
    desk.setRoom('corridor');
    await advance(ctx, 0.1);
    expect(element().paused).toBe(false);
    expect(element().currentTime).toBe(17.25);
    await advance(ctx, CORRIDOR_RETURN_S / 2 - 0.1);
    const mid = level(ctx);
    expect(mid).toBeGreaterThan(full * 0.1);
    expect(mid).toBeLessThan(full * 0.9);
    await advance(ctx, CORRIDOR_RETURN_S / 2 + 0.1);
    expect(level(ctx)).toBeCloseTo(full, 5);
  });

  it('keeps the music if the visitor comes straight back before the fade has finished', async () => {
    const { desk, ctx } = await playing();
    const full = level(ctx);
    desk.setRoom('certification-office');
    await advance(ctx, 0.5);
    desk.setRoom('corridor');
    await advance(ctx, CORRIDOR_RETURN_S + 0.5);
    expect(element().paused).toBe(false);
    expect(level(ctx)).toBeCloseTo(full, 5);
  });
});

describe('where the visitor stands', () => {
  async function levelAt(ctx: MusicFakeContext, x: number, z: number): Promise<number> {
    gramophone.setListener({ x, z, yawDeg: 0 });
    await advance(ctx, 0.4);
    return level(ctx);
  }

  it('is quieter at every step down the corridor from the gramophone to the far end, and never silent', async () => {
    const { ctx } = await playing();
    let last = Number.POSITIVE_INFINITY;
    for (const z of [GRAMOPHONE.z, 0, -4, -8, -12, -16, -19]) {
      const now = await levelAt(ctx, 0, z);
      expect(now, `at z = ${z}`).toBeGreaterThan(0.0005);
      if (z !== GRAMOPHONE.z) expect(now, `at z = ${z}`).toBeLessThan(last);
      last = now;
    }
  });

  it('follows the same fall-off the space model gives: the first bay clearly lower than beside it, the third bay lower again', async () => {
    const { ctx } = await playing();
    const near = await levelAt(ctx, -1.6, GRAMOPHONE.z);
    const first = await levelAt(ctx, 0, -0.8);
    const third = await levelAt(ctx, 0, -8);
    const ratioDb = (a: number, b: number) => 20 * Math.log10(a / b);
    // The direct sound and the room add, so the graph is within about 3 dB of the model's figure.
    expect(ratioDb(first, near)).toBeLessThan(-5);
    expect(ratioDb(third, near)).toBeLessThan(ratioDb(first, near) - 4);
    expect(Math.abs(ratioDb(first, near) - mixAt({ x: 0, z: -0.8, yawDeg: 0 }).gainDb)).toBeLessThan(3.5);
    expect(Math.abs(ratioDb(third, near) - mixAt({ x: 0, z: -8, yawDeg: 0 }).gainDb)).toBeLessThan(3.5);
  });

  it('retargets the air filter by cancel, set and ramp, never by holding a ramp: a held biquad frequency was measured to burst by 33 dB', async () => {
    const { ctx } = await playing();
    const panner = ctx.of(FakePanner).find((p) => ctx.inputsOf(p).some((i) => i instanceof FakeBiquad))!;
    const air = ctx.inputsOf(panner).find((n): n is FakeBiquad => n instanceof FakeBiquad)!;
    // A walk: the camera reports a new position on every frame.
    for (let i = 0; i <= 40; i += 1) {
      gramophone.setListener({ x: 0, z: 2 - i * 0.4, yawDeg: 0 });
      await advance(ctx, 0.05);
    }
    await advance(ctx, 0.4);
    const calls = air.frequency.log.map((e) => e.call);
    expect(calls.filter((c) => c === 'linear').length).toBeGreaterThan(20);
    expect(calls).not.toContain('hold');
    // And the filter still ends where the model puts it for the far end.
    expect(air.frequency.valueAt(ctx.currentTime)).toBeCloseTo(mixAt({ x: 0, z: 2 - 40 * 0.4, yawDeg: 0 }).lowpassHz, 3);
  });

  it('sends the share of the sound the model gives to the corridor\'s own reverb, and pans it to the side the horn is on', async () => {
    const { ctx } = await playing();
    const convolver = ctx.of(FakeConvolver)[0]!;
    const send = ctx.inputsOf(convolver)[0]!;
    // The music's wet gain is the one feeding the reverb's input that is itself fed by the air filter.
    const wet = ctx.inputsOf(send).find((n): n is FakeGain => n instanceof FakeGain && ctx.inputsOf(n).some((i) => i instanceof FakeBiquad))!;
    expect(wet).toBeDefined();
    const panner = ctx.of(FakePanner).find((p) => ctx.inputsOf(p).some((i) => i instanceof FakeBiquad))!;
    for (const pose of [
      { x: -1.6, z: GRAMOPHONE.z, yawDeg: 0 },
      { x: 0, z: -0.8, yawDeg: 0 },
      { x: 0, z: -8, yawDeg: 0 },
      { x: 0, z: -18, yawDeg: 180 },
    ]) {
      gramophone.setListener(pose);
      await advance(ctx, 0.4);
      const mix = mixAt(pose);
      expect(wet.gain.valueAt(ctx.currentTime), `wet at z = ${pose.z}`).toBeCloseTo(mix.wet, 9);
      expect(panner.pan.valueAt(ctx.currentTime), `pan at z = ${pose.z}`).toBeCloseTo(mix.pan, 9);
    }
  });
});

describe('the needle\'s verbs through the desk', () => {
  it('lifting stops the music over a quarter of a second and pauses the element; a lift sound is made', async () => {
    const { ctx } = await playing();
    const sourcesBefore = ctx.sources().length;
    gramophone.act('lift');
    await advance(ctx, 0.25 / 2);
    const mid = level(ctx);
    await advance(ctx, 0.25);
    expect(level(ctx)).toBeLessThan(mid);
    expect(level(ctx)).toBeLessThan(1e-4);
    await advance(ctx, 0.2);
    expect(element().paused).toBe(true);
    // The needle's lift is a graph of its own (noise and a tink): more sources than before.
    expect(ctx.sources().length).toBeGreaterThan(sourcesBefore);
    expect(gramophone.getState().needle).toBe('up');
  });

  it('Play drops the needle: crackle in the lead-in, then the same record from its first groove', async () => {
    const { ctx } = await playing();
    gramophone.act('lift');
    await advance(ctx, 1);
    const before = plays(element());
    element().currentTime = 99;
    gramophone.act('play');
    await advance(ctx, 0.2);
    // The surface has started: looping buffers (crackle, hiss and the groove) are sounding while the music is not.
    expect(surfaceLoops(ctx)).toHaveLength(3);
    // The element is started with the press, silently; the music itself begins when the lead-in ends.
    expect(plays(element())).toBe(before + 1);
    expect(level(ctx)).toBe(0);
    await advance(ctx, LEAD_IN_MS / 1000);
    expect(plays(element())).toBe(before + 1);
    expect(element().currentTime).toBe(0);
    await advance(ctx, 4);
    expect(level(ctx)).toBeGreaterThan(0.01);
  });

  it('Change the record cycles the shelf: lift, a swap sound, then the next record, from its first groove', async () => {
    const { ctx } = await playing();
    const first = element().src;
    gramophone.act('change');
    await advance(ctx, SWAP_MS / 1000 + LEAD_IN_MS / 1000 + 0.3);
    expect(element().src).not.toBe(first);
    expect(element().src).toMatch(/chopin-waltz-a-minor.*\.webm$/);
    expect(gramophone.getState()).toEqual({ needle: 'playing', record: 1 });
    gramophone.act('change');
    await advance(ctx, SWAP_MS / 1000 + LEAD_IN_MS / 1000 + 0.3);
    expect(element().src).toMatch(/schumann-at-the-fireside.*\.webm$/);
    gramophone.act('change');
    await advance(ctx, SWAP_MS / 1000 + LEAD_IN_MS / 1000 + 0.3);
    expect(element().src).toMatch(/satie-gymnopedie-1.*\.webm$/);
  });

  it('when a record ends the needle runs into the groove for a few seconds, then lifts, and the next record follows after 8 to 15 s', async () => {
    const lines: number[] = [];
    gramophone.onAnnounce((l) => lines.push(l.record));
    const { ctx } = await playing();
    const first = element().src;
    element().emit('ended');
    expect(gramophone.getState().needle).toBe('run-out');
    await advance(ctx, 1);
    // Crackle, hiss and the groove's thump are all sounding.
    expect(surfaceLoops(ctx)).toHaveLength(3);
    await advance(ctx, RUN_OUT_MS / 1000 + 0.1);
    expect(gramophone.getState().needle).toBe('gap');
    // The surface sound is gone with the needle.
    await advance(ctx, 1.5);
    expect(surfaceLoops(ctx)).toHaveLength(0);
    expect(level(ctx)).toBe(0);
    // The pause is 8 to 15 s, then the next record's needle comes down.
    let paused = 1.6;
    while (gramophone.getState().needle === 'gap' && paused < 20) {
      await advance(ctx, 0.1);
      paused += 0.1;
    }
    expect(paused).toBeGreaterThanOrEqual(8);
    expect(paused).toBeLessThanOrEqual(15.2);
    await advance(ctx, LEAD_IN_MS / 1000 + 0.5);
    expect(gramophone.getState()).toEqual({ needle: 'playing', record: 1 });
    expect(element().src).not.toBe(first);
    expect(lines).toEqual([0, 1]);
  });
});

describe('when the browser cannot or will not', () => {
  it('tries the second encoding when the first fails to load, and gives the record up when none will', async () => {
    const { ctx } = unlocked();
    await advance(ctx, LEAD_IN_MS / 1000 + 0.1);
    expect(element().src).toMatch(/\.webm$/);
    element().emit('error');
    await advance(ctx, 0.1);
    expect(element().src).toMatch(/\.m4a$/);
    element().emit('error');
    await advance(ctx, 0.1);
    expect(gramophone.getState().needle).toBe('up');
  });

  it('asks for no file at all from a browser that plays neither encoding', async () => {
    vi.stubGlobal(
      'Audio',
      class extends FakeAudioElement {
        override playable: readonly string[] = [];
      },
    );
    const { ctx } = unlocked();
    await advance(ctx, LEAD_IN_MS / 1000 + 0.2);
    const el = FakeAudioElement.instances.at(-1)!;
    expect(el.src).toBe('');
    expect(gramophone.getState().needle).toBe('up');
  });

  it('waits for the next gesture when the browser refuses to play, then plays and announces the record', async () => {
    const lines: number[] = [];
    gramophone.onAnnounce((l) => lines.push(l.record));
    vi.stubGlobal(
      'Audio',
      class extends FakeAudioElement {
        override outcome: 'ok' | 'blocked' | 'error' = 'blocked';
      },
    );
    const { desk, ctx } = unlocked();
    await advance(ctx, LEAD_IN_MS / 1000 + 0.2);
    const el = FakeAudioElement.instances.at(-1)!;
    expect(el.paused).toBe(true);
    expect(lines).toEqual([]);
    // Not an error: the needle stays down, and nothing is retried on a timer.
    expect(gramophone.getState().needle).toBe('playing');
    const attempts = plays(el);
    await advance(ctx, 5);
    expect(plays(el)).toBe(attempts);
    el.outcome = 'ok';
    desk.unlock();
    await advance(ctx, 0.2);
    expect(el.paused).toBe(false);
    expect(lines).toEqual([0]);
  });

  it('asks again inside the next gesture when the refusal came during the lead-in, so the music is not left waiting for the lead-in\'s end', async () => {
    vi.stubGlobal(
      'Audio',
      class extends FakeAudioElement {
        override outcome: 'ok' | 'blocked' | 'error' = 'blocked';
      },
    );
    const { desk, ctx } = unlocked();
    const el = FakeAudioElement.instances.at(-1)!;
    expect(plays(el)).toBe(1);
    await advance(ctx, 0.5);
    el.outcome = 'ok';
    // The next gesture arrives while the needle is still on the shellac: the element starts then, in it.
    desk.unlock();
    expect(plays(el)).toBe(2);
    expect(gramophone.getState().needle).toBe('lead-in');
    await advance(ctx, LEAD_IN_MS / 1000);
    expect(plays(el)).toBe(2);
    expect(el.paused).toBe(false);
    expect(el.currentTime).toBe(0);
  });

  it('pauses while the page is hidden and carries on when it is shown again', async () => {
    let visible: () => void = () => undefined;
    const page = { visibilityState: 'visible', addEventListener: (_: string, fn: () => void) => (visible = fn), removeEventListener: () => undefined };
    vi.stubGlobal('document', page);
    const { ctx } = await playing();
    expect(element().paused).toBe(false);
    page.visibilityState = 'hidden';
    visible();
    await advance(ctx, 0.2);
    expect(element().paused).toBe(true);
    page.visibilityState = 'visible';
    visible();
    await advance(ctx, 0.2);
    expect(element().paused).toBe(false);
  });
});

describe('disposal', () => {
  it('pauses the element, drops its source, disconnects the graph and stops listening, so nothing is left to play', async () => {
    const { desk, ctx } = await playing();
    const el = element();
    const source = media(ctx);
    const wow = ctx.of(FakeOscillator).find((o) => o.frequency.valueAt(0) === 0.5);
    expect(source.connected).toBe(true);
    desk.dispose();
    expect(el.paused).toBe(true);
    expect(el.src).toBe('');
    expect(el.log).toContain('remove src');
    expect(el.listenerCount()).toBe(0);
    expect(source.connected).toBe(false);
    expect(wow?.stopTime).not.toBeNull();
    expect(surfaceLoops(ctx)).toHaveLength(0);
    // Every voice in flight finishes and lets go of its nodes, as it would once the context closes.
    ctx.flushEnded();
    for (const node of ctx.nodes) expect(node.connected, `${node.kind} still connected`).toBe(false);
    expect(ctx.closeCalls).toBe(1);
  });

  it('leaves the gramophone where it was: a desk built afterwards finds the needle down and plays the record again', async () => {
    const first = await playing();
    first.desk.dispose();
    expect(gramophone.getState().needle).toBe('playing');
    // No engine is listening now: the needle's verbs move the machine and nothing else.
    gramophone.act('lift');
    gramophone.act('play');
    vi.advanceTimersByTime(60_000);
    const before = elements().length;
    const second = unlocked();
    await advance(second.ctx, 0.5);
    expect(elements().length).toBe(before + 1);
    const el = elements().at(-1)!;
    expect(el.paused).toBe(false);
    expect(first.ctx).not.toBe(second.ctx);
  });

  it('is a clean break when the desk is disposed in the middle of the lead-in: no timer is left running', async () => {
    const { desk, ctx } = unlocked();
    await advance(ctx, 0.5);
    desk.dispose();
    gramophone.act('lift');
    vi.runOnlyPendingTimers();
    expect(vi.getTimerCount()).toBe(0);
  });
});
