/**
 * Synthesis recipes for the sound desk. Every function here schedules one sound at an absolute
 * `AudioContext` time (`when`) and returns; nothing waits, nothing uses timers. Each recipe builds
 * a small node graph, starts every source with an explicit stop time, and the graph disconnects
 * itself when its last source has ended, so hundreds of stamps leave nothing behind.
 *
 * Levels live in `LEVEL` and are linear gains measured as peak amplitude at the voice's bus
 * (before the master). The stamp's thump is the loudest thing in the room; ambience is barely
 * there. Retune by editing that table, not the recipes.
 */
import { OFFICE_PRESS_TIMING } from '@tqw/engine';
import { TIMING } from '../timing.ts';
import { NOISE_SECONDS, type NoiseBuffers } from './noise.ts';

export const FLOOR = 0.0001;

export const dbToGain = (db: number): number => 10 ** (db / 20);

/** Peak gain targets per voice. The thump is the reference; everything else sits under it. */
export const LEVEL = {
  slide: 0.05,
  click: 0.1,
  thump: 0.36,
  thumpOvertone: 0.12,
  knock: 1.7,
  squelch: 0.5,
  rattle: 0.1,
  creak: 0.2,
  tck: 0.56,
  boing: 0.04,
  rustle: 0.06,
  processContact: 0.09,
  processPaper: 0.06,
  processRelay: 0.055,
  processMotor: 0.035,
  processWeight: 0.07,
  serviceBell: 0.018,
  latchClick: 0.13,
  latchBody: 0.14,
  swing: 0.19,
  fallThump: 0.2,
  fallCrack: 0.8,
  exhale: 0.048,
  glass: 0.06,
  memoSlide: 0.12,
  paperFeed: 0.066,
  memoHandle: 0.05,
  vent: 0.012,
  drone: 0.004,
} as const;

/** Where a voice goes, and how it reports that it has finished. */
export interface VoiceEnv {
  readonly ctx: BaseAudioContext;
  readonly noise: NoiseBuffers;
  /** Deterministic stream in [0, 1); used for noise read offsets and small per-hit jitter. */
  readonly rand: () => number;
  readonly out: AudioNode;
  /** Called when a graph is created; the returned function is called once the graph is gone. */
  readonly begin: () => () => void;
}

/**
 * One self-cleaning node graph. Create nodes through it; start sources with `noise` / `osc`
 * (which always take a stop time); when every source has fired `ended`, all nodes disconnect.
 */
export class Shot {
  private readonly nodes: AudioNode[] = [];
  private pending = 0;
  private readonly done: () => void;

  constructor(private readonly env: VoiceEnv) {
    this.done = env.begin();
  }

  private track<T extends AudioNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  private readonly onEnded = (): void => {
    this.pending -= 1;
    if (this.pending > 0) return;
    for (const node of this.nodes) {
      try {
        node.disconnect();
      } catch {
        // Already disconnected, or the context is gone.
      }
    }
    this.nodes.length = 0;
    this.done();
  };

  private source<T extends AudioScheduledSourceNode>(node: T): T {
    this.track(node);
    this.pending += 1;
    node.addEventListener('ended', this.onEnded, { once: true });
    return node;
  }

  gain(value: number): GainNode {
    const node = this.track(this.env.ctx.createGain());
    node.gain.value = value;
    return node;
  }

  filter(type: BiquadFilterType, frequency: number, q = 1): BiquadFilterNode {
    const node = this.track(this.env.ctx.createBiquadFilter());
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    return node;
  }

  /** Looping noise from the shared buffer, read from a deterministic random offset. */
  noise(kind: keyof NoiseBuffers, when: number, stopAt: number): AudioBufferSourceNode {
    const node = this.source(this.env.ctx.createBufferSource());
    node.buffer = this.env.noise[kind];
    node.loop = true;
    node.start(when, this.env.rand() * (NOISE_SECONDS - 0.01));
    node.stop(stopAt);
    return node;
  }

  osc(type: OscillatorType, frequency: number, when: number, stopAt: number): OscillatorNode {
    const node = this.source(this.env.ctx.createOscillator());
    node.type = type;
    node.frequency.value = frequency;
    node.start(when);
    node.stop(stopAt);
    return node;
  }

  /** Connect `nodes` in series. The last one is returned. */
  chain<T extends AudioNode>(first: AudioNode, ...rest: [...AudioNode[], T]): T {
    let previous = first;
    for (const node of rest) {
      previous.connect(node);
      previous = node;
    }
    return previous as T;
  }

  /** Connect to the bus this shot was created for. */
  toOut(node: AudioNode): void {
    node.connect(this.env.out);
  }
}

export const shot = (env: VoiceEnv): Shot => new Shot(env);

/** Near-instant attack, exponential fall to the floor at `when + attack + decay`. */
function burst(param: AudioParam, when: number, peak: number, decay: number, attack = 0.0015): void {
  param.setValueAtTime(FLOOR, when);
  param.linearRampToValueAtTime(peak, when + attack);
  param.exponentialRampToValueAtTime(FLOOR, when + attack + decay);
}

/** Rise to `peak` over `rise`, then fall to the floor by `total`. */
function swell(param: AudioParam, when: number, peak: number, rise: number, total: number): void {
  param.setValueAtTime(FLOOR, when);
  param.exponentialRampToValueAtTime(peak, when + rise);
  param.exponentialRampToValueAtTime(FLOOR, when + total);
}

const fract = (x: number): number => x - Math.floor(x);

/**
 * Deterministic per-strike variation: pitch within +-3 %, level within +-1 dB. Golden-ratio
 * sequences keep neighbours apart, so repeated stamps never machine-gun.
 */
export function strikeVariation(count: number): { pitch: number; gain: number } {
  const a = fract(count * 0.6180339887498949 + 0.11);
  const b = fract(count * 0.7548776662466927 + 0.37);
  return { pitch: 1 + 0.03 * (2 * a - 1), gain: dbToGain(2 * b - 1) };
}

/** Contact: a tiny brass carriage sliding down. Sells the mechanism, barely audible. */
export function carriageSlide(env: VoiceEnv, when: number): void {
  const s = shot(env);
  const length = 0.06;
  const src = s.noise('white', when, when + length + 0.01);
  const band = s.filter('bandpass', 3600, 2);
  band.frequency.setValueAtTime(3600, when);
  band.frequency.linearRampToValueAtTime(4400, when + length);
  const amp = s.gain(0);
  swell(amp.gain, when, LEVEL.slide, 0.02, length);
  s.chain(src, band, amp);
  s.toOut(amp);
}

/** The rubber meets the paper. All layers share `when`, so they land on the same sample. */
export function strike(env: VoiceEnv, when: number, count: number): void {
  const s = shot(env);
  const v = strikeVariation(count);
  const bus = s.gain(v.gain);
  s.toOut(bus);

  // Transient click: the first thing the ear locks onto.
  const click = s.noise('white', when, when + 0.03);
  const clickAmp = s.gain(0);
  burst(clickAmp.gain, when, LEVEL.click, 0.01, 0.0004);
  s.chain(click, s.filter('highpass', 2500 * v.pitch, 0.7), clickAmp, bus);

  // Body: a sine falling from 150 to 48 Hz is the weight of the whole machine.
  const thump = s.osc('sine', 150 * v.pitch, when, when + 0.22);
  thump.frequency.setValueAtTime(150 * v.pitch, when);
  thump.frequency.exponentialRampToValueAtTime(48 * v.pitch, when + 0.09);
  const thumpAmp = s.gain(0);
  thumpAmp.gain.setValueAtTime(FLOOR, when);
  thumpAmp.gain.linearRampToValueAtTime(LEVEL.thump, when + 0.003);
  thumpAmp.gain.exponentialRampToValueAtTime(FLOOR, when + 0.17);
  s.chain(thump, thumpAmp, bus);

  // An octave above the thump, so the weight survives laptop and phone speakers.
  const upper = s.osc('sine', 300 * v.pitch, when, when + 0.14);
  upper.frequency.setValueAtTime(300 * v.pitch, when);
  upper.frequency.exponentialRampToValueAtTime(110 * v.pitch, when + 0.07);
  const upperAmp = s.gain(0);
  burst(upperAmp.gain, when, LEVEL.thumpOvertone, 0.09, 0.002);
  s.chain(upper, upperAmp, bus);

  // The handle's wood.
  const knock = s.noise('white', when, when + 0.08);
  const knockAmp = s.gain(0);
  burst(knockAmp.gain, when, LEVEL.knock, 0.05, 0.001);
  s.chain(knock, s.filter('bandpass', 900 * v.pitch, 5), knockAmp, bus);

  // Rubber and ink: a wet, lowpassed press that arrives a beat after the hit.
  const wet = when + 0.012;
  const squelch = s.noise('white', wet, wet + 0.08);
  const squelchLow = s.filter('lowpass', 900, 1.2);
  squelchLow.frequency.setValueAtTime(900, wet);
  squelchLow.frequency.exponentialRampToValueAtTime(420, wet + 0.06);
  const squelchAmp = s.gain(0);
  squelchAmp.gain.setValueAtTime(FLOOR, wet);
  squelchAmp.gain.linearRampToValueAtTime(LEVEL.squelch, wet + 0.012);
  squelchAmp.gain.exponentialRampToValueAtTime(FLOOR, wet + 0.06);
  s.chain(squelch, squelchLow, squelchAmp, bus);

  // Brass rod rattle: two tiny, unequal high clicks.
  const rattles: readonly [number, number, number][] = [
    [0.025, 5400, 1],
    [0.041, 6900, 0.7],
  ];
  for (const [offset, freq, weight] of rattles) {
    const t = when + offset;
    const tick = s.noise('white', t, t + 0.02);
    const tickAmp = s.gain(0);
    burst(tickAmp.gain, t, LEVEL.rattle * weight, 0.006, 0.0004);
    s.chain(tick, s.filter('bandpass', freq * v.pitch, 2.5), tickAmp, bus);
  }
}

export interface HoldVoice {
  /** Fade the creak out over 40 ms starting at `at`, and stop its sources. */
  release(at: number): void;
}

/** Contact to lift: a faint spring compressing. Band-passed noise rising 300 -> 520 Hz. */
export function holdCreak(env: VoiceEnv, when: number): HoldVoice {
  const s = shot(env);
  const length = OFFICE_PRESS_TIMING.compressionMs / 1000;
  const endsAt = when + length + 0.06;

  // A separate release gain keeps the lift fade independent of the creak's own envelope.
  const release = s.gain(1);
  s.toOut(release);
  const envelope = s.gain(0);
  envelope.gain.setValueAtTime(FLOOR, when);
  envelope.gain.linearRampToValueAtTime(LEVEL.creak, when + 0.08);
  envelope.gain.setValueAtTime(LEVEL.creak, when + length - 0.1);
  envelope.gain.linearRampToValueAtTime(0, endsAt - 0.01);

  const src = s.noise('white', when, endsAt);
  const band = s.filter('bandpass', 300, 7);
  band.frequency.setValueAtTime(300, when);
  band.frequency.linearRampToValueAtTime(520, when + length);

  // Stick-slip: a sawtooth chops the noise, quickening as the spring tightens.
  const slip = s.gain(0.5);
  const lfo = s.osc('sawtooth', 17, when, endsAt);
  lfo.frequency.setValueAtTime(17, when);
  lfo.frequency.linearRampToValueAtTime(27, when + length);
  const depth = s.gain(0.5);
  s.chain(lfo, depth);
  depth.connect(slip.gain);

  s.chain(src, band, slip, envelope, release);

  const stoppables: readonly AudioScheduledSourceNode[] = [src, lfo];
  return {
    release(at) {
      if (at >= endsAt) return;
      release.gain.setValueAtTime(1, at);
      release.gain.linearRampToValueAtTime(0, at + 0.04);
      const stopAt = Math.min(at + 0.05, endsAt);
      for (const source of stoppables) source.stop(stopAt);
    },
  };
}

/** Lift: wet "tck", a short spring boing, and a paper rustle 35 ms behind them. */
export function peel(env: VoiceEnv, when: number): void {
  const s = shot(env);

  const tck = s.noise('white', when, when + 0.05);
  const tckAmp = s.gain(0);
  burst(tckAmp.gain, when, LEVEL.tck, 0.03, 0.001);
  s.chain(tck, s.filter('bandpass', 1800, 4), tckAmp);
  s.toOut(tckAmp);

  // Spring: 220 Hz with a 9 Hz vibrato, a small downward bend, 280 ms decay.
  const boing = s.osc('sine', 220, when, when + 0.32);
  boing.frequency.setValueAtTime(228, when);
  boing.frequency.exponentialRampToValueAtTime(214, when + 0.28);
  const vibrato = s.osc('sine', 9, when, when + 0.32);
  const vibratoDepth = s.gain(7);
  s.chain(vibrato, vibratoDepth);
  vibratoDepth.connect(boing.frequency);
  const boingAmp = s.gain(0);
  burst(boingAmp.gain, when, LEVEL.boing, 0.28, 0.004);
  s.chain(boing, boingAmp);
  s.toOut(boingAmp);

  const rustleAt = when + 0.035;
  const rustle = s.noise('white', rustleAt, rustleAt + 0.22);
  const rustleAmp = s.gain(0);
  swell(rustleAmp.gain, rustleAt, LEVEL.rustle, 0.04, 0.19);
  s.chain(rustle, s.filter('bandpass', 5000, 0.7), rustleAmp);
  s.toOut(rustleAmp);
}

/** Short, dry paper movement; no resonant pitched tail. */
function processingPaper(s: Shot, when: number, hz: number, length = 0.06): void {
  noiseHit(s, when, 'bandpass', hz, 0.8, LEVEL.processPaper, length);
}

function relay(s: Shot, when: number, hz: number, length = 0.035): void {
  noiseHit(s, when, 'bandpass', hz, 1.2, LEVEL.processRelay, length);
}

/** A filtered motor bed, always falling and ending rather than building anticipation. */
function roller(s: Shot, when: number, from: number, to: number, length: number): void {
  const src = s.noise('pink', when, when + length + 0.01);
  const low = s.filter('lowpass', from, 0.7);
  low.frequency.setValueAtTime(from, when);
  low.frequency.exponentialRampToValueAtTime(to, when + length);
  const amp = s.gain(0);
  swell(amp.gain, when, LEVEL.processMotor, 0.025, length);
  s.chain(src, low, amp);
  s.toOut(amp);
}

/**
 * Five material replies: competent feed, premature relay/reverse, unanswered clip, circular
 * feed and a stopped motor. The final three timbres repeat without growing or rewarding play.
 * All offsets are from the shared reply start; printMs still anchors the first settling knock.
 */
export function processing(env: VoiceEnv, when: number, step: number): void {
  const s = shot(env);
  const contact = (at: number, hz: number, peak: number = LEVEL.processContact): void => {
    fallingSine(s, at, hz, hz * 0.72, 0.045, peak, 0.07);
    noiseHit(s, at, 'bandpass', 850, 1.5, LEVEL.processPaper, 0.025);
  };
  switch (step) {
    case 1:
      contact(when, 190);
      processingPaper(s, when + 0.075, 1800, 0.04);
      roller(s, when + 0.15, 280, 250, 0.45);
      relay(s, when + 0.6, 1500);
      fallingSine(s, when + TIMING.printMs / 1000, 170, 100, 0.06, LEVEL.processWeight, 0.09);
      break;
    case 2:
      contact(when, 210);
      processingPaper(s, when + 0.06, 4200, 0.04);
      roller(s, when + 0.1, 280, 210, 0.25);
      relay(s, when + 0.3, 1600);
      roller(s, when + 0.42, 1000, 700, 0.12);
      processingPaper(s, when + 0.57, 3900);
      break;
    case 3:
      contact(when, 180, LEVEL.processContact * 0.7);
      contact(when + 0.055, 180, LEVEL.processContact * 0.7);
      processingPaper(s, when + 0.1, 2400, 0.12);
      // A quiet clip at the window; the following unanswered space carries the joke.
      noiseHit(s, when + 0.3, 'bandpass', 1900, 0.7, LEVEL.processRelay * 0.45, 0.035);
      break;
    case 4:
      contact(when, 160);
      for (const offset of [0.12, 0.23, 0.34]) processingPaper(s, when + offset, 3200, 0.035);
      relay(s, when + 0.56, 1300);
      break;
    case 5:
      relay(s, when, 950);
      relay(s, when + 0.18, 1050);
      roller(s, when + 0.3, 280, 80, 0.35);
      break;
    default: {
      const variant = (Math.max(6, step) - 6) % 3;
      const body = [165, 180, 195][variant] ?? 165;
      const paper = [2600, 3100, 3600][variant] ?? 2600;
      const tired = [1100, 1250, 1400][variant] ?? 1100;
      contact(when, body, LEVEL.processContact * 0.65);
      processingPaper(s, when + 0.08, paper);
      relay(s, when + 0.25, tired, 0.025);
    }
  }
}

/** Visitor-operated service bell only; never called by the completion cue handlers. */
export function serviceBell(env: VoiceEnv, when: number): void {
  const s = shot(env);
  for (const [ratio, weight, decay] of [[1, 1, 0.18], [2.76, 0.3, 0.1]] as const) {
    const tone = s.osc('sine', 1250 * ratio, when, when + decay + 0.03);
    const amp = s.gain(0);
    burst(amp.gain, when, LEVEL.serviceBell * weight, decay, 0.001);
    s.chain(tone, amp);
    s.toOut(amp);
  }
}

/** A band of noise with a short envelope: the building block of clacks and scrapes. */
function noiseHit(
  s: Shot,
  when: number,
  type: BiquadFilterType,
  freq: number,
  q: number,
  peak: number,
  decay: number,
): void {
  const src = s.noise('white', when, when + decay + 0.03);
  const amp = s.gain(0);
  burst(amp.gain, when, peak, decay, 0.0008);
  s.chain(src, s.filter(type, freq, q), amp);
  s.toOut(amp);
}

/** A sine that falls in pitch with a decaying envelope: thumps and latch bodies. */
function fallingSine(
  s: Shot,
  when: number,
  from: number,
  to: number,
  sweep: number,
  peak: number,
  decay: number,
): void {
  const tone = s.osc('sine', from, when, when + decay + 0.03);
  tone.frequency.setValueAtTime(from, when);
  tone.frequency.exponentialRampToValueAtTime(to, when + sweep);
  const amp = s.gain(0);
  burst(amp.gain, when, peak, decay, 0.002);
  s.chain(tone, amp);
  s.toOut(amp);
}

/**
 * The rear hatch: a heavy latch clack at `latchAt`, the panel swinging on its hinge, then the
 * damped weight and loose receipts as it lands at `landAt`.
 */
export function hatch(env: VoiceEnv, latchAt: number, landAt: number): void {
  const s = shot(env);

  noiseHit(s, latchAt, 'highpass', 1500, 0.7, LEVEL.latchClick, 0.014);
  fallingSine(s, latchAt, 130, 62, 0.05, LEVEL.latchBody, 0.08);

  // The panel scrapes down its hinge between the latch and the landing.
  const swingAt = latchAt + 0.05;
  const swingLength = Math.max(0.1, landAt - swingAt);
  const swing = s.noise('white', swingAt, swingAt + swingLength + 0.02);
  const swingBand = s.filter('bandpass', 700, 3);
  swingBand.frequency.setValueAtTime(700, swingAt);
  swingBand.frequency.exponentialRampToValueAtTime(1500, swingAt + swingLength);
  const swingAmp = s.gain(0);
  swingAmp.gain.setValueAtTime(FLOOR, swingAt);
  swingAmp.gain.exponentialRampToValueAtTime(LEVEL.swing, landAt - 0.02);
  swingAmp.gain.exponentialRampToValueAtTime(FLOOR, landAt + 0.01);
  s.chain(swing, swingBand, swingAmp);
  s.toOut(swingAmp);

  fallingSine(s, landAt, 95, 38, 0.14, LEVEL.fallThump, 0.22);
  noiseHit(s, landAt, 'bandpass', 800, 1, LEVEL.fallCrack, 0.03);
  for (const offset of [0.04, 0.1, 0.19]) processingPaper(s, landAt + offset, 2800, 0.06);
}

/** Stillness: the machine exhales. Lowpassed noise sweeping 900 -> 180 Hz over 1.4 s. */
export function exhale(env: VoiceEnv, when: number): void {
  const s = shot(env);
  const length = 1.4;
  const src = s.noise('pink', when, when + length + 0.05);
  const low = s.filter('lowpass', 900, 0.7);
  low.frequency.setValueAtTime(900, when);
  low.frequency.exponentialRampToValueAtTime(180, when + length);
  const amp = s.gain(0);
  swell(amp.gain, when, LEVEL.exhale, 0.25, length);
  s.chain(src, low, amp);
  s.toOut(amp);
}

/** One soft glass harmonic, A5 with a quiet octave above: the first hint of the Signal. */
export function glassHarmonic(env: VoiceEnv, when: number): void {
  const s = shot(env);
  const length = 2.2;
  const partials: readonly [number, number][] = [
    [880, 1],
    [1760, 0.18],
  ];
  for (const [freq, weight] of partials) {
    const tone = s.osc('sine', freq, when, when + length + 0.05);
    const amp = s.gain(0);
    burst(amp.gain, when, LEVEL.glass * weight, length, 0.012);
    s.chain(tone, amp);
    s.toOut(amp);
  }
}

/** The memo slides out: a slow swell and fade of 3 kHz paper over the length of the slide. */
export function memoSlide(env: VoiceEnv, when: number): void {
  const s = shot(env);
  const length = TIMING.memoSlideMs / 1000;
  const src = s.noise('white', when, when + length + 0.05);
  const band = s.filter('bandpass', 3000, 0.9);
  band.frequency.setValueAtTime(3300, when);
  band.frequency.exponentialRampToValueAtTime(2600, when + length);
  const amp = s.gain(0);
  swell(amp.gain, when, LEVEL.memoSlide, 0.5, length);
  s.chain(src, band, amp);
  s.toOut(amp);
}

/** Reset: a short, soft feed of fresh paper. */
export function paperFeed(env: VoiceEnv, when: number): void {
  const s = shot(env);
  const src = s.noise('white', when, when + 0.2);
  const amp = s.gain(0);
  amp.gain.setValueAtTime(FLOOR, when);
  amp.gain.linearRampToValueAtTime(LEVEL.paperFeed, when + 0.02);
  amp.gain.exponentialRampToValueAtTime(FLOOR, when + 0.16);
  s.chain(src, s.filter('bandpass', 4200, 0.9), amp);
  s.toOut(amp);
}

/** Picking the memo up or putting it down. Opening is a little longer and brighter. */
export function memoHandle(env: VoiceEnv, when: number, opening: boolean): void {
  const s = shot(env);
  const length = opening ? 0.12 : 0.08;
  const src = s.noise('white', when, when + length + 0.03);
  const amp = s.gain(0);
  swell(amp.gain, when, LEVEL.memoHandle, length * 0.3, length);
  s.chain(src, s.filter('bandpass', opening ? 3500 : 2600, 0.8), amp);
  s.toOut(amp);
}

export interface Ambience {
  /** Sources that never end by themselves; the desk stops them on dispose. */
  readonly sources: readonly AudioScheduledSourceNode[];
  readonly nodes: readonly AudioNode[];
  /** Machine resonance fades independently, leaving ventilation audible after the reveal. */
  readonly tone: GainNode;
}

/**
 * Office ventilation (lowpassed pink noise) and the Weight drone: D2 and A2 sines, each with a
 * whisper of its octave so it registers on small speakers, drifting +-3 cents on slow, unrelated
 * LFOs. Felt more than heard.
 */
export function startAmbience(
  ctx: BaseAudioContext,
  noise: NoiseBuffers,
  out: AudioNode,
  when: number,
): Ambience {
  const sources: AudioScheduledSourceNode[] = [];
  const nodes: AudioNode[] = [];

  const vent = ctx.createBufferSource();
  vent.buffer = noise.pink;
  vent.loop = true;
  vent.start(when);
  const ventLow = ctx.createBiquadFilter();
  ventLow.type = 'lowpass';
  ventLow.frequency.value = 380;
  ventLow.Q.value = 0.5;
  const ventGain = ctx.createGain();
  ventGain.gain.value = LEVEL.vent;
  vent.connect(ventLow);
  ventLow.connect(ventGain);
  ventGain.connect(out);
  sources.push(vent);
  nodes.push(vent, ventLow, ventGain);

  const toneBus = ctx.createGain();
  toneBus.gain.value = 1;
  toneBus.connect(out);
  nodes.push(toneBus);

  const drones: readonly { hz: number; weight: number; lfoHz: number }[] = [
    { hz: 73.42, weight: 1, lfoHz: 0.053 },
    { hz: 110, weight: 0.8, lfoHz: 0.071 },
  ];
  for (const drone of drones) {
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = drone.lfoHz;
    const drift = ctx.createGain();
    drift.gain.value = 3;
    lfo.connect(drift);
    lfo.start(when);
    sources.push(lfo);
    nodes.push(lfo, drift);

    for (const [ratio, weight] of [
      [1, 1],
      [2, 0.2],
    ] as const) {
      const tone = ctx.createOscillator();
      tone.type = 'sine';
      tone.frequency.value = drone.hz * ratio;
      const amp = ctx.createGain();
      amp.gain.value = LEVEL.drone * drone.weight * weight;
      drift.connect(tone.detune);
      tone.connect(amp);
      amp.connect(toneBus);
      tone.start(when);
      sources.push(tone);
      nodes.push(tone, amp);
    }
  }

  return { sources, nodes, tone: toneBus };
}

/** Small object voices share the gesture-unlocked desk and its disposal/epoch ownership. */
export function objectSound(env: VoiceEnv, when: number, kind: 'rubber' | 'paper' | 'metal' | 'wood' | 'cloth' | 'bell' | 'whisper'): void {
  if (kind === 'bell') { serviceBell(env, when); return; }
  if (kind === 'whisper') { officeWhisper(env, when); return; }
  const s = shot(env);
  const hz = { rubber: 650, paper: 3200, metal: 1900, wood: 480, cloth: 700 }[kind];
  noiseHit(s, when, 'bandpass', hz, .8, kind === 'cloth' ? .018 : .05, kind === 'paper' ? .12 : .06);
}

/** An unvoiced, synthetic five-word whisper. No recording, likeness or browser speech service. */
export function officeWhisper(env: VoiceEnv, when: number): void {
  const s = shot(env);
  // Breath bands articulate the authored syllables; the readable/captioned line carries the words.
  const syllables: readonly (readonly [number, number, number, number, number])[] = [
    [0, .29, 340, 900, 2200], [.36, .24, 480, 1350, 2050],
    [.7, .18, 760, 1250, 2400], [.86, .2, 310, 2000, 2700],
    [1.12, .18, 710, 1100, 2300], [1.43, .19, 470, 1320, 2050],
    [1.68, .19, 510, 1500, 2350],
  ];
  for (const [offset, length, first, second, third] of syllables) {
    for (const [hz, weight] of [[first, 1], [second, .55], [third, .24]] as const) {
      const at = when + offset;
      const breath = s.noise('white', at, at + length + .03);
      const amp = s.gain(0);
      swell(amp.gain, at, .055 * weight, .025, length);
      s.chain(breath, s.filter('bandpass', hz, 5), amp);
      s.toOut(amp);
    }
  }
}

/** One dry relay at the application lamp; no tone or celebratory tail. */
export function applicationRelay(env: VoiceEnv, when: number): void {
  const s = new Shot(env);
  relay(s, when, 1250, .025);
}
