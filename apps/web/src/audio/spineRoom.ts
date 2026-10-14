/**
 * The corridor's room: the long soft reverb every placed sound sits in, the room tone under
 * everything, and the schedule of far sounds (a radiator, a door, a pipe).
 *
 * Nothing here is tonal. The tone is broad low air with a slow breath; there is no hum, no
 * drone and no pitch to settle on. The far sounds are seeded, sparse and bounded, so the same
 * building always has the same night and never fills a silence.
 */
import { createPrng, type NoiseBuffers } from './noise.ts';

/** Level of each layer of the room tone: linear gains on unit-RMS-ish noise, before the master. */
export const TONE_LEVEL = {
  air: 0.015,
  body: 0.012,
  hiss: 0.0016,
  sub: 0.006,
} as const;

// The impulse ---------------------------------------------------------------------------------

export const IMPULSE_SECONDS = 2.6;

/** One-pole lowpass coefficient for cutoff `hz`. */
const onePole = (hz: number, rate: number): number => 1 - Math.exp((-2 * Math.PI * hz) / rate);

/**
 * A stereo impulse response for a long tiled corridor, synthesised once from seeded noise: a
 * handful of early reflections off walls, floor and ceiling, then a diffuse tail in four bands
 * that is long in the lows (about 2.4 s) and dies in the highs (about 0.35 s), as plaster and
 * terrazzo would leave it, and tilted dark, so the room is soft and never hisses. The channels
 * use different noise so the room is wide.
 *
 * Scaled so the room's gain across 250 Hz to 1 kHz averages 1 (a dry sound sent to it at 1 comes
 * back as loud as it went in, spread over the tail), which keeps a low thump from being swelled
 * by a room that is deep in the lows: unit total energy would have done that, by about 16 dB.
 */
export function createCorridorImpulse(ctx: BaseAudioContext, seed = 0xc0771d0): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.round(rate * IMPULSE_SECONDS);
  const buffer = ctx.createBuffer(2, length, rate);
  const rand = createPrng(seed);
  // Crossovers of two cascaded poles each (12 dB an octave), so the bands do not leak into one
  // another's decay: a shallower split lets the long lows prop up the highs' tail.
  const splits = [250, 1000, 4000].map((hz) => onePole(hz, rate));
  const weights = [1, 1.02, 1.02, 0.91];
  const decays = [2.4, 1.6, 0.8, 0.35];
  const decay = (seconds: number, t: number): number => Math.exp((-6.9078 * t) / seconds);
  // The tail begins after the first wall has been heard, and arrives over a few milliseconds.
  const tailStart = 0.014;
  const tailRise = 0.012;
  // Walls 3.2 m apart, a 3.8 m ceiling: reflections from the nearest surfaces come in the first
  // 60 ms. Each is [delay, left, right], as a multiple of the diffuse tail's level at its start.
  const early: readonly (readonly [number, number, number])[] = [
    [0.0093, 3.2, 1.2],
    [0.0124, 1.3, 2.4],
    [0.0186, 1.9, 0.8],
    [0.0219, 0.7, 1.8],
    [0.031, 1.3, 0.6],
    [0.044, 0.4, 0.9],
    [0.058, 0.7, 0.3],
  ];

  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    const poles = splits.map(() => [0, 0] as [number, number]);
    // Energy of the 250 Hz to 1 kHz band on its own: it sets the room's gain at the mids.
    let mids = 0;
    for (let i = 0; i < length; i += 1) {
      const t = i / rate;
      const white = rand() * 2 - 1;
      // The noise lowpassed at each crossover, then the whole of it: each band is the step between neighbours.
      const upTo = [
        ...poles.map((state, k) => {
          const a = splits[k] ?? 0;
          state[0] += a * (white - state[0]);
          state[1] += a * (state[0] - state[1]);
          return state[1];
        }),
        white,
      ];
      let below = 0;
      let sum = 0;
      upTo.forEach((level, band) => {
        const part = (level - below) * (weights[band] ?? 0) * decay(decays[band] ?? 1, t);
        if (band === 1) mids += part * part;
        sum += part;
        below = level;
      });
      const rise = Math.min(1, Math.max(0, (t - tailStart) / tailRise));
      data[i] = sum * rise;
    }
    // A band of width B Hz holding energy E has a gain of E * (rate / 2) / B, squared, across it.
    const midGain = (mids * (rate / 2)) / 750;
    const scale = midGain > 0 ? 1 / Math.sqrt(midGain) : 1;
    for (let i = 0; i < length; i += 1) data[i] = (data[i] ?? 0) * scale;

    // The first reflections stand clear of the diffuse onset by a few decibels.
    const from = Math.round((tailStart + tailRise) * rate);
    const to = Math.round((tailStart + tailRise + 0.04) * rate);
    let onset = 0;
    for (let i = from; i < to; i += 1) onset += (data[i] ?? 0) ** 2;
    const level = Math.sqrt(onset / Math.max(1, to - from));
    for (const [delay, left, right] of early) {
      const index = Math.round(delay * rate);
      if (index < length) data[index] = (data[index] ?? 0) + (channel === 0 ? left : right) * level * (rand() < 0.5 ? -1 : 1);
    }
  }
  return buffer;
}

// The tone ------------------------------------------------------------------------------------

export interface CorridorTone {
  /** Sources that never end by themselves; the owner stops them on dispose. */
  readonly sources: readonly AudioScheduledSourceNode[];
  readonly nodes: readonly AudioNode[];
}

/**
 * Broad low air in a large old building at night. Two decorrelated readers of the shared pink
 * noise, panned apart, make the air itself; a slower, lower band breathes on a 23 s cycle; a
 * very faint high band is the plant's far ventilation, on a 15 s cycle; and a sub rumble sits
 * under both. The breath modulates amplitude only: there is no oscillator at audio rate, so
 * nothing can become a hum.
 */
export function startCorridorTone(
  ctx: BaseAudioContext,
  noise: NoiseBuffers,
  out: AudioNode,
  when: number,
  rand: () => number,
): CorridorTone {
  const sources: AudioScheduledSourceNode[] = [];
  const nodes: AudioNode[] = [];

  const reader = (rate: number): AudioBufferSourceNode => {
    const node = ctx.createBufferSource();
    node.buffer = noise.pink;
    node.loop = true;
    node.playbackRate.value = rate;
    node.start(when, rand() * 1.9);
    sources.push(node);
    nodes.push(node);
    return node;
  };
  const filter = (type: BiquadFilterType, hz: number, q: number): BiquadFilterNode => {
    const node = ctx.createBiquadFilter();
    node.type = type;
    node.frequency.value = hz;
    node.Q.value = q;
    nodes.push(node);
    return node;
  };
  const gain = (value: number): GainNode => {
    const node = ctx.createGain();
    node.gain.value = value;
    nodes.push(node);
    return node;
  };
  const place = (pan: number): AudioNode => {
    if (typeof ctx.createStereoPanner !== 'function') return out;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(out);
    nodes.push(panner);
    return panner;
  };
  /** A sine far below hearing's pitch range that moves a gain: the building breathing. */
  const breathe = (target: GainNode, hz: number, depth: number): void => {
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = hz;
    const swing = gain(depth);
    lfo.connect(swing);
    swing.connect(target.gain);
    lfo.start(when);
    sources.push(lfo);
    nodes.push(lfo);
  };
  const connect = (...chain: AudioNode[]): void => {
    for (let i = 0; i + 1 < chain.length; i += 1) chain[i]?.connect(chain[i + 1] as AudioNode);
  };

  for (const [rate, pan] of [[0.97, -0.55], [1.03, 0.55]] as const) {
    connect(reader(rate), filter('highpass', 90, 0.5), filter('lowpass', 650, 0.4), gain(TONE_LEVEL.air), place(pan));
  }

  const body = gain(TONE_LEVEL.body * 0.65);
  connect(reader(0.83), filter('bandpass', 170, 0.6), body, place(0));
  breathe(body, 0.043, TONE_LEVEL.body * 0.35);

  const hiss = gain(TONE_LEVEL.hiss * 0.6);
  connect(reader(1.1), filter('highpass', 1800, 0.7), filter('lowpass', 5200, 0.7), hiss, place(0.2));
  breathe(hiss, 0.067, TONE_LEVEL.hiss * 0.4);

  connect(reader(0.6), filter('bandpass', 55, 0.8), gain(TONE_LEVEL.sub), place(0));

  return { sources, nodes };
}

// The far sounds ------------------------------------------------------------------------------

export type FarKind = 'radiator' | 'door' | 'pipe';

export interface FarEvent {
  readonly at: number;
  readonly kind: FarKind;
  /** Where in the stereo field. A radiator's ticks all share one position. */
  readonly pan: number;
  /** For a radiator tick: how hard that tick is, 0..1. */
  readonly level: number;
}

/** A group of radiator ticks every 55 to 140 s; a far door or pipe every 100 to 260 s. */
const GROUP_GAP_S = [55, 140] as const;
const GROUP_FIRST_S = [12, 30] as const;
const FAR_GAP_S = [100, 260] as const;
const FAR_FIRST_S = [50, 110] as const;
/** Anything scheduled this far behind the clock belongs to a room the visitor was not in. */
const STALE_S = 2;
const MAX_PER_TAKE = 24;

/**
 * The night's schedule of far sounds, drawn from two independent seeded streams, so the same
 * building has the same night whatever the cadence of the calls that ask for it. Sparse by
 * construction (a radiator group every minute or two, a far door or pipe every few minutes),
 * spaced, and bounded in the work done per call.
 * After a stretch in another room the schedule resumes from the present rather than playing
 * catch-up.
 */
export class FarEvents {
  private readonly groupRand: () => number;
  private readonly farRand: () => number;
  /** When the next radiator group and the next far door or pipe begin; -Infinity until first asked. */
  private nextGroupAt = Number.NEGATIVE_INFINITY;
  private nextFarAt = Number.NEGATIVE_INFINITY;

  constructor(seed: number) {
    this.groupRand = createPrng(seed ^ 0x1);
    this.farRand = createPrng(seed ^ 0x2);
  }

  /** The events that begin in `[now, now + horizon]` and have not been returned before. */
  take(now: number, horizon: number): FarEvent[] {
    const until = now + horizon;
    const events: FarEvent[] = [];
    if (this.nextGroupAt < now - STALE_S) {
      this.nextGroupAt = now + between(this.groupRand, GROUP_FIRST_S);
    }
    if (this.nextFarAt < now - STALE_S) {
      this.nextFarAt = now + between(this.farRand, FAR_FIRST_S);
    }

    while (this.nextGroupAt <= until && events.length < MAX_PER_TAKE) {
      const rand = this.groupRand;
      const count = 3 + Math.floor(rand() * 4);
      const pan = (rand() * 2 - 1) * 0.8;
      let at = this.nextGroupAt;
      for (let i = 0; i < count; i += 1) {
        // The iron cools: each tick is a little softer and a little further from the last.
        events.push({ at, kind: 'radiator', pan, level: (1 - 0.14 * i) * (0.75 + 0.25 * rand()) });
        at += (0.45 + 0.28 * i) * (0.85 + 0.3 * rand());
      }
      this.nextGroupAt = at + between(rand, GROUP_GAP_S);
    }

    while (this.nextFarAt <= until && events.length < MAX_PER_TAKE) {
      const rand = this.farRand;
      const at = this.nextFarAt;
      const kind: FarKind = rand() < 0.6 ? 'door' : 'pipe';
      const side = rand() < 0.5 ? -1 : 1;
      events.push({ at, kind, pan: side * (0.45 + 0.4 * rand()), level: 1 });
      this.nextFarAt = at + between(rand, FAR_GAP_S);
    }

    return events.sort((a, b) => a.at - b.at);
  }
}

function between(rand: () => number, range: readonly [number, number]): number {
  return range[0] + rand() * (range[1] - range[0]);
}
