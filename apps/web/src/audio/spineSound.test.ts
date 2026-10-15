import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChamberId, SpineCue } from '@tqw/engine';
import { SPINE_TIMING } from '../timing.ts';
import { createNoiseBuffers, createPrng } from './noise.ts';
import { AIR, doorFeel } from './spineDoors.ts';
import { CHAMBER_MODULES } from '../chambers/registry.ts';
import { ROOM_FADE_S, SpineSound, type SpineOptions, type SpineTraceEvent } from './spineSound.ts';
import {
  audibleGain,
  connectedByKind,
  FakeAudioContext,
  FakeBiquad,
  FakeBufferSource,
  FakeConvolver,
  FakeGain,
  FakeNode,
  FakeOscillator,
  FakePanner,
  FakeSource,
  installFakeAudio,
} from './spineTestAudio.ts';
import * as voices from './spineVoices.ts';

// --- Harness ---------------------------------------------------------------------------------

interface Rig {
  ctx: FakeAudioContext;
  spine: SpineSound;
  trace: SpineTraceEvent[];
  destination: FakeGain;
}

function build(options: Partial<Pick<SpineOptions, 'corridor' | 'fadeInS'>> = {}): Rig {
  const ctx = new FakeAudioContext();
  const noise = createNoiseBuffers(ctx as unknown as BaseAudioContext);
  const destination = ctx.createGain();
  destination.connect(ctx.destination);
  const trace: SpineTraceEvent[] = [];
  const spine = new SpineSound(ctx as unknown as BaseAudioContext, noise, destination as unknown as AudioNode, {
    corridor: options.corridor ?? true,
    fadeInS: options.fadeInS ?? 3,
    trace: (event) => trace.push(event),
  });
  return { ctx, spine, trace, destination };
}

/** Move the audio clock on, firing the desk's timers as the browser would. */
function advance(ctx: FakeAudioContext, seconds: number, step = 0.05): void {
  const count = Math.round(seconds / step);
  for (let i = 0; i < count; i += 1) {
    ctx.currentTime += step;
    vi.advanceTimersByTime(step * 1000);
  }
}

/** Walk at `speed` for `seconds` and return every node the walk created, the first step included. */
function walkFor(rig: Rig, speed: number, seconds: number): FakeNode[] {
  const nodes = created(rig.ctx, () => rig.spine.setWalk(speed));
  for (let i = 0; i < Math.round(seconds / 0.05); i += 1) nodes.push(...created(rig.ctx, () => advance(rig.ctx, 0.05)));
  return nodes;
}

/** The nodes `act` created. */
function created(ctx: FakeAudioContext, act: () => void): FakeNode[] {
  const mark = ctx.nodes.length;
  act();
  return ctx.nodes.slice(mark);
}

const sources = (nodes: readonly FakeNode[]): FakeSource[] => nodes.filter((n): n is FakeSource => n instanceof FakeSource);
const oscillators = (nodes: readonly FakeNode[]): FakeOscillator[] => nodes.filter((n): n is FakeOscillator => n instanceof FakeOscillator);
const startsAt = (list: readonly FakeSource[], time: number): boolean =>
  list.some((s) => s.startTime !== null && Math.abs(s.startTime - time) < 1e-9);
const near = (actual: number | null | undefined, expected: number, tolerance: number): boolean =>
  actual !== null && actual !== undefined && Math.abs(actual - expected) <= tolerance;
const ms = (value: number): number => value / 1000;
const byTime = (events: readonly SpineTraceEvent[], voice: string): SpineTraceEvent[] => events.filter((e) => e.voice === voice);

/** Every pan a node's output passes through on its way out. */
function pansOf(ctx: FakeAudioContext, list: readonly FakeNode[]): number[] {
  return list.filter((n): n is FakePanner => n instanceof FakePanner).map((p) => p.pan.valueAt(ctx.currentTime));
}

const doorOpen = (id: ChamberId, via: 'door' | 'board' | 'link' = 'door'): SpineCue => ({ type: 'door-open', id, via });
const ALL_CUES: readonly SpineCue[] = [
  doorOpen('certification-office'),
  doorOpen('certification-office', 'board'),
  doorOpen('apartment'),
  doorOpen('tomorrow-engine'),
  doorOpen('great-atrium'),
  { type: 'door-sealed', id: 'tomorrow-engine' },
  { type: 'door-sealed', id: 'great-atrium' },
  { type: 'chamber-leave', id: 'certification-office' },
  { type: 'board-open' },
  { type: 'board-close' },
];

beforeEach(() => {
  installFakeAudio();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// --- Footsteps -------------------------------------------------------------------------------

describe('footsteps', () => {
  it('fall at about 1.6 a second at 1.1 m/s, driven by the timer alone after one setWalk', () => {
    const { ctx, spine, trace } = build();
    spine.setWalk(1.1);
    advance(ctx, 10);
    const steps = byTime(trace, 'footstep');
    expect(steps.length).toBeGreaterThanOrEqual(15);
    expect(steps.length).toBeLessThanOrEqual(17);
    const span = (steps.at(-1)?.at ?? 0) - (steps[0]?.at ?? 0);
    expect((steps.length - 1) / span).toBeGreaterThan(1.55);
    expect((steps.length - 1) / span).toBeLessThan(1.65);
  });

  it('scale with speed: half the pace, half the steps', () => {
    const { ctx, spine, trace } = build();
    spine.setWalk(0.55);
    advance(ctx, 10);
    const steps = byTime(trace, 'footstep');
    expect(steps.length).toBeGreaterThanOrEqual(7);
    expect(steps.length).toBeLessThanOrEqual(9);
  });

  it('are scheduled on the audio clock ahead of time, each a heel then the ball of the foot', () => {
    const rig = build();
    const all = walkFor(rig, 1.1, 5);
    const { trace } = rig;
    const heels = byTime(trace, 'footstep');
    expect(heels.length).toBeGreaterThan(5);
    const list = sources(all);
    for (const heel of heels) {
      // The heel's own sine thud lands on the step time to the sample...
      const thud = oscillators(all).find((o) => o.startTime === heel.at);
      expect(thud, `heel at ${heel.at}`).toBeDefined();
      // ...and the ball of the foot follows 63 to 87 ms behind it.
      const toe = list.filter((s) => s.startTime !== null && s.startTime > heel.at + 0.06 && s.startTime < heel.at + 0.09);
      expect(toe.length, `toe after ${heel.at}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('commit a step at most 200 ms before it lands, so a stop can still catch it', () => {
    const { ctx, spine, trace } = build();
    spine.setWalk(1.1);
    for (let i = 0; i < 200; i += 1) {
      const before = trace.length;
      advance(ctx, 0.05);
      for (const step of trace.slice(before)) {
        expect(step.at).toBeGreaterThan(ctx.currentTime - 1e-9);
        expect(step.at - ctx.currentTime).toBeLessThanOrEqual(0.2 + 0.011);
      }
    }
  });

  it('alternate feet across the stereo field, left first, by about a tenth', () => {
    const rig = build();
    const nodes = walkFor(rig, 1.1, 6);
    const heels = byTime(rig.trace, 'footstep');
    expect(heels.length).toBeGreaterThanOrEqual(8);
    // The panners of a step's shot are all created in the tick that committed it, in step order.
    const pans = pansOf(rig.ctx, nodes);
    const distinct = [...new Set(pans.map((p) => p.toFixed(2)))];
    expect(distinct.sort()).toEqual(['-0.10', '0.10']);
    expect(pans.slice(0, 6).map((p) => Math.sign(p))).toEqual([-1, 1, -1, 1, -1, 1]);
  });

  it('differ a little from step to step, from the seeded generator, and repeat exactly for a new desk', () => {
    const run = (): number[] => {
      const nodes = walkFor(build(), 1.1, 20);
      // The heel's body is the sine that falls from 175 Hz-ish.
      return oscillators(nodes)
        .filter((o) => o.type === 'sine' && o.frequency.valueAt(0) > 160 && o.frequency.valueAt(0) < 190 * 1.07)
        .map((o) => o.frequency.valueAt(0));
    };
    const a = run();
    expect(a.length).toBeGreaterThan(25);
    expect(new Set(a.map((f) => f.toFixed(3))).size).toBeGreaterThan(20);
    // Within +-4 % of the pitch, and the feet's own tilt (0.95 and 1.06).
    for (const f of a) {
      expect(f).toBeGreaterThanOrEqual(175 * 0.95 * 0.96 - 1e-9);
      expect(f).toBeLessThanOrEqual(175 * 1.06 * 1.04 + 1e-9);
    }
    expect(run()).toEqual(a);
  });

  /** Walk until `ready` holds, returning every node the walk created. */
  function walkUntil(rig: Rig, ready: () => boolean): FakeNode[] {
    const nodes = created(rig.ctx, () => rig.spine.setWalk(1.1));
    for (let i = 0; i < 200 && !ready(); i += 1) nodes.push(...created(rig.ctx, () => advance(rig.ctx, 0.05)));
    expect(ready()).toBe(true);
    return nodes;
  }
  const heelAt = (nodes: readonly FakeNode[], at: number): FakeSource => {
    const found = sources(nodes).find((s) => s.startTime === at && s instanceof FakeOscillator);
    if (found === undefined) throw new Error(`no heel at ${at}`);
    return found;
  };

  it('stop cleanly: a step committed but not yet sounding is withdrawn and makes no sound at all', () => {
    const rig = build();
    const { ctx, spine, trace } = rig;
    const pendingStep = (): SpineTraceEvent | undefined => byTime(trace, 'footstep').find((s) => s.at > ctx.currentTime + 0.05);
    // A first step has landed and the second has been committed behind it.
    const all = walkUntil(rig, () => byTime(trace, 'footstep').length >= 2 && pendingStep() !== undefined);
    const pendingAt = pendingStep()?.at ?? 0;
    expect(pendingAt).toBeGreaterThan(ctx.currentTime);
    expect(audibleGain(heelAt(all, pendingAt), pendingAt + 0.01)).toBeGreaterThan(0);

    spine.setWalk(0);
    expect(audibleGain(heelAt(all, pendingAt), pendingAt + 0.01)).toBe(0);

    const count = byTime(trace, 'footstep').length;
    advance(ctx, 5);
    expect(byTime(trace, 'footstep')).toHaveLength(count);
  });

  it('stop cleanly: a step that has begun is left to finish, with no cut and no tail click', () => {
    const rig = build();
    const { ctx, spine, trace } = rig;
    // Stop 30 to 60 ms after a heel has landed: its body is still ringing.
    const recent = (): SpineTraceEvent | undefined =>
      byTime(trace, 'footstep').find((s) => s.at <= ctx.currentTime - 0.03 && s.at > ctx.currentTime - 0.06);
    const all = walkUntil(rig, () => recent() !== undefined);
    const underwayAt = recent()?.at ?? 0;
    const stoppedAt = ctx.currentTime;
    const heel = heelAt(all, underwayAt);
    expect(heel.activeAt(stoppedAt + 0.001)).toBe(true);
    const before = audibleGain(heel, stoppedAt + 0.001);
    expect(before).toBeGreaterThan(0);

    spine.setWalk(0);
    // The gate does not move: the same gain the instant after, and to the end of the step.
    expect(audibleGain(heel, stoppedAt + 0.001)).toBeCloseTo(before, 12);
    expect(audibleGain(heel, stoppedAt + 0.04)).toBeGreaterThan(0);
  });

  it('leave no timer running once they have stopped, and keep a slow one only while the corridor is the room', () => {
    const { ctx, spine } = build({ corridor: true });
    spine.setWalk(1.1);
    advance(ctx, 1);
    expect(vi.getTimerCount()).toBe(1);
    spine.setWalk(0);
    // The idle corridor keeps its two-second watch for far sounds; nothing faster.
    expect(vi.getTimerCount()).toBe(1);
    advance(ctx, 3);
    spine.setCorridor(false);
    advance(ctx, 3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('are silenced by pause, including steps already committed, and come back on resume', () => {
    const { ctx, spine, trace } = build();
    spine.setWalk(1.1);
    advance(ctx, 2);
    spine.pause();
    const count = byTime(trace, 'footstep').length;
    expect(vi.getTimerCount()).toBe(0);
    advance(ctx, 5);
    expect(byTime(trace, 'footstep')).toHaveLength(count);

    spine.resume();
    spine.setWalk(1.1);
    advance(ctx, 3);
    expect(byTime(trace, 'footstep').length).toBeGreaterThan(count + 3);
  });

  it('are not played behind a hidden tab', () => {
    const { ctx, spine, trace } = build();
    vi.stubGlobal('document', { visibilityState: 'hidden' });
    spine.setWalk(1.1);
    advance(ctx, 5);
    expect(byTime(trace, 'footstep')).toEqual([]);
    vi.stubGlobal('document', { visibilityState: 'visible' });
    advance(ctx, 5);
    expect(byTime(trace, 'footstep').length).toBeGreaterThan(3);
  });

  it('ring in the corridor and sit nearly dry in a chamber', () => {
    const rig = build();
    const { ctx, spine } = rig;
    // The room's send is the gain that feeds the convolver; a voice's wet gain is whatever feeds the send.
    const [convolver] = ctx.of(FakeConvolver);
    const [send] = convolver === undefined ? [] : ctx.inputsOf(convolver);
    expect(send).toBeInstanceOf(FakeGain);
    const wetGains = (nodes: readonly FakeNode[]): number[] =>
      nodes
        .filter((n): n is FakeGain => n instanceof FakeGain && send !== undefined && n.outputs.has(send))
        .map((g) => g.gain.valueAt(ctx.currentTime));

    const corridor = walkFor(rig, 1.1, 2);
    spine.setCorridor(false);
    advance(ctx, 2);
    const chamber = created(ctx, () => advance(ctx, 2));
    expect(new Set(wetGains(corridor))).toEqual(new Set([0.5]));
    expect(new Set(wetGains(chamber))).toEqual(new Set([0.08]));
  });
});

// --- Doors -----------------------------------------------------------------------------------

describe('a door opening', () => {
  const D = 3.25;

  function open(id: ChamberId = 'certification-office', via: 'door' | 'board' | 'link' = 'door'): { rig: Rig; nodes: FakeNode[] } {
    const rig = build();
    rig.ctx.currentTime = D;
    const nodes = created(rig.ctx, () => rig.spine.play(doorOpen(id, via)));
    return { rig, nodes };
  }

  it('is scheduled against SPINE_TIMING: handle at the cue, latch after handleTurnMs, swing latchMs later, the chamber air as the camera walks in', () => {
    const { rig } = open();
    const handle = D;
    const latch = D + ms(SPINE_TIMING.handleTurnMs);
    const swing = latch + ms(SPINE_TIMING.latchMs);
    const air = swing + ms(SPINE_TIMING.entryDelayMs);
    const events = rig.trace.filter((e) => e.at >= D);
    expect(events).toEqual([
      { voice: 'handle', at: handle, length: ms(SPINE_TIMING.handleTurnMs) },
      { voice: 'latch', at: latch },
      { voice: 'swing', at: swing, length: ms(SPINE_TIMING.swingMs) },
      { voice: 'chamber-air', at: air, length: ms(SPINE_TIMING.entryMs) },
    ]);
    // The numbers are the lead's: 140, 80, 300, 800 and 1400 ms.
    expect([SPINE_TIMING.handleTurnMs, SPINE_TIMING.latchMs, SPINE_TIMING.entryDelayMs, SPINE_TIMING.swingMs, SPINE_TIMING.entryMs]).toEqual([
      140, 80, 300, 800, 1400,
    ]);
  });

  it('really starts its sources at those instants, and nothing before the cue or after the air arrives', () => {
    const { rig, nodes } = open();
    const list = sources(nodes);
    const latch = D + ms(SPINE_TIMING.handleTurnMs);
    const swing = latch + ms(SPINE_TIMING.latchMs);
    const air = swing + ms(SPINE_TIMING.entryDelayMs);
    expect(startsAt(list, D)).toBe(true);
    expect(startsAt(list, latch)).toBe(true);
    expect(startsAt(list, swing)).toBe(true);
    expect(startsAt(list, air)).toBe(true);
    for (const source of list) {
      expect(source.startTime).toBeGreaterThanOrEqual(D - 1e-9);
      expect(source.startTime).toBeLessThanOrEqual(air + 1e-9);
    }
    expect(rig.trace.every((e) => e.at >= D)).toBe(true);
  });

  it('finishes: every source stops, and the chamber air is released within its bound whatever the chamber does', () => {
    const { nodes } = open();
    const air = D + ms(SPINE_TIMING.handleTurnMs + SPINE_TIMING.latchMs + SPINE_TIMING.entryDelayMs);
    for (const source of sources(nodes)) {
      expect(Number.isFinite(source.endTime)).toBe(true);
      expect(source.endTime).toBeLessThanOrEqual(air + ms(SPINE_TIMING.entryMs) + 1.9 + 0.05);
    }
    // The air swells as the camera walks in, and has let go by 1.8 s after it arrives: a chamber
    // that is slow to load never leaves a bed hanging behind the corridor.
    const bed = sources(nodes).filter((s) => s.startTime === air && s instanceof FakeBufferSource);
    expect(bed.length).toBe(1);
    const [noise] = bed;
    if (noise === undefined) return;
    const arrived = air + ms(SPINE_TIMING.entryMs);
    expect(audibleGain(noise, air + 0.01)).toBeLessThan(audibleGain(noise, arrived) * 0.05);
    expect(audibleGain(noise, arrived)).toBeGreaterThan(0.001);
    expect(audibleGain(noise, arrived + 1.85)).toBeLessThan(audibleGain(noise, arrived) * 0.02);
  });

  it('pushes air at the speed of the swing: nothing as the leaf starts, most in the middle, nothing as it settles', () => {
    const { nodes } = open();
    const latch = D + ms(SPINE_TIMING.handleTurnMs);
    const swing = latch + ms(SPINE_TIMING.latchMs);
    const length = ms(SPINE_TIMING.swingMs);
    // The air of the swing: the noise that starts with it and stops with it.
    const air = sources(nodes).filter((s) => s.startTime === swing && s instanceof FakeBufferSource && s.endTime < swing + length + 0.1);
    expect(air.length).toBeGreaterThanOrEqual(2);
    const level = (u: number): number => air.reduce((sum, s) => sum + audibleGain(s, swing + length * u), 0);
    const middle = Math.max(level(0.4), level(0.45), level(0.5));
    expect(level(0.01)).toBeLessThan(middle * 0.05);
    expect(level(0.99)).toBeLessThan(middle * 0.05);
    expect(middle).toBeGreaterThan(level(0.15));
    expect(middle).toBeGreaterThan(level(0.85));
  });

  it('is a steel latch with a brass lever for the Office, and a different mechanism for every other door', () => {
    const ringsNear = (nodes: readonly FakeNode[], hz: number): number =>
      oscillators(nodes).filter((o) => o.type === 'sine' && near(o.frequency.valueAt(0), hz, hz * 0.05)).length;
    const turnTicks = (nodes: readonly FakeNode[], q: number, hz: number): number =>
      nodes.filter((n): n is FakeBiquad => n instanceof FakeBiquad && n.type === 'bandpass' && n.Q.valueAt(0) === q && near(n.frequency.valueAt(0), hz, hz * 0.05)).length;

    const office = open('certification-office').nodes;
    const tomorrow = open('tomorrow-engine').nodes;
    const apartment = open('apartment').nodes;
    const atrium = open('great-atrium').nodes;

    // A metal leaf rings, briefly and inharmonically; a timber one only knocks.
    expect(ringsNear(office, 2950)).toBe(1);
    expect(ringsNear(office, 6850)).toBe(1);
    expect(ringsNear(tomorrow, 2950)).toBe(1);
    expect(ringsNear(apartment, 2950)).toBe(0);
    expect(ringsNear(atrium, 2950)).toBe(0);

    // The handle: a ring chinks three times, a wheel ratchets four, a lever and a knob rub.
    expect(ringsNear(atrium, 4100)).toBe(3);
    expect(ringsNear(office, 4100)).toBe(0);
    expect(turnTicks(tomorrow, 5, 1800)).toBe(4);
    expect(turnTicks(office, 5, 1800)).toBe(0);
    expect(turnTicks(office, 2.2, 1500)).toBe(1);
    expect(turnTicks(apartment, 1.2, 900)).toBe(1);
  });

  it('keeps the chamber air to the Office hum only: D2 and A2, steady, and nothing for a room with none', () => {
    // A hum holds its pitch: no glide, and it outlasts any knock by a long way.
    const humIn = (nodes: readonly FakeNode[]): number[] =>
      oscillators(nodes)
        .filter((o) => o.type === 'sine' && o.endTime - (o.startTime ?? 0) > 1 && o.frequency.targets().every((t) => t.kind === 'set'))
        .map((o) => o.frequency.valueAt(0))
        .sort((a, b) => a - b);
    expect(humIn(open('certification-office').nodes)).toEqual([73.42, 110]);
    expect(humIn(open('great-atrium').nodes)).toEqual([]);
    expect(AIR['certification-office'].hum.length).toBe(2);
  });

  it('is dead ahead and near when the visitor is at the door, and down the corridor on its own side when it comes from the board', () => {
    const lowpasses = (nodes: readonly FakeNode[]): number =>
      nodes.filter((n): n is FakeBiquad => n instanceof FakeBiquad && n.type === 'lowpass' && n.frequency.valueAt(0) === 1400).length;

    const atDoor = open('certification-office', 'door');
    expect(new Set(pansOf(atDoor.rig.ctx, atDoor.nodes))).toEqual(new Set([0]));
    expect(lowpasses(atDoor.nodes)).toBe(0);

    // The Office is on the right of the corridor; the Apartment on the left.
    for (const via of ['board', 'link'] as const) {
      const far = open('certification-office', via);
      expect(new Set(pansOf(far.rig.ctx, far.nodes))).toEqual(new Set([0.7]));
      expect(lowpasses(far.nodes)).toBeGreaterThan(3);
      const left = open('apartment', via);
      expect(new Set(pansOf(left.rig.ctx, left.nodes))).toEqual(new Set([-0.7]));
    }
  });

  it('is also scheduled for a future door of any family, using that door\'s own mechanism', () => {
    for (const id of ['certification-office', 'apartment', 'tomorrow-engine', 'great-atrium'] as const) {
      const { rig } = open(id);
      expect(rig.trace.map((e) => e.voice)).toEqual(['handle', 'latch', 'swing', 'chamber-air']);
      const feel = doorFeel(CHAMBER_MODULES[id].door);
      expect(feel.handle).toBe(CHAMBER_MODULES[id].door.handle);
    }
  });
});

describe('a sealed door', () => {
  const D = 7;

  function rattle(id: ChamberId): { rig: Rig; nodes: FakeNode[] } {
    const rig = build();
    rig.ctx.currentTime = D;
    const nodes = created(rig.ctx, () => rig.spine.play({ type: 'door-sealed', id }));
    return { rig, nodes };
  }

  it('rattles over rattleMs, shaped by what holds it: a bolt, a seal, a chain', () => {
    const length = ms(SPINE_TIMING.rattleMs);
    expect(SPINE_TIMING.rattleMs).toBe(420);
    for (const [id, closure] of [['tomorrow-engine', 'seal'], ['great-atrium', 'chain']] as const) {
      const { rig } = rattle(id);
      expect(rig.trace).toEqual([{ voice: `rattle-${closure}`, at: D, length }]);
    }
  });

  it('starts at the cue, never begins a sound after the rattle is over, and rings on no longer than a tenth of a second', () => {
    const length = ms(SPINE_TIMING.rattleMs);
    for (const id of ['tomorrow-engine', 'great-atrium'] as const) {
      const { nodes } = rattle(id);
      const list = sources(nodes);
      expect(startsAt(list, D), id).toBe(true);
      for (const source of list) {
        expect(source.startTime, id).toBeGreaterThanOrEqual(D - 1e-9);
        expect(source.startTime, id).toBeLessThanOrEqual(D + length);
        expect(source.endTime, id).toBeLessThanOrEqual(D + length + 0.4);
      }
      // The last thing to start is late in the rattle, not a single knock.
      const last = Math.max(...list.map((s) => s.startTime ?? 0));
      expect(last, id).toBeGreaterThan(D + length * 0.45);
    }
  });

  it('sounds like its closure: a chain scatters a score of links, a seal stops dead and rings short, a bolt knocks the frame', () => {
    const links = (nodes: readonly FakeNode[]): number =>
      nodes.filter((n): n is FakeBiquad => n instanceof FakeBiquad && n.type === 'bandpass' && n.Q.valueAt(0) === 6).length;
    const bodyRings = (nodes: readonly FakeNode[], base: number): number =>
      oscillators(nodes).filter((o) => o.type === 'sine' && [2.2, 6.1, 11.4].some((r) => near(o.frequency.valueAt(0), base * r, base * r * 0.05))).length;

    const seal = rattle('tomorrow-engine').nodes;
    const chain = rattle('great-atrium').nodes;
    const boltRig = build();
    const boltEnv: voices.SpineEnv = {
      ctx: boltRig.ctx as unknown as BaseAudioContext,
      noise: createNoiseBuffers(boltRig.ctx as unknown as BaseAudioContext),
      rand: createPrng(11),
      out: boltRig.ctx.createGain() as unknown as AudioNode,
      send: null,
      begin: () => () => undefined,
    };
    const bolt = created(boltRig.ctx, () =>
      voices.sealedRattle(boltEnv, 5, doorFeel(CHAMBER_MODULES.apartment.door), 'bolt', ms(SPINE_TIMING.rattleMs), { pan: 0, dry: 1, wet: 0 }),
    );
    expect(links(chain)).toBeGreaterThanOrEqual(18);
    expect(links(bolt)).toBe(0);
    expect(links(seal)).toBe(0);
    const sealFeel = doorFeel(CHAMBER_MODULES['tomorrow-engine'].door);
    expect(bodyRings(seal, sealFeel.bodyHz)).toBe(3);
    expect(bodyRings(bolt, doorFeel(CHAMBER_MODULES.apartment.door).bodyHz)).toBe(0);
    expect(sources(chain).length).toBeGreaterThan(sources(bolt).length + 12);
  });

  it('says no flatly: the same cue twice is not the same rattle, and a padlock is voiced too', () => {
    const rig = build();
    const first = created(rig.ctx, () => rig.spine.play({ type: 'door-sealed', id: 'great-atrium' }));
    const second = created(rig.ctx, () => rig.spine.play({ type: 'door-sealed', id: 'great-atrium' }));
    const times = (nodes: readonly FakeNode[]): string[] => sources(nodes).map((s) => (s.startTime ?? 0).toFixed(5));
    expect(times(second)).not.toEqual(times(first));

    const env: voices.SpineEnv = {
      ctx: rig.ctx as unknown as BaseAudioContext,
      noise: createNoiseBuffers(rig.ctx as unknown as BaseAudioContext),
      rand: createPrng(3),
      out: rig.ctx.createGain() as unknown as AudioNode,
      send: null,
      begin: () => () => undefined,
    };
    const padlock = created(rig.ctx, () =>
      voices.sealedRattle(env, 5, doorFeel(CHAMBER_MODULES.apartment.door), 'padlock', ms(SPINE_TIMING.rattleMs), { pan: 0, dry: 1, wet: 0 }),
    );
    const tinks = padlock.filter((n): n is FakeBiquad => n instanceof FakeBiquad && n.type === 'bandpass' && n.Q.valueAt(0) === 7);
    expect(tinks.length).toBe(7);
    for (const tink of tinks) expect(tink.frequency.valueAt(0)).toBeGreaterThan(3000);
  });
});

describe('a door closing behind the visitor', () => {
  const D = 11;

  it('closes over closeMs: air and hinge at the speed of the swing, then the latch dropping in at the very end', () => {
    const rig = build();
    rig.ctx.currentTime = D;
    const nodes = created(rig.ctx, () => rig.spine.play({ type: 'chamber-leave', id: 'certification-office' }));
    const length = ms(SPINE_TIMING.closeMs);
    expect(SPINE_TIMING.closeMs).toBe(600);
    expect(rig.trace).toEqual([{ voice: 'door-close', at: D, length }]);

    const list = sources(nodes);
    expect(startsAt(list, D)).toBe(true);
    // The latch tongue and the dull knock come in the last 30 ms, and nothing starts after the door has shut.
    const late = list.filter((s) => (s.startTime ?? 0) > D + length * 0.5);
    expect(late.length).toBeGreaterThanOrEqual(3);
    for (const source of late) {
      expect(source.startTime).toBeGreaterThanOrEqual(D + length - 0.03);
      expect(source.startTime).toBeLessThanOrEqual(D + length);
    }
    for (const source of list) expect(source.startTime).toBeLessThanOrEqual(D + length);
  });

  it('is gentler than the latch of the door opening: a hand that is not in a hurry', () => {
    // The loudest click any envelope in the cue is driven to inside `[from, to]`.
    const click = (nodes: readonly FakeNode[], from: number, to: number): number => {
      let loudest = 0;
      for (const gain of nodes.filter((n): n is FakeGain => n instanceof FakeGain)) {
        for (const target of gain.gain.targets()) {
          if (target.kind === 'linear' && target.time >= from && target.time <= to) loudest = Math.max(loudest, target.value);
        }
      }
      return loudest;
    };
    const rig = build();
    rig.ctx.currentTime = 1;
    const opening = created(rig.ctx, () => rig.spine.play(doorOpen('certification-office')));
    rig.ctx.currentTime = 5;
    const closing = created(rig.ctx, () => rig.spine.play({ type: 'chamber-leave', id: 'certification-office' }));
    const latch = 1 + ms(SPINE_TIMING.handleTurnMs);
    const shut = 5 + ms(SPINE_TIMING.closeMs);
    const opens = click(opening, latch - 0.01, latch + 0.01);
    const closes = click(closing, shut - 0.03, shut);
    expect(closes).toBeGreaterThan(0);
    expect(opens).toBeGreaterThan(0);
    expect(closes).toBeLessThan(opens * 0.7);
  });
});

describe('the notice board', () => {
  it('stirs paper and a pin or two when it opens, and settles a little more briefly when it closes', () => {
    const rig = build();
    rig.ctx.currentTime = 2;
    const opening = created(rig.ctx, () => rig.spine.play({ type: 'board-open' }));
    rig.ctx.currentTime = 6;
    const closing = created(rig.ctx, () => rig.spine.play({ type: 'board-close' }));
    expect(rig.trace).toEqual([
      { voice: 'board-open', at: 2 },
      { voice: 'board-close', at: 6 },
    ]);
    const end = (list: readonly FakeSource[], from: number): number => Math.max(...list.map((s) => s.endTime)) - from;
    expect(end(sources(opening), 2)).toBeGreaterThan(0.4);
    expect(end(sources(opening), 2)).toBeLessThan(0.7);
    expect(end(sources(closing), 6)).toBeLessThan(end(sources(opening), 2));
    expect(sources(closing).length).toBeLessThan(sources(opening).length);
    // Paper is noise, a pin a tiny brass tick: the only tones are those ticks, a few hundredths of a second long.
    for (const osc of oscillators([...opening, ...closing])) expect(osc.endTime - (osc.startTime ?? 0)).toBeLessThan(0.1);
  });
});

describe('silence where there is nothing to hear', () => {
  it('makes no sound for a door in focus or a chamber entered: the room crossfade announces the chamber', () => {
    const { ctx, spine, trace } = build();
    const nodes = created(ctx, () => {
      spine.play({ type: 'door-focus', id: 'certification-office' });
      spine.play({ type: 'chamber-enter', id: 'certification-office' });
    });
    expect(nodes).toEqual([]);
    expect(trace).toEqual([]);
  });
});

describe('nothing that applauds', () => {
  /** A voice that holds a note: a tone above 40 Hz that lasts, or climbs. The Office hum is the one exception, and does neither. */
  function offences(nodes: readonly FakeNode[]): string[] {
    const found: string[] = [];
    for (const osc of oscillators(nodes)) {
      const hz = osc.frequency.valueAt(0);
      if (hz < 40) continue;
      const life = osc.endTime - (osc.startTime ?? 0);
      const targets = osc.frequency.targets().map((t) => t.value);
      const isOfficeHum = (near(hz, 73.42, 0.01) || near(hz, 110, 0.01)) && targets.length <= 1;
      if (osc.type !== 'sine') found.push(`${osc.type} at ${hz} Hz`);
      if (targets.some((t) => t > hz * 1.001)) found.push(`a tone rising from ${hz} Hz`);
      if (life > 0.5 && !isOfficeHum) found.push(`a ${life.toFixed(2)} s tone at ${hz} Hz`);
    }
    return found;
  }

  it('has no fanfare, chime or pitched flourish on any corridor cue: every tone is a short sine that only falls', () => {
    for (const cue of ALL_CUES) {
      const rig = build();
      rig.ctx.currentTime = 1;
      const nodes = created(rig.ctx, () => rig.spine.play(cue));
      expect(nodes.length, JSON.stringify(cue)).toBeGreaterThan(0);
      expect(offences(nodes), JSON.stringify(cue)).toEqual([]);
    }
  });

  it('has none among the footsteps or the far sounds of a long walk and a long night either', () => {
    const rig = build();
    const nodes = walkFor(rig, 1.1, 120);
    rig.spine.setWalk(0);
    // Then the night: forty minutes of the corridor with nobody walking.
    for (let i = 0; i < 1200; i += 1) nodes.push(...created(rig.ctx, () => advance(rig.ctx, 2, 1)));
    expect(rig.trace.filter((e) => e.voice.startsWith('far-')).length).toBeGreaterThan(40);
    expect(rig.trace.filter((e) => e.voice === 'footstep').length).toBeGreaterThan(150);
    expect(offences(nodes)).toEqual([]);
  });

  it('never uses a sawtooth, square or triangle for anything audible: the only saw is the hinge\'s sub-audio chop', () => {
    for (const cue of ALL_CUES) {
      const rig = build();
      const nodes = created(rig.ctx, () => rig.spine.play(cue));
      for (const osc of oscillators(nodes)) {
        if (osc.type !== 'sine') {
          expect(osc.type).toBe('sawtooth');
          expect(osc.frequency.valueAt(0)).toBeLessThan(40);
          expect(osc.frequency.targets().every((t) => t.value < 40)).toBe(true);
        }
      }
    }
  });
});

// --- The room --------------------------------------------------------------------------------

describe('far sounds', () => {
  it('begin after a quiet while, hold to the horizon of twelve seconds, and are all placed far away and dark', () => {
    const { ctx, spine, trace } = build();
    const nodes: FakeNode[] = [];
    for (let i = 0; i < 60 * 15; i += 1) {
      const before = trace.length;
      nodes.push(...created(ctx, () => advance(ctx, 1)));
      for (const event of trace.slice(before)) {
        expect(event.at).toBeGreaterThanOrEqual(ctx.currentTime - 1.001);
        // A group of radiator ticks starts inside the horizon and runs on for a few seconds beyond it.
        expect(event.at).toBeLessThanOrEqual(ctx.currentTime + 12 + 6);
      }
    }
    const far = trace.filter((e) => e.voice.startsWith('far-'));
    expect(far.length).toBeGreaterThan(20);
    expect(far.length).toBeLessThan(200);
    expect(Math.min(...far.map((e) => e.at))).toBeGreaterThanOrEqual(12);
    // Every far sound runs through a lowpass at 1100 Hz and mostly into the room.
    const lowpass = nodes.filter((n): n is FakeBiquad => n instanceof FakeBiquad && n.type === 'lowpass' && n.frequency.valueAt(0) === 1100);
    expect(lowpass.length).toBe(far.length);
    void spine;
  });

  it('are heard only in the corridor: through the gate, so a sound scheduled before leaving is silent after it', () => {
    const { ctx, spine, trace } = build();
    const nodes: FakeNode[] = [];
    // Run until a far sound has been scheduled but has not yet sounded.
    for (let i = 0; i < 400; i += 1) nodes.push(...created(ctx, () => advance(ctx, 1)));
    const pending = trace.filter((e) => e.voice.startsWith('far-')).find((e) => e.at > ctx.currentTime + 1);
    // The 12 s horizon makes this likely, but not certain; walk on until it holds.
    let guard = 0;
    let event = pending;
    while (event === undefined && guard < 2000) {
      nodes.push(...created(ctx, () => advance(ctx, 1)));
      event = trace.filter((e) => e.voice.startsWith('far-')).find((e) => e.at > ctx.currentTime + 1);
      guard += 1;
    }
    expect(event).toBeDefined();
    const at = event?.at ?? 0;
    const audible = sources(nodes).filter((s) => s.startTime !== null && Math.abs(s.startTime - at) < 0.03 && s instanceof FakeSource);
    expect(audible.length).toBeGreaterThan(0);
    // In the corridor at the moment it sounds, it is heard...
    expect(Math.max(...audible.map((s) => audibleGain(s, at + 0.01)))).toBeGreaterThan(0);
    // ...and with the visitor in a chamber it is not.
    spine.setCorridor(false);
    ctx.currentTime += ROOM_FADE_S + 0.1;
    const later = Math.max(at + 0.01, ctx.currentTime + 0.01);
    expect(Math.max(...audible.map((s) => audibleGain(s, later)))).toBeLessThan(1e-9);
  });

  it('are not scheduled at all while the visitor is in a chamber, and cost no timer', () => {
    const { ctx, spine, trace } = build({ corridor: false });
    advance(ctx, 600);
    expect(trace).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);

    // Not even while walking there: the 50 ms timer that serves the feet must not serve the corridor's night.
    spine.setWalk(1.1);
    advance(ctx, 600);
    expect(trace.filter((e) => e.voice === 'footstep').length).toBeGreaterThan(500);
    expect(trace.filter((e) => e.voice.startsWith('far-'))).toEqual([]);
    spine.setWalk(0);
    advance(ctx, 1);
    spine.setCorridor(true);
    advance(ctx, 120);
    expect(trace.filter((e) => e.voice.startsWith('far-')).length).toBeGreaterThan(0);
  });
});

describe('the room tone', () => {
  it('fades in over the time it is given, on an equal-power curve that reaches full and stops', () => {
    const { ctx, destination } = build({ corridor: true, fadeInS: 3 });
    void destination;
    const gates = ctx.of(FakeGain).filter((g) => g.gain.targets().some((t) => t.kind === 'linear' && t.time === 3 && t.value === 1));
    expect(gates.length).toBe(2);
    for (const gate of gates) {
      expect(gate.gain.valueAt(0)).toBe(0);
      expect(gate.gain.valueAt(3)).toBeCloseTo(1, 9);
      expect(gate.gain.valueAt(1.5)).toBeCloseTo(Math.SQRT1_2, 1);
      expect(gate.gain.valueAt(10)).toBeCloseTo(1, 9);
    }
  });

  it('is built only the first time the corridor is the room, and not rebuilt on the way back', () => {
    const { ctx, spine } = build({ corridor: false });
    const endless = (): number => ctx.sources().filter((s) => s.stopTime === null).length;
    expect(endless()).toBe(0);
    spine.setCorridor(true);
    const built = endless();
    expect(built).toBeGreaterThanOrEqual(7);
    spine.setCorridor(false);
    spine.setCorridor(true);
    expect(endless()).toBe(built);
  });

  it('crossfades over about 1.2 s, equal-power, both ways, and picks up from wherever an interrupted fade had got to', () => {
    expect(ROOM_FADE_S).toBeCloseTo(1.2, 9);
    const { ctx, spine } = build({ corridor: true, fadeInS: 0.5 });
    const gate = ctx.of(FakeGain).find((g) => g.gain.targets().some((t) => t.kind === 'linear' && t.time === 0.5 && t.value === 1));
    expect(gate).toBeDefined();
    if (gate === undefined) return;

    ctx.currentTime = 10;
    spine.setCorridor(false);
    expect(gate.gain.valueAt(10)).toBeCloseTo(1, 9);
    expect(gate.gain.valueAt(10 + ROOM_FADE_S / 2)).toBeCloseTo(Math.SQRT1_2, 1);
    expect(gate.gain.valueAt(10 + ROOM_FADE_S)).toBeCloseTo(0, 9);
    expect(gate.gain.valueAt(20)).toBeCloseTo(0, 9);

    // Back again, then reverse halfway through the way in: no jump.
    ctx.currentTime = 20;
    spine.setCorridor(true);
    ctx.currentTime = 20.6;
    const mid = gate.gain.valueAt(20.6);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.95);
    spine.setCorridor(false);
    expect(gate.gain.valueAt(20.6)).toBeCloseTo(mid, 6);
    // From there it only falls, to nothing: a fade that jumped to its start would climb first.
    let previous = mid;
    for (let t = 20.65; t <= 20.6 + ROOM_FADE_S; t += 0.05) {
      const level = gate.gain.valueAt(t);
      expect(level, `at ${t.toFixed(2)} s`).toBeLessThanOrEqual(previous + 1e-12);
      previous = level;
    }
    expect(gate.gain.valueAt(20.6 + ROOM_FADE_S)).toBeCloseTo(0, 9);
  });

  it('has no hum in it: the only oscillators run below hearing\'s pitch range, and the air is noise', () => {
    const { ctx } = build();
    const oscs = ctx.of(FakeOscillator);
    expect(oscs.length).toBe(2);
    for (const osc of oscs) expect(osc.frequency.valueAt(0)).toBeLessThan(0.1);
    expect(ctx.of(FakeBufferSource).length).toBeGreaterThanOrEqual(5);
  });
});

// --- Safety ----------------------------------------------------------------------------------

describe('cleanup', () => {
  it('leaves no connected one-shot after hundreds of steps, cues and far sounds once their sources have ended', () => {
    const { ctx, spine } = build();
    const baseline = new Set(ctx.nodes);
    spine.setWalk(1.1);
    for (let i = 0; i < 20 * 120; i += 1) {
      advance(ctx, 0.05);
      if (i % 200 === 0) for (const cue of ALL_CUES) spine.play(cue);
      if (i % 500 === 499) ctx.flushEnded();
    }
    spine.setWalk(0);
    ctx.flushEnded();
    const oneShots = ctx.nodes.filter((n) => !baseline.has(n));
    expect(oneShots.length).toBeGreaterThan(2000);
    expect(connectedByKind(oneShots)).toEqual({});
    // Every one-shot source has a stop time, so `ended` is certain to come.
    expect(ctx.sources().filter((s) => !baseline.has(s) && !Number.isFinite(s.endTime))).toEqual([]);
  });

  it('closes everything on dispose: timer cleared, tone stopped, nodes disconnected, and every later call does nothing', () => {
    const { ctx, spine } = build();
    // Everything the corridor built for itself before it made a sound: the room, its gates and its tone.
    const persistent = ctx.nodes.slice(2);
    expect(persistent.filter((n) => n.connected).length).toBeGreaterThan(20);
    spine.setWalk(1.1);
    advance(ctx, 2);
    spine.play(doorOpen('certification-office'));
    expect(vi.getTimerCount()).toBe(1);

    spine.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(ctx.sources().filter((s) => s.stopTime === null)).toEqual([]);
    expect(persistent.filter((n) => n.connected)).toEqual([]);

    const count = ctx.nodes.length;
    spine.play(doorOpen('certification-office'));
    spine.setWalk(1.1);
    spine.setCorridor(false);
    spine.setCorridor(true);
    spine.pause();
    spine.resume();
    spine.tick();
    advance(ctx, 5);
    spine.dispose();
    expect(ctx.nodes).toHaveLength(count);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is a corridor without a reverb on a platform that cannot build one, and without a panner on one that cannot pan', () => {
    for (const missing of ['createConvolver', 'createStereoPanner'] as const) {
      const ctx = new FakeAudioContext();
      const noise = createNoiseBuffers(ctx as unknown as BaseAudioContext);
      (ctx as unknown as Record<string, unknown>)[missing] = () => {
        throw new Error('NotSupportedError');
      };
      if (missing === 'createStereoPanner') (ctx as unknown as Record<string, unknown>)[missing] = undefined;
      const spine = new SpineSound(ctx as unknown as BaseAudioContext, noise, ctx.createGain() as unknown as AudioNode, {
        corridor: true,
        fadeInS: 1,
      });
      expect(() => spine.play(doorOpen('certification-office'))).not.toThrow();
      expect(() => spine.play({ type: 'door-sealed', id: 'great-atrium' })).not.toThrow();
      spine.setWalk(1.1);
      advance(ctx, 3);
      expect(ctx.nodes.length).toBeGreaterThan(50);
      if (missing === 'createConvolver') expect(ctx.nodes.some((n) => n.kind === 'convolver')).toBe(false);
      if (missing === 'createStereoPanner') expect(ctx.nodes.some((n) => n.kind === 'panner')).toBe(false);
      spine.dispose();
    }
  });

  it('leaves nothing connected if it cannot be built at all, and says so', () => {
    const ctx = new FakeAudioContext();
    const noise = createNoiseBuffers(ctx as unknown as BaseAudioContext);
    ctx.createBufferSource = (() => {
      throw new Error('InvalidStateError');
    }) as unknown as typeof ctx.createBufferSource;
    expect(
      () => new SpineSound(ctx as unknown as BaseAudioContext, noise, ctx.createGain() as unknown as AudioNode, { corridor: true, fadeInS: 1 }),
    ).toThrow('InvalidStateError');
    expect(connectedByKind(ctx.nodes.filter((n) => n.kind !== 'destination'))).toEqual({});
    expect(vi.getTimerCount()).toBe(0);
  });
});
