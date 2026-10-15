/**
 * A fake `<audio>` element and the extra nodes the gramophone needs, on top of the corridor's fake
 * Web Audio graph (`spineTestAudio.ts`). Nothing here plays or renders sound: it records what was
 * asked, and lets a test answer the question that matters, "what gain does this reach the speakers
 * with at time t?", by the graph.
 */
import { vi } from 'vitest';
import { FakeAudioContext, FakeBiquad, FakeNode, FakeParam, FakeSource, installFakeAudio } from '../spineTestAudio.ts';
import type { GramophoneStore } from './store.ts';

type ElementEvent = 'ended' | 'error';
type PlayOutcome = 'ok' | 'blocked' | 'error';

export class FakeAudioElement {
  static instances: FakeAudioElement[] = [];

  src = '';
  preload = 'auto';
  loop = false;
  currentTime = 0;
  paused = true;
  /** How `play()` answers: it plays, the browser refuses without a gesture, or the file fails. */
  outcome: PlayOutcome = 'ok';
  /** The encodings this "browser" claims to play. */
  playable: readonly string[] = ['audio/webm; codecs="opus"', 'audio/mp4; codecs="mp4a.40.2"'];
  readonly log: string[] = [];
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor() {
    FakeAudioElement.instances.push(this);
  }

  canPlayType(mime: string): string {
    return this.playable.includes(mime) ? 'maybe' : '';
  }

  play(): Promise<void> {
    this.log.push(`play ${this.src}`);
    if (this.outcome === 'blocked') return Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
    if (this.outcome === 'error') return Promise.reject(Object.assign(new Error('no'), { name: 'NotSupportedError' }));
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.log.push('pause');
    this.paused = true;
  }

  load(): void {
    this.log.push('load');
  }

  removeAttribute(name: string): void {
    this.log.push(`remove ${name}`);
    if (name === 'src') this.src = '';
  }

  addEventListener(type: ElementEvent, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: ElementEvent, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  /** Fire an element event, as the browser would. */
  emit(type: ElementEvent): void {
    if (type === 'ended') this.paused = true;
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }

  listenerCount(): number {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }
}

/** The graph's view of an element: sounding exactly while the element is playing. */
export class FakeMediaSource extends FakeSource {
  constructor(
    ctx: FakeAudioContext,
    readonly element: FakeAudioElement,
  ) {
    super(ctx, 'media');
  }
  override activeAt(): boolean {
    return !this.element.paused;
  }
}

export class FakeShaper extends FakeNode {
  curve: Float32Array | null = null;
  oversample = 'none';
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'shaper');
  }
}

export class FakeDelay extends FakeNode {
  readonly delayTime: FakeParam;
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'delay');
    this.delayTime = new FakeParam(0, () => ctx.currentTime);
  }
}

/** A filter with the `gain` a peaking filter has. */
export class MusicFakeBiquad extends FakeBiquad {
  readonly gain: FakeParam;
  constructor(ctx: FakeAudioContext) {
    super(ctx);
    this.gain = new FakeParam(0, () => ctx.currentTime);
  }
}

export class MusicFakeContext extends FakeAudioContext {
  override createBiquadFilter = (): MusicFakeBiquad => new MusicFakeBiquad(this);
  createMediaElementSource = (element: FakeAudioElement): FakeMediaSource => new FakeMediaSource(this, element);
  createWaveShaper = (): FakeShaper => new FakeShaper(this);
  createDelay = (): FakeDelay => new FakeDelay(this);
}

/** Install the fake context and a fake `Audio`, and return the elements made so far. */
export function installMusicAudio(): { elements: () => FakeAudioElement[] } {
  installFakeAudio();
  FakeAudioElement.instances = [];
  vi.stubGlobal('AudioContext', MusicFakeContext);
  vi.stubGlobal('Audio', FakeAudioElement);
  return { elements: () => FakeAudioElement.instances };
}

export function musicContext(): MusicFakeContext {
  const ctx = FakeAudioContext.instances.at(-1);
  if (!(ctx instanceof MusicFakeContext)) throw new Error('no music context was made');
  return ctx;
}

/** Reset the page's shared gramophone: a test starts with the needle up and nobody listening. */
export function resetGramophone(store: GramophoneStore): void {
  store.reset();
}

