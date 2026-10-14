import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OVERLOAD_AT, replyFor, type Cue } from '@tqw/engine';
import { TIMING } from '../timing.ts';
import { createSoundDesk } from './soundDesk.ts';
import { LEVEL, serviceBell, strikeVariation } from './voices.ts';
import { createNoiseBuffers } from './noise.ts';

// --- A minimal fake Web Audio graph --------------------------------------------------------
// Records connections, scheduling and parameter automation so tests can assert on what the desk
// scheduled, when, and whether it cleaned up. Nothing here renders audio.

interface ParamEvent {
  readonly kind: 'set' | 'linear' | 'exp' | 'cancel';
  readonly value: number;
  readonly time: number;
}

class FakeParam {
  readonly events: ParamEvent[] = [];
  constructor(public value: number) {}
  setValueAtTime(value: number, time: number): this {
    this.events.push({ kind: 'set', value, time });
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number, time: number): this {
    this.events.push({ kind: 'linear', value, time });
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number): this {
    this.events.push({ kind: 'exp', value, time });
    return this;
  }
  cancelScheduledValues(time: number): this {
    this.events.push({ kind: 'cancel', value: Number.NaN, time });
    return this;
  }
  /** Value of the first scheduled `set`, or the initial value. */
  get initial(): number {
    return this.events.find((e) => e.kind === 'set')?.value ?? this.value;
  }
}

class FakeNode {
  readonly outputs = new Set<FakeNode | FakeParam>();
  constructor(
    readonly ctx: FakeAudioContext,
    readonly kind: string,
  ) {
    ctx.nodes.push(this);
  }
  connect<T extends FakeNode | FakeParam>(destination: T): T {
    this.outputs.add(destination);
    return destination;
  }
  disconnect(destination?: FakeNode | FakeParam): void {
    if (destination === undefined) this.outputs.clear();
    else this.outputs.delete(destination);
  }
  get connected(): boolean {
    return this.outputs.size > 0;
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'gain');
  }
}

class FakeBiquad extends FakeNode {
  type = 'lowpass';
  readonly frequency = new FakeParam(350);
  readonly Q = new FakeParam(1);
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'biquad');
  }
}

class FakeCompressor extends FakeNode {
  readonly threshold = new FakeParam(-24);
  readonly knee = new FakeParam(30);
  readonly ratio = new FakeParam(12);
  readonly attack = new FakeParam(0.003);
  readonly release = new FakeParam(0.25);
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'compressor');
  }
}

class FakeSource extends FakeNode {
  startTime: number | null = null;
  stopTime: number | null = null;
  ended = false;
  private readonly listeners: { listener: () => void; once: boolean }[] = [];
  addEventListener(type: string, listener: () => void, options?: { once?: boolean }): void {
    if (type === 'ended') this.listeners.push({ listener, once: options?.once === true });
  }
  start(when = 0): void {
    this.startTime = when;
  }
  stop(when = this.ctx.currentTime): void {
    this.stopTime = when;
  }
  /** When this source stops sounding on its own; Infinity if nothing will ever stop it. */
  get endTime(): number {
    return this.stopTime ?? Number.POSITIVE_INFINITY;
  }
  /** Dispatch one `ended` event. Browsers have been seen to dispatch it twice for one source. */
  dispatchEnded(): void {
    this.ended = true;
    for (const entry of [...this.listeners]) {
      if (entry.once) this.listeners.splice(this.listeners.indexOf(entry), 1);
      entry.listener();
    }
  }
  fireEnded(): void {
    if (!this.ended) this.dispatchEnded();
  }
}

class FakeOscillator extends FakeSource {
  type = 'sine';
  readonly frequency = new FakeParam(440);
  readonly detune = new FakeParam(0);
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'osc');
  }
}

class FakeBufferSource extends FakeSource {
  buffer: FakeBuffer | null = null;
  loop = false;
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'bufsrc');
  }
}

interface FakeBuffer {
  readonly length: number;
  readonly sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static initialState = 'running';

  currentTime = 0;
  readonly sampleRate = 48_000;
  state: string;
  readonly nodes: FakeNode[] = [];
  readonly buffers: FakeBuffer[] = [];
  readonly destination: FakeNode;
  resumeCalls = 0;
  suspendCalls = 0;
  closeCalls = 0;
  resumeImpl: () => Promise<void> = () => Promise.resolve();

  constructor(readonly options?: unknown) {
    this.state = FakeAudioContext.initialState;
    this.destination = new FakeNode(this, 'destination');
    FakeAudioContext.instances.push(this);
  }

  createGain = (): FakeGain => new FakeGain(this);
  createBiquadFilter = (): FakeBiquad => new FakeBiquad(this);
  createOscillator = (): FakeOscillator => new FakeOscillator(this);
  createBufferSource = (): FakeBufferSource => new FakeBufferSource(this);
  createDynamicsCompressor = (): FakeCompressor => new FakeCompressor(this);
  createBuffer(_channels: number, length: number, sampleRate: number): FakeBuffer {
    const data = new Float32Array(length);
    const buffer: FakeBuffer = { length, sampleRate, getChannelData: () => data };
    this.buffers.push(buffer);
    return buffer;
  }

  resume(): Promise<void> {
    this.resumeCalls += 1;
    return this.resumeImpl();
  }
  suspend(): Promise<void> {
    this.suspendCalls += 1;
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.closeCalls += 1;
    this.state = 'closed';
    return Promise.resolve();
  }

  // Queries used by the tests.
  of<T extends FakeNode>(ctor: new (ctx: FakeAudioContext) => T, since = 0): T[] {
    return this.nodes.slice(since).filter((n): n is T => n instanceof ctor);
  }
  sources(since = 0): FakeSource[] {
    return this.nodes.slice(since).filter((n): n is FakeSource => n instanceof FakeSource);
  }
  inputsOf(node: FakeNode | FakeParam): FakeNode[] {
    return this.nodes.filter((n) => n.outputs.has(node));
  }
  /** Every source upstream of `node`, through any number of intermediate nodes. */
  upstreamSources(node: FakeNode, seen = new Set<FakeNode>()): FakeSource[] {
    if (seen.has(node)) return [];
    seen.add(node);
    const found: FakeSource[] = node instanceof FakeSource ? [node] : [];
    for (const input of this.inputsOf(node)) found.push(...this.upstreamSources(input, seen));
    return found;
  }
  /** Fire `ended` on every source that has a finite stop time, as a real context would. */
  flushEnded(): void {
    for (const source of this.sources()) {
      if (source.startTime !== null && Number.isFinite(source.endTime)) source.fireEnded();
    }
  }
}

// --- Test helpers ----------------------------------------------------------------------------

const near = (actual: number | undefined, expected: number, tolerance: number): boolean =>
  actual !== undefined && Math.abs(actual - expected) <= tolerance;

const ms = (value: number): number => value / 1000;
const DESCEND = ms(180);
const DWELL_END = ms(180 + TIMING.minDwellMs);
const REPLY_DELAY = ms(TIMING.replyDelayMs);
const PRINT = ms(TIMING.printMs);
const OVERLOAD = ms(TIMING.overloadMs);

const contact: Cue = { type: 'contact' };
const lift: Cue = { type: 'lift' };
const reply = (step: number): Cue => ({ type: 'reply', step, line: replyFor(step) });

function installFakeAudio(): void {
  FakeAudioContext.instances = [];
  FakeAudioContext.initialState = 'running';
  vi.stubGlobal('AudioContext', FakeAudioContext);
}

function context(): FakeAudioContext {
  const ctx = FakeAudioContext.instances.at(-1);
  if (ctx === undefined) throw new Error('the desk never constructed an AudioContext');
  return ctx;
}

/** An unlocked desk and its context. */
function unlockedDesk(): { desk: ReturnType<typeof createSoundDesk>; ctx: FakeAudioContext } {
  const desk = createSoundDesk();
  desk.unlock();
  return { desk, ctx: context() };
}

/** Deliver `cue` at audio time `time`; returns the nodes it created. */
function deliver(
  desk: ReturnType<typeof createSoundDesk>,
  ctx: FakeAudioContext,
  time: number,
  cue: Cue,
): FakeNode[] {
  ctx.currentTime = time;
  const mark = ctx.nodes.length;
  desk.play(cue);
  return ctx.nodes.slice(mark);
}

const sourcesIn = (nodes: readonly FakeNode[]): FakeSource[] =>
  nodes.filter((n): n is FakeSource => n instanceof FakeSource);
const oscillatorsIn = (nodes: readonly FakeNode[]): FakeOscillator[] =>
  nodes.filter((n): n is FakeOscillator => n instanceof FakeOscillator);
const earliest = (sources: readonly FakeSource[]): number =>
  Math.min(...sources.map((s) => s.startTime ?? Number.POSITIVE_INFINITY));

/** Sources feeding a biquad of `type` whose initial frequency is within `tolerance` of `hz`. */
function noiseThrough(
  ctx: FakeAudioContext,
  nodes: readonly FakeNode[],
  type: string,
  hz: number,
  tolerance: number,
): FakeSource[] {
  return nodes
    .filter((n): n is FakeBiquad => n instanceof FakeBiquad && n.type === type)
    .filter((f) => near(f.frequency.initial, hz, tolerance))
    .flatMap((f) => ctx.upstreamSources(f))
    .filter((s) => s instanceof FakeBufferSource);
}

/** The sine that falls from ~150 Hz to ~48 Hz: the weight of the strike. */
function thumpIn(nodes: readonly FakeNode[]): FakeOscillator | undefined {
  return oscillatorsIn(nodes).find(
    (o) =>
      o.type === 'sine' &&
      near(o.frequency.initial, 150, 150 * 0.031) &&
      o.frequency.events.some((e) => e.kind === 'exp' && near(e.value, 48, 48 * 0.031)),
  );
}

/** The master gain: the node that feeds the limiter. */
function masterOf(ctx: FakeAudioContext): FakeGain {
  const [limiter] = ctx.of(FakeCompressor);
  if (limiter === undefined) throw new Error('no limiter');
  const [master] = ctx.inputsOf(limiter);
  if (!(master instanceof FakeGain)) throw new Error('no master gain');
  return master;
}

const DUCK = 10 ** (-18 / 20);
const ROOM = 10 ** (-3 / 20);

/** The ambience fade-in gain: the one that ramps up to 1 over the first 3 seconds. */
function ambienceFadeOf(ctx: FakeAudioContext): FakeGain {
  const fade = ctx.of(FakeGain).find((g) => g.gain.events.some((e) => e.kind === 'exp' && e.value === 1 && e.time === 3));
  if (fade === undefined) throw new Error('no ambience fade-in gain');
  return fade;
}

/** The ambience bus: whatever the fade-in feeds. This is the gain that ducks and recovers. */
function ambienceBusOf(ctx: FakeAudioContext): FakeGain {
  const [bus] = [...ambienceFadeOf(ctx).outputs];
  if (!(bus instanceof FakeGain)) throw new Error('the ambience fade feeds no bus');
  return bus;
}

/** Count nodes by kind, so a failing assertion prints a summary instead of thousands of nodes. */
function byKind(nodes: readonly FakeNode[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const node of nodes) counts[node.kind] = (counts[node.kind] ?? 0) + 1;
  return counts;
}

beforeEach(installFakeAudio);
afterEach(() => vi.unstubAllGlobals());

describe('Office processing guard', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 'overload'] as const)(
    'schedules no brass/flourish oscillators for %s',
    (step) => {
      const { desk, ctx } = unlockedDesk();
      const created = deliver(desk, ctx, 4, step === 'overload' ? { type: 'overload' } : reply(step));
      const forbidden = oscillatorsIn(created).filter((o) =>
        o.type === 'sawtooth' || o.type === 'triangle' ||
        [1250, 3450, 6750, 11162.5].some((hz) => near(o.frequency.initial, hz, 0.01)) ||
        o.frequency.events.some((e) => (e.kind === 'exp' || e.kind === 'linear') && e.value > o.frequency.initial),
      );
      expect(forbidden.map((o) => ({ type: o.type, hz: o.frequency.initial })),
        'completion must contain no brass, two-note flourish, approval bell or rising whine',
      ).toEqual([]);
    },
  );
});

// --- Lifecycle ---------------------------------------------------------------------------------

describe('lifecycle', () => {
  it('creates no AudioContext before unlock (create, play, setMuted)', () => {
    const desk = createSoundDesk();
    expect(FakeAudioContext.instances).toHaveLength(0);

    desk.play(contact);
    desk.play(lift);
    expect(FakeAudioContext.instances).toHaveLength(0);

    desk.setMuted(true);
    desk.setMuted(false);
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('constructs nothing when unlock is called while muted', () => {
    const desk = createSoundDesk();
    desk.setMuted(true);
    desk.unlock();
    desk.unlock();
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('constructs exactly one AudioContext however often unlock is called', () => {
    const desk = createSoundDesk();
    for (let i = 0; i < 5; i += 1) desk.unlock();
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(context().resumeCalls).toBe(0);
  });

  it('resumes a suspended context on every unlock and swallows a rejected resume', async () => {
    const unhandled: unknown[] = [];
    const record = (reason: unknown): void => void unhandled.push(reason);
    process.on('unhandledRejection', record);
    try {
      FakeAudioContext.initialState = 'suspended';
      const { desk, ctx } = unlockedDesk();
      expect(ctx.resumeCalls).toBe(1);

      ctx.resumeImpl = () => Promise.reject(new Error('NotAllowedError'));
      expect(() => desk.unlock()).not.toThrow();
      expect(ctx.resumeCalls).toBe(2);

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', record);
    }
  });

  it('ramps the master to 0 over 80 ms on mute and back over 200 ms, and suspends nothing', () => {
    const { desk, ctx } = unlockedDesk();
    const master = masterOf(ctx);
    const before = master.gain.value;
    expect(before).toBeGreaterThan(0);

    ctx.currentTime = 5;
    desk.setMuted(true);
    const down = master.gain.events.filter((e) => e.kind === 'linear').at(-1);
    expect(down?.value).toBe(0);
    expect(down?.time).toBeCloseTo(5.08, 9);

    ctx.currentTime = 6;
    desk.setMuted(false);
    const up = master.gain.events.filter((e) => e.kind === 'linear').at(-1);
    expect(up?.value).toBeCloseTo(before, 9);
    expect(up?.time).toBeCloseTo(6.2, 9);

    expect(ctx.suspendCalls).toBe(0);
    expect(ctx.closeCalls).toBe(0);
  });

  it('closes the context on dispose and stops every ambience source', () => {
    const { desk, ctx } = unlockedDesk();
    const endless = ctx.sources().filter((s) => s.stopTime === null);
    expect(endless.length).toBeGreaterThan(0);

    desk.dispose();
    expect(ctx.closeCalls).toBe(1);
    expect(ctx.sources().filter((s) => s.stopTime === null)).toEqual([]);
    expect(ctx.of(FakeGain).every((g) => !g.connected)).toBe(true);
  });

  it('makes every method a no-op after dispose, including a second dispose', () => {
    const { desk, ctx } = unlockedDesk();
    desk.dispose();
    const nodes = ctx.nodes.length;

    desk.unlock();
    desk.setMuted(false);
    desk.play(contact);
    desk.play(reply(1));
    desk.dispose();

    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(ctx.nodes).toHaveLength(nodes);
    expect(ctx.closeCalls).toBe(1);
  });

  it('never throws out of play, even if the browser refuses to create a node', () => {
    const { desk, ctx } = unlockedDesk();
    ctx.createOscillator = () => {
      throw new Error('InvalidStateError');
    };
    expect(() => desk.play(contact)).not.toThrow();
    expect(() => desk.play(reply(1))).not.toThrow();
  });
});

describe('muting', () => {
  it('creates no nodes for any cue while muted', () => {
    const { desk, ctx } = unlockedDesk();
    desk.setMuted(true);
    const count = ctx.nodes.length;

    const cues: Cue[] = [
      contact,
      lift,
      reply(1),
      reply(5),
      { type: 'overload' },
      { type: 'stillness' },
      { type: 'memo-revealed', source: 'overload' },
      { type: 'memo-opened' },
      { type: 'memo-closed' },
      { type: 'reset' },
    ];
    cues.forEach((cue, i) => deliver(desk, ctx, 10 + i, cue));

    expect(ctx.nodes).toHaveLength(count);
  });

  it('plays again after unmuting', () => {
    const { desk, ctx } = unlockedDesk();
    desk.setMuted(true);
    desk.setMuted(false);
    expect(deliver(desk, ctx, 4, contact).length).toBeGreaterThan(0);
  });
});

// --- Bus graph ---------------------------------------------------------------------------------

describe('bus graph', () => {
  it('chains master -> safety limiter -> destination with the specified limiter settings', () => {
    const { ctx } = unlockedDesk();
    const [limiter] = ctx.of(FakeCompressor);
    expect(limiter).toBeDefined();
    if (limiter === undefined) return;
    expect(limiter.threshold.value).toBe(-6);
    expect(limiter.knee.value).toBe(0);
    expect(limiter.ratio.value).toBe(20);
    expect(limiter.attack.value).toBeCloseTo(0.002, 9);
    expect(limiter.release.value).toBeCloseTo(0.12, 9);
    const feeders = ctx.inputsOf(ctx.destination);
    expect(feeders).toHaveLength(1);
    expect(feeders[0]).toBe(limiter);
    expect([...ctx.inputsOf(limiter)]).toEqual([masterOf(ctx)]);
    // Three buses feed the master.
    expect(ctx.inputsOf(masterOf(ctx))).toHaveLength(3);
  });

  it('routes every voice through the interaction or music bus, never straight to the master', () => {
    const { desk, ctx } = unlockedDesk();
    const baseline = new Set(ctx.nodes);
    deliver(desk, ctx, 1, contact);
    deliver(desk, ctx, 1.3, lift);
    deliver(desk, ctx, 1.3, reply(1));
    deliver(desk, ctx, 1.3, { type: 'stillness' });

    const entries = new Set<FakeNode | FakeParam>();
    for (const node of ctx.nodes) {
      if (baseline.has(node)) continue;
      for (const out of node.outputs) if (out instanceof FakeNode && baseline.has(out)) entries.add(out);
    }
    // Only the two epoch gains (interaction and music) are entered from one-shot graphs.
    expect(entries.size).toBe(2);
    for (const entry of entries) {
      expect(entry).toBeInstanceOf(FakeGain);
      if (entry instanceof FakeNode) {
        expect(entry.outputs.size).toBe(1);
        expect([...entry.outputs][0]).toBeInstanceOf(FakeGain);
      }
    }
  });

  it('builds the two noise buffers once on unlock and shares them across hundreds of stamps', () => {
    const { desk, ctx } = unlockedDesk();
    expect(ctx.buffers).toHaveLength(2);
    expect(ctx.buffers.every((b) => b.length === 2 * ctx.sampleRate)).toBe(true);

    for (let i = 0; i < 20; i += 1) {
      deliver(desk, ctx, 10 + i * 2, contact);
      deliver(desk, ctx, 10.3 + i * 2, lift);
      deliver(desk, ctx, 10.3 + i * 2, reply((i % 4) + 1));
    }
    expect(ctx.buffers).toHaveLength(2);
  });
});

// --- Timing ------------------------------------------------------------------------------------

describe('stamp timing', () => {
  it('schedules the strike at contact + 180 ms and the carriage slide at contact', () => {
    const { desk, ctx } = unlockedDesk();
    const T = 3.25;
    const created = deliver(desk, ctx, T, contact);

    const thump = thumpIn(created);
    expect(thump?.startTime).toBeCloseTo(T + DESCEND, 9);

    // Every layer of the strike lands on the same instant.
    const click = noiseThrough(ctx, created, 'highpass', 2500, 2500 * 0.031);
    const knock = noiseThrough(ctx, created, 'bandpass', 900, 900 * 0.031);
    expect(click).toHaveLength(1);
    expect(knock).toHaveLength(1);
    expect(click[0]?.startTime).toBeCloseTo(T + DESCEND, 9);
    expect(knock[0]?.startTime).toBeCloseTo(T + DESCEND, 9);

    const slide = noiseThrough(ctx, created, 'bandpass', 3600, 1);
    expect(slide).toHaveLength(1);
    expect(slide[0]?.startTime).toBeCloseTo(T, 9);
  });

  it('pushes a lift that arrives before the minimum dwell to contact + descend + minDwell', () => {
    const { desk, ctx } = unlockedDesk();
    const T = 2;
    deliver(desk, ctx, T, contact);
    const created = deliver(desk, ctx, T + 0.02, lift);

    const tck = noiseThrough(ctx, created, 'bandpass', 1800, 1);
    expect(tck).toHaveLength(1);
    expect(tck[0]?.startTime).toBeCloseTo(T + DWELL_END, 9);
    expect(T + DWELL_END).toBeGreaterThan(T + 0.02);
  });

  it('peels at the lift time itself when the stamp has already dwelled long enough', () => {
    const { desk, ctx } = unlockedDesk();
    const T = 2;
    deliver(desk, ctx, T, contact);
    const created = deliver(desk, ctx, T + 1.5, lift);

    const tck = noiseThrough(ctx, created, 'bandpass', 1800, 1);
    expect(tck[0]?.startTime).toBeCloseTo(T + 1.5, 9);
  });

  it('fades the hold creak out over 40 ms at the lift and stops it', () => {
    const { desk, ctx } = unlockedDesk();
    const T = 1;
    const created = deliver(desk, ctx, T, contact);
    const creak = noiseThrough(ctx, created, 'bandpass', 300, 1);
    expect(creak).toHaveLength(1);
    // Compression builds from just after the strike, over the bounded 1.2 s compression.
    expect(creak[0]?.startTime).toBeCloseTo(T + DESCEND + 0.03, 9);
    const naturalEnd = creak[0]?.endTime ?? 0;
    expect(naturalEnd).toBeGreaterThan(T + 1.4);

    const L = T + 0.4;
    deliver(desk, ctx, L, lift);
    expect(creak[0]?.endTime).toBeCloseTo(L + 0.05, 9);
    const fade = ctx
      .of(FakeGain)
      .find((g) => g.gain.events.some((e) => e.kind === 'linear' && e.value === 0 && near(e.time, L + 0.04, 1e-9)));
    expect(fade).toBeDefined();
  });

  it('starts the reply printer replyDelayMs after the lift', () => {
    const { desk, ctx } = unlockedDesk();
    deliver(desk, ctx, 1, contact);
    deliver(desk, ctx, 1.5, lift);
    const created = deliver(desk, ctx, 1.5, reply(1));

    expect(earliest(sourcesIn(created))).toBeCloseTo(1.5 + REPLY_DELAY, 9);
  });

  it('settles the first reply with a damped knock printMs later', () => {
    const { desk, ctx } = unlockedDesk();
    deliver(desk, ctx, 1, contact);
    deliver(desk, ctx, 1.5, lift);
    const created = deliver(desk, ctx, 1.5, reply(1));

    const knock = oscillatorsIn(created).find((o) => o.frequency.initial === 170);
    expect(knock?.startTime).toBeCloseTo(1.5 + REPLY_DELAY + PRINT, 9);
  });

  it('gives each strike its own small pitch and level, within +-3 % and +-1 dB', () => {
    const { desk, ctx } = unlockedDesk();
    const pitches: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      const created = deliver(desk, ctx, 10 + i * 2, contact);
      const thump = thumpIn(created);
      if (thump !== undefined) pitches.push(thump.frequency.initial);
    }
    expect(pitches).toHaveLength(30);
    expect(pitches.every((p) => p >= 150 * 0.97 - 1e-9 && p <= 150 * 1.03 + 1e-9)).toBe(true);
    expect(new Set(pitches.map((p) => p.toFixed(3))).size).toBeGreaterThan(20);

    for (let i = 1; i <= 200; i += 1) {
      const v = strikeVariation(i);
      expect(Math.abs(20 * Math.log10(v.gain))).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

// --- The joke ----------------------------------------------------------------------------------

describe('material processing', () => {
  it('gives steps 1–5 distinct contact, paper, relay and falling motor sequences', () => {
    const { desk, ctx } = unlockedDesk();
    const at = 4 + REPLY_DELAY;
    const steps = [1, 2, 3, 4, 5].map((step) => deliver(desk, ctx, 4, reply(step)));
    const [received = [], expired = [], witness = [], circular = [], absent = []] = steps;
    const starts = (nodes: readonly FakeNode[], hz: number): number[] =>
      noiseThrough(ctx, nodes, 'bandpass', hz, 0.01).map((n) => Number(((n.startTime ?? 0) - at).toFixed(3)));
    expect(oscillatorsIn(received).map((o) => o.frequency.initial)).toEqual([190, 170]);
    expect(starts(received, 1500)).toEqual([0.6]);
    const feed = received.find((n): n is FakeBiquad => n instanceof FakeBiquad && n.type === 'lowpass');
    expect(feed?.frequency.events.at(-1)?.time).toBeCloseTo(at + 0.6, 9);

    expect(starts(expired, 1600)).toEqual([0.3]);
    const motor = expired.find((n): n is FakeBiquad => n instanceof FakeBiquad && n.frequency.initial === 280);
    expect(motor?.frequency.events.at(-1)).toEqual({ kind: 'exp', value: 210, time: at + 0.1 + 0.25 });
    expect(expired.some((n) => n instanceof FakeBiquad && n.frequency.initial === 1000)).toBe(true);

    const contacts = oscillatorsIn(witness);
    expect(contacts).toHaveLength(2);
    expect((contacts[1]?.startTime ?? 0) - (contacts[0]?.startTime ?? 0)).toBeCloseTo(0.055, 9);
    expect(starts(witness, 2400)).toEqual([0.1]);
    expect(starts(witness, 1900)).toEqual([0.3]);
    expect(Math.max(...sourcesIn(witness).map((n) => n.endTime))).toBeLessThan(at + 0.4);

    expect(starts(circular, 3200)).toEqual([0.12, 0.23, 0.34]);
    expect(starts(circular, 1300)).toEqual([0.56]);
    expect(starts(absent, 950)).toEqual([0]);
    expect(starts(absent, 1050)).toEqual([0.18]);
    expect(oscillatorsIn(absent)).toHaveLength(0);
    const stopped = absent.find((n): n is FakeBiquad => n instanceof FakeBiquad && n.type === 'lowpass');
    expect(stopped?.frequency.events.at(-1)).toEqual({ kind: 'exp', value: 80, time: at + 0.3 + 0.35 });
  });

  it('cycles exactly three fixed aftermath timbres, each with one tired relay', () => {
    const { desk, ctx } = unlockedDesk();
    const signatures = [6, 7, 8, 9, 10, 11].map((step) => {
      const created = deliver(desk, ctx, 4, reply(step));
      const relays = created.filter((n): n is FakeBiquad => n instanceof FakeBiquad && n.Q.value === 1.2);
      expect(relays).toHaveLength(1);
      expect(earliest(relays.flatMap((r) => ctx.upstreamSources(r)))).toBeCloseTo(4 + REPLY_DELAY + 0.25, 9);
      return created.filter((n) => n instanceof FakeBiquad || n instanceof FakeOscillator)
        .map((n) => n instanceof FakeBiquad || n instanceof FakeOscillator ? n.frequency.initial : 0);
    });
    expect(new Set(signatures.map((shape) => JSON.stringify(shape))).size).toBe(3);
    expect(signatures.slice(3)).toEqual(signatures.slice(0, 3));
  });

  it('exports a quiet finite service bell for deliberate visitor use', () => {
    const ctx = new FakeAudioContext();
    const out = ctx.createGain();
    let live = 0;
    serviceBell({
      ctx: ctx as unknown as BaseAudioContext,
      noise: createNoiseBuffers(ctx as unknown as BaseAudioContext),
      rand: () => 0.5,
      out: out as unknown as AudioNode,
      begin: () => { live += 1; return () => { live -= 1; }; },
    }, 2);
    const tones = ctx.of(FakeOscillator);
    expect(tones).toHaveLength(2);
    expect(tones.every((o) => o.startTime === 2 && o.endTime <= 2.21)).toBe(true);
    expect(ctx.of(FakeGain).flatMap((g) => g.gain.events).filter((e) => e.kind === 'linear')
      .every((e) => e.value <= LEVEL.processRelay / 2)).toBe(true);
    expect(live).toBe(1);
    ctx.flushEnded();
    expect(live).toBe(0);
    expect(ctx.nodes.filter((n) => n !== out && n.connected)).toEqual([]);
  });
});

describe('the overload', () => {
  /** Stamp 5 at lift time 4: processing 4.36, pause 5.76, hatch lands 6.56. */
  function overload(): { ctx: FakeAudioContext; created: FakeNode[]; start: number } {
    const { desk, ctx } = unlockedDesk();
    deliver(desk, ctx, 3.7, contact);
    deliver(desk, ctx, 4, lift);
    const created = [
      ...deliver(desk, ctx, 4, reply(OVERLOAD_AT)),
      ...deliver(desk, ctx, 4, { type: 'overload' }),
    ];
    return { ctx, created, start: 4 + REPLY_DELAY };
  }

  it('lands the hatch panel TIMING.overloadMs after the reply starts, latch first', () => {
    const { created, start } = overload();
    const landAt = start + OVERLOAD;
    const fall = oscillatorsIn(created).find(
      (o) => o.type === 'sine' && near(o.frequency.initial, 95, 0.5) && o.frequency.events.some((e) => e.value === 38),
    );
    expect(fall?.startTime).toBeCloseTo(landAt, 9);

    const paper = noiseThrough(context(), created, 'bandpass', 2800, 0.01);
    expect(paper.map((p) => Number(((p.startTime ?? 0) - landAt).toFixed(3)))).toEqual([0.04, 0.1, 0.19]);
    expect(oscillatorsIn(created).every((o) => o.frequency.initial < 250)).toBe(true);

    const latch = oscillatorsIn(created).find(
      (o) => o.type === 'sine' && near(o.frequency.initial, 130, 0.5) && o.frequency.events.some((e) => near(e.value, 62, 0.5)),
    );
    expect(latch?.startTime).toBeCloseTo(landAt - TIMING.overloadLatchLeadMs / 1000, 9);
    expect(latch?.startTime).toBeGreaterThan(start + PRINT + ms(TIMING.bellRingMs));
  });

  it('preserves the 18 dB pause for 1.6 s, then returns the room 3 dB lower', () => {
    const { ctx, start } = overload();
    const cutAt = start + PRINT + ms(TIMING.bellRingMs);
    const bus = ambienceBusOf(ctx);
    const events = bus.gain.events;

    const down = events.find((e) => e.kind === 'exp' && near(e.value, DUCK, 1e-6));
    expect(down, 'an exponential duck to -18 dB').toBeDefined();
    expect(down?.time).toBeGreaterThan(cutAt);
    expect(down?.time).toBeLessThan(cutAt + 0.2);

    const hold = events.find((e) => e.kind === 'set' && near(e.value, DUCK, 1e-6));
    expect(hold, 'a hold at -18 dB').toBeDefined();
    expect(hold?.time).toBeCloseTo(cutAt + 1.6, 9);

    const back = events.filter((e) => e.kind === 'exp').at(-1);
    expect(back?.value).toBeCloseTo(ROOM, 9);
    expect(back?.time).toBeGreaterThan((hold?.time ?? 0) + 0.5);
  });

  it('fades only the machine tone over 1.5 s after the authority bay lands, and restores it on reset', () => {
    const { desk, ctx } = unlockedDesk();
    const vent = ctx.of(FakeBufferSource).find((n) => n.stopTime === null);
    const drones = ctx.of(FakeOscillator).filter((n) => n.frequency.value > 70);
    const [amp] = drones[0]?.outputs ?? [];
    const [tone] = amp instanceof FakeGain ? amp.outputs : [];
    expect(tone).toBeInstanceOf(FakeGain);
    if (!(tone instanceof FakeGain) || vent === undefined) return;
    expect(ctx.upstreamSources(tone)).not.toContain(vent);
    expect(ctx.upstreamSources(tone).filter((n) => n instanceof FakeOscillator)).toEqual(drones);

    deliver(desk, ctx, 4, reply(5));
    deliver(desk, ctx, 4, { type: 'overload' });
    const landAt = 4 + REPLY_DELAY + OVERLOAD;
    expect(tone.gain.events).toContainEqual({ kind: 'linear', value: 0, time: landAt + 1.5 });
    expect(tone.gain.events).toContainEqual({ kind: 'cancel', value: Number.NaN, time: landAt });
    const ventGains = ctx.of(FakeGain).filter((n) => ctx.upstreamSources(n).includes(vent) && n !== ambienceBusOf(ctx) && n !== masterOf(ctx) && n !== ambienceFadeOf(ctx));
    expect(ventGains.every((n) => n.gain.events.length === 0)).toBe(true);

    deliver(desk, ctx, 5, { type: 'reset' });
    expect(tone.gain.events.slice(-3)).toEqual([
      { kind: 'cancel', value: Number.NaN, time: 5 },
      { kind: 'set', value: 1, time: 5 },
      { kind: 'linear', value: 1, time: 5.8 },
    ]);
  });

  const memoSlideIn = (nodes: readonly FakeNode[]): FakeSource | undefined => {
    const band = nodes.find(
      (n): n is FakeBiquad => n instanceof FakeBiquad && n.type === 'bandpass' && n.frequency.initial === 3300,
    );
    return band && nodes.find((n): n is FakeSource => n instanceof FakeBufferSource && n.outputs.has(band));
  };

  it('slides the memo in a beat after the hatch lands (TIMING.overloadMs + memoAfterLandMs after the reply starts)', () => {
    const { desk, ctx } = unlockedDesk();
    deliver(desk, ctx, 3.7, contact);
    deliver(desk, ctx, 4, lift);
    deliver(desk, ctx, 4, reply(OVERLOAD_AT));
    deliver(desk, ctx, 4, { type: 'overload' });
    const memo = deliver(desk, ctx, 4, { type: 'memo-revealed', source: 'overload' });
    expect(memoSlideIn(memo)?.startTime).toBeCloseTo(4 + REPLY_DELAY + OVERLOAD + TIMING.memoAfterLandMs / 1000, 9);
  });

  it('slides the memo in 0.9 s after the stillness when the machine was left alone', () => {
    const { desk, ctx } = unlockedDesk();
    deliver(desk, ctx, 9, { type: 'stillness' });
    const memo = deliver(desk, ctx, 9, { type: 'memo-revealed', source: 'stillness' });
    expect(memoSlideIn(memo)?.startTime).toBeCloseTo(9.9, 9);
  });
});

describe('stillness and reset', () => {
  it('fades the machine tone after the quiet authority reveal without silencing ventilation', () => {
    const { desk, ctx } = unlockedDesk();
    const vent = ctx.of(FakeBufferSource).find((n) => n.stopTime === null);
    const drones = ctx.of(FakeOscillator).filter((n) => n.frequency.value > 70);
    const [amp] = drones[0]?.outputs ?? [];
    const [tone] = amp instanceof FakeGain ? amp.outputs : [];
    expect(tone).toBeInstanceOf(FakeGain);
    if (!(tone instanceof FakeGain) || vent === undefined) throw new Error('Missing room voices');
    deliver(desk, ctx, 7, { type: 'stillness' });
    deliver(desk, ctx, 7, { type: 'memo-revealed', source: 'stillness' });
    expect(tone.gain.events).toContainEqual({ kind: 'linear', value: 0, time: 9.4 });
    expect(tone.gain.events).toContainEqual({ kind: 'cancel', value: Number.NaN, time: 7.9 });
    const ventGains = ctx.of(FakeGain).filter((n) => ctx.upstreamSources(n).includes(vent) && n !== ambienceBusOf(ctx) && n !== masterOf(ctx) && n !== ambienceFadeOf(ctx));
    expect(ventGains.every((n) => n.gain.events.length === 0)).toBe(true);
  });

  it('exhales 900 -> 180 Hz over 1.4 s and then rings one soft A5 glass harmonic', () => {
    const { desk, ctx } = unlockedDesk();
    const created = deliver(desk, ctx, 7, { type: 'stillness' });

    const breath = created.find(
      (n): n is FakeBiquad => n instanceof FakeBiquad && n.type === 'lowpass' && n.frequency.initial === 900,
    );
    const sweep = breath?.frequency.events.find((e) => e.kind === 'exp');
    expect(sweep?.value).toBe(180);
    expect(sweep?.time).toBeCloseTo(7 + 1.4, 9);

    const glass = oscillatorsIn(created).filter((o) => o.frequency.initial === 880 || o.frequency.initial === 1760);
    expect(glass.map((g) => g.frequency.initial).sort((a, b) => a - b)).toEqual([880, 1760]);
    expect(glass[0]?.startTime).toBeGreaterThan(7);
    expect(glass[0]?.endTime).toBeGreaterThan((glass[0]?.startTime ?? 0) + 2.2);
  });

  it('restores the ambience to its normal level on reset and cancels what was already scheduled', () => {
    const { desk, ctx } = unlockedDesk();
    deliver(desk, ctx, 3.7, contact);
    deliver(desk, ctx, 4, lift);
    deliver(desk, ctx, 4, reply(OVERLOAD_AT));
    deliver(desk, ctx, 4, { type: 'overload' });
    const bus = ambienceBusOf(ctx);

    deliver(desk, ctx, 5, { type: 'reset' });
    const events = bus.gain.events;
    const cancelAt = events.findIndex((e) => e.kind === 'cancel' && e.time === 5);
    expect(cancelAt).toBeGreaterThan(-1);
    const restore = events.slice(cancelAt).find((e) => e.kind === 'linear');
    expect(restore?.value).toBe(1);
    expect(restore?.time).toBeGreaterThan(5);
    expect(restore?.time).toBeLessThanOrEqual(6);
  });

  it('silences anything scheduled before a reset within 25 ms, and keeps new sounds audible', () => {
    const { desk, ctx } = unlockedDesk();
    deliver(desk, ctx, 3.7, contact);
    deliver(desk, ctx, 4, lift);
    deliver(desk, ctx, 4, reply(OVERLOAD_AT));
    deliver(desk, ctx, 4, { type: 'overload' });

    const fresh = deliver(desk, ctx, 5, { type: 'reset' });
    const fading = ctx
      .of(FakeGain)
      .filter((g) => g.gain.events.some((e) => e.kind === 'linear' && e.value === 0 && near(e.time, 5.025, 1e-9)));
    expect(fading).toHaveLength(2);

    // The paper feed that follows the reset is routed around the faded gains.
    const feed = sourcesIn(fresh);
    expect(feed.length).toBeGreaterThan(0);
    const reachesFaded = (node: FakeNode, seen = new Set<FakeNode>()): boolean => {
      if (fading.includes(node as FakeGain)) return true;
      if (seen.has(node)) return false;
      seen.add(node);
      return [...node.outputs].some((o) => o instanceof FakeNode && reachesFaded(o, seen));
    };
    expect(feed.some((s) => reachesFaded(s))).toBe(false);
  });
});

describe('ambience', () => {
  it('fades in over 3 s: vent noise plus D2 and A2 drones drifting on slow LFOs of +-3 cents', () => {
    const { ctx } = unlockedDesk();
    const fade = ambienceFadeOf(ctx);
    expect(fade.gain.initial).toBeLessThan(0.01);

    const vent = ctx.of(FakeBufferSource).filter((s) => s.loop);
    expect(vent).toHaveLength(1);
    const lowpass = ctx.of(FakeBiquad).find((f) => f.type === 'lowpass' && f.frequency.value === 380);
    expect(lowpass).toBeDefined();

    const oscs = ctx.of(FakeOscillator);
    const drones = oscs.filter((o) => near(o.frequency.value, 73.42, 0.01) || near(o.frequency.value, 110, 0.01));
    expect(drones).toHaveLength(2);

    const lfos = oscs.filter((o) => o.frequency.value >= 0.05 && o.frequency.value <= 0.08);
    expect(lfos).toHaveLength(2);
    expect(new Set(lfos.map((l) => l.frequency.value)).size).toBe(2);
    for (const lfo of lfos) {
      const [depth] = [...lfo.outputs];
      expect(depth).toBeInstanceOf(FakeGain);
      if (depth instanceof FakeGain) expect(depth.gain.value).toBe(3);
    }
  });

  /** Peak gain a continuous voice is scaled by on its way into the ambience fade-in. */
  function ambienceVoiceGains(ctx: FakeAudioContext): number[] {
    const fade = ambienceFadeOf(ctx);
    const gains: number[] = [];
    for (const source of ctx.sources().filter((s) => s.stopTime === null)) {
      let product = 1;
      let node: FakeNode | undefined = source;
      let reachedFade = false;
      for (let hops = 0; node !== undefined && hops < 10; hops += 1) {
        if (node === fade) {
          reachedFade = true;
          break;
        }
        if (node instanceof FakeGain) product *= node.gain.value;
        const next: FakeNode | FakeParam | undefined = [...node.outputs][0];
        node = next instanceof FakeNode ? next : undefined;
      }
      if (reachedFade) gains.push(product);
    }
    return gains;
  }

  it('keeps ambience at whisper level, at least 20 dB under the thump', () => {
    const { desk, ctx } = unlockedDesk();
    const ambience = ambienceVoiceGains(ctx);
    // The vent plus four drone partials; the two LFOs steer pitch and make no sound themselves.
    expect(ambience).toHaveLength(5);

    const thump = thumpIn(deliver(desk, ctx, 1, contact));
    const [thumpEnvelope] = thump ? [...thump.outputs] : [];
    const peak = thumpEnvelope instanceof FakeGain ? thumpEnvelope.gain.events.find((e) => e.kind === 'linear')?.value : undefined;
    expect(peak).toBeGreaterThan(0.2);
    for (const gain of ambience) expect(gain).toBeLessThan((peak ?? 0) / 10);
  });
});

// --- Leaks -------------------------------------------------------------------------------------

describe('cleanup', () => {
  it('leaves no connected one-shot nodes after 200 stamp cycles once their sources have ended', () => {
    const { desk, ctx } = unlockedDesk();
    const baseline = new Set(ctx.nodes);

    let t = 10;
    for (let i = 0; i < 200; i += 1) {
      const step = (i % 8) + 1;
      t += 0.5;
      deliver(desk, ctx, t, contact);
      deliver(desk, ctx, t + 0.05, lift);
      deliver(desk, ctx, t + 0.05, reply(step));
      if (step === OVERLOAD_AT) {
        deliver(desk, ctx, t + 0.05, { type: 'overload' });
        deliver(desk, ctx, t + 0.05, { type: 'memo-revealed', source: 'overload' });
      }
      if (step === 7) {
        deliver(desk, ctx, t + 0.1, { type: 'stillness' });
        deliver(desk, ctx, t + 0.1, { type: 'memo-revealed', source: 'stillness' });
        deliver(desk, ctx, t + 0.2, { type: 'memo-opened' });
        deliver(desk, ctx, t + 0.3, { type: 'memo-closed' });
      }
      // Hundreds of voices pile up while their sources are still pending...
      if (i === 99) expect(ctx.nodes.filter((n) => !baseline.has(n) && n.connected).length).toBeGreaterThan(100);
      // ...and a real context fires `ended` as time passes.
      if (i % 25 === 24) ctx.flushEnded();
    }
    ctx.flushEnded();

    const oneShots = ctx.nodes.filter((n) => !baseline.has(n));
    expect(oneShots.length).toBeGreaterThan(1000);
    expect(byKind(oneShots.filter((n) => n.connected))).toEqual({});
    // Every one-shot source was given a stop time, so `ended` is guaranteed to fire.
    expect(byKind(ctx.sources().filter((s) => !baseline.has(s) && !Number.isFinite(s.endTime)))).toEqual({});
  });

  it('counts each source once, even if a browser dispatches ended twice for it', () => {
    const { desk, ctx } = unlockedDesk();
    const created = deliver(desk, ctx, 1, contact);
    const sources = sourcesIn(created);
    const thump = thumpIn(created);
    expect(sources.length).toBeGreaterThan(3);
    expect(thump).toBeDefined();
    if (thump === undefined) return;

    // Every short layer reports its end twice. The thump, which rings longest, has not ended.
    for (const source of sources.filter((s) => s !== thump && s.endTime < thump.endTime)) {
      source.dispatchEnded();
      source.dispatchEnded();
    }
    expect(thump.connected).toBe(true);

    ctx.flushEnded();
    expect(byKind(created.filter((n) => n.connected))).toEqual({});
  });

  it('disconnects the gains of a retired epoch once its last voice has ended', () => {
    const { desk, ctx } = unlockedDesk();
    deliver(desk, ctx, 3.7, contact);
    deliver(desk, ctx, 4, lift);
    deliver(desk, ctx, 4, reply(OVERLOAD_AT));
    deliver(desk, ctx, 4, { type: 'overload' });
    deliver(desk, ctx, 5, { type: 'reset' });

    // The epoch that was retired is the pair of gains that faded out at the reset.
    const retired = ctx
      .of(FakeGain)
      .filter((g) => g.gain.events.some((e) => e.kind === 'linear' && e.value === 0 && near(e.time, 5.025, 1e-9)));
    expect(retired).toHaveLength(2);
    // Voices from before the reset are still sounding, so the retired gains must stay put...
    expect(retired.every((g) => g.connected)).toBe(true);

    // ...and go as soon as the last of them has ended.
    ctx.flushEnded();
    expect(retired.filter((g) => g.connected)).toHaveLength(0);
  });
});

describe('Office object sounds', () => {
  it('plays each deliberate material through the shared desk, with finite sources and mute parity', () => {
    const { desk, ctx } = unlockedDesk();
    for (const kind of ['rubber', 'paper', 'metal', 'wood', 'cloth', 'bell', 'whisper'] as const) {
      const created = deliver(desk, ctx, 2, { type: 'object', kind });
      const sources = sourcesIn(created);
      expect(sources.length, `${kind} must respond to deliberate handling`).toBeGreaterThan(0);
      expect(sources.every(source => Number.isFinite(source.endTime))).toBe(true);
    }
    desk.setMuted(true);
    expect(deliver(desk, ctx, 3, { type: 'object', kind: 'bell' })).toHaveLength(0);
  });
});

describe('application lamps', () => {
  it('ticks one dry finite relay at each of the first five lamp attempts, with no aftermath tick', () => {
    const { desk, ctx } = unlockedDesk();
    for (const step of [1, 2, 3, 4, 5, 6]) {
      const created = deliver(desk, ctx, 4, reply(step));
      const clicks = noiseThrough(ctx, created, 'bandpass', 1250, .01);
      expect(clicks).toHaveLength(step <= 5 ? 1 : 0);
      for (const click of clicks) {
        expect(click.startTime).toBeCloseTo(4 + REPLY_DELAY, 9);
        expect(click.endTime).toBeLessThan(4 + REPLY_DELAY + .06);
      }
    }
  });
});
