/**
 * A fake Web Audio graph for the corridor tests. It records connections, scheduling and parameter
 * automation like the fake in `soundDesk.test.ts`, and adds what the corridor needs: a
 * convolver, a stereo panner, a playback rate, and a parameter that evaluates its own
 * automation. That last part lets a test ask the question that matters, "what gain does this
 * source reach the speakers with at time t?", instead of asserting on how the graph is built.
 * Nothing here renders audio.
 */
import { vi } from 'vitest';

interface ParamEvent {
  kind: 'set' | 'linear' | 'exp';
  value: number;
  time: number;
}

export class FakeParam {
  private events: ParamEvent[] = [];
  /** Every call, in order, for tests that assert on how a parameter was driven. */
  readonly log: { call: string; value?: number; time: number }[] = [];

  constructor(
    private readonly initialValue: number,
    private readonly clock: () => number,
  ) {}

  get value(): number {
    return this.valueAt(this.clock());
  }
  /** Like the browser, setting the value is the parameter's level from the start, before any automation. */
  set value(next: number) {
    this.events.push({ kind: 'set', value: next, time: Number.NEGATIVE_INFINITY });
  }

  setValueAtTime(value: number, time: number): this {
    this.log.push({ call: 'set', value, time });
    this.events.push({ kind: 'set', value, time });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number): this {
    this.log.push({ call: 'linear', value, time });
    this.events.push({ kind: 'linear', value, time });
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number): this {
    this.log.push({ call: 'exp', value, time });
    this.events.push({ kind: 'exp', value, time });
    return this;
  }
  cancelScheduledValues(time: number): this {
    this.log.push({ call: 'cancel', time });
    this.events = this.events.filter((e) => e.time < time);
    return this;
  }
  cancelAndHoldAtTime(time: number): this {
    this.log.push({ call: 'hold', time });
    const held = this.valueAt(time);
    this.events = this.events.filter((e) => e.time <= time);
    this.events.push({ kind: 'set', value: held, time });
    return this;
  }

  /** The value the parameter has at `time`, from its automation. */
  valueAt(time: number): number {
    const sorted = [...this.events].sort((a, b) => a.time - b.time);
    let value = this.initialValue;
    let at = Number.NEGATIVE_INFINITY;
    for (const event of sorted) {
      if (event.time <= time) {
        value = event.value;
        at = event.time;
        continue;
      }
      if (event.kind === 'set') return value;
      const start = Number.isFinite(at) ? at : 0;
      if (event.time <= start) return event.value;
      const u = Math.min(1, Math.max(0, (time - start) / (event.time - start)));
      if (event.kind === 'linear') return value + (event.value - value) * u;
      return value > 0 && event.value > 0 ? value * (event.value / value) ** u : u >= 1 ? event.value : value;
    }
    return value;
  }

  /** Every time at which this parameter was given a target, with that target. */
  targets(): { time: number; value: number; kind: ParamEvent['kind'] }[] {
    return this.events.map(({ time, value, kind }) => ({ time, value, kind }));
  }
}

export class FakeNode {
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

export class FakeGain extends FakeNode {
  readonly gain: FakeParam;
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'gain');
    this.gain = new FakeParam(1, () => ctx.currentTime);
  }
}

export class FakeBiquad extends FakeNode {
  type = 'lowpass';
  readonly frequency: FakeParam;
  readonly Q: FakeParam;
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'biquad');
    this.frequency = new FakeParam(350, () => ctx.currentTime);
    this.Q = new FakeParam(1, () => ctx.currentTime);
  }
}

export class FakeCompressor extends FakeNode {
  readonly threshold: FakeParam;
  readonly knee: FakeParam;
  readonly ratio: FakeParam;
  readonly attack: FakeParam;
  readonly release: FakeParam;
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'compressor');
    const param = (value: number): FakeParam => new FakeParam(value, () => ctx.currentTime);
    this.threshold = param(-24);
    this.knee = param(30);
    this.ratio = param(12);
    this.attack = param(0.003);
    this.release = param(0.25);
  }
}

export class FakeConvolver extends FakeNode {
  buffer: FakeBuffer | null = null;
  normalize = true;
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'convolver');
  }
}

export class FakePanner extends FakeNode {
  readonly pan: FakeParam;
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'panner');
    this.pan = new FakeParam(0, () => ctx.currentTime);
  }
}

export class FakeSource extends FakeNode {
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
  /** Sounding at `time`: started, and not yet stopped. */
  activeAt(time: number): boolean {
    return this.startTime !== null && this.startTime <= time && (this.stopTime === null || time < this.stopTime);
  }
  get endTime(): number {
    return this.stopTime ?? Number.POSITIVE_INFINITY;
  }
  fireEnded(): void {
    if (this.ended) return;
    this.ended = true;
    for (const entry of [...this.listeners]) {
      if (entry.once) this.listeners.splice(this.listeners.indexOf(entry), 1);
      entry.listener();
    }
  }
}

export class FakeOscillator extends FakeSource {
  type = 'sine';
  readonly frequency: FakeParam;
  readonly detune: FakeParam;
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'osc');
    this.frequency = new FakeParam(440, () => ctx.currentTime);
    this.detune = new FakeParam(0, () => ctx.currentTime);
  }
}

export class FakeBufferSource extends FakeSource {
  buffer: FakeBuffer | null = null;
  loop = false;
  readonly playbackRate: FakeParam;
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'bufsrc');
    this.playbackRate = new FakeParam(1, () => ctx.currentTime);
  }
}

export interface FakeBuffer {
  readonly length: number;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

export class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static initialState = 'running';

  currentTime = 0;
  readonly sampleRate = 48_000;
  state: string;
  readonly nodes: FakeNode[] = [];
  readonly buffers: FakeBuffer[] = [];
  readonly destination: FakeNode;
  resumeCalls = 0;
  closeCalls = 0;

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
  createConvolver = (): FakeConvolver => new FakeConvolver(this);
  createStereoPanner = (): FakePanner => new FakePanner(this);
  createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    const buffer: FakeBuffer = {
      length,
      sampleRate,
      numberOfChannels: channels,
      getChannelData: (channel) => data[channel] ?? new Float32Array(length),
    };
    this.buffers.push(buffer);
    return buffer;
  }

  resume(): Promise<void> {
    this.resumeCalls += 1;
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.closeCalls += 1;
    this.state = 'closed';
    return Promise.resolve();
  }

  of<T extends FakeNode>(ctor: new (ctx: FakeAudioContext) => T, since = 0): T[] {
    return this.nodes.slice(since).filter((n): n is T => n instanceof ctor);
  }
  sources(since = 0): FakeSource[] {
    return this.nodes.slice(since).filter((n): n is FakeSource => n instanceof FakeSource);
  }
  inputsOf(node: FakeNode | FakeParam): FakeNode[] {
    return this.nodes.filter((n) => n.outputs.has(node));
  }
  /** Fire `ended` on every source that has a finite stop time, as a real context would. */
  flushEnded(): void {
    for (const source of this.sources()) {
      if (source.startTime !== null && Number.isFinite(source.endTime)) source.fireEnded();
    }
  }
}

export function installFakeAudio(): void {
  FakeAudioContext.instances = [];
  FakeAudioContext.initialState = 'running';
  vi.stubGlobal('AudioContext', FakeAudioContext);
}

export function context(): FakeAudioContext {
  const ctx = FakeAudioContext.instances.at(-1);
  if (ctx === undefined) throw new Error('the desk never constructed an AudioContext');
  return ctx;
}

/**
 * The gain with which `source` reaches the speakers at `time`: the sum over every path through
 * the graph of the product of the gains along it. Panners, filters, convolvers and the limiter
 * pass signal at unity here; the tests ask whether something is audible, not how loud.
 * Zero when the source is not sounding at `time`.
 */
export function audibleGain(source: FakeSource, time: number): number {
  if (!source.activeAt(time)) return 0;
  const visit = (node: FakeNode, seen: ReadonlySet<FakeNode>): number => {
    if (node.kind === 'destination') return 1;
    if (seen.has(node)) return 0;
    const next = new Set(seen).add(node);
    const gain = node instanceof FakeGain ? node.gain.valueAt(time) : 1;
    let sum = 0;
    for (const out of node.outputs) if (out instanceof FakeNode) sum += visit(out, next);
    return gain * sum;
  };
  return visit(source, new Set());
}

/** `ended` for everything with a finite stop, then the nodes still connected, by kind. */
export function connectedByKind(nodes: readonly FakeNode[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const node of nodes) if (node.connected) counts[node.kind] = (counts[node.kind] ?? 0) + 1;
  return counts;
}
