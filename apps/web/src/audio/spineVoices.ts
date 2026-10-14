/**
 * Synthesis recipes for the corridor: footsteps, door mechanisms, the notice board and the far
 * sounds of a large building at night. Same craft as `voices.ts`: each function schedules one
 * sound at an absolute `AudioContext` time, every source has an explicit stop time, and the
 * graph disconnects itself when its last source has ended.
 *
 * Unlike the Office, nothing here is a toy and nothing is rewarded. These are the sounds of a
 * building: close ones are dry, far ones are dark and sit in a long soft room, and none of them
 * is pitched or rises. Every voice is placed (`Placement`): where it is across the stereo field,
 * how much of it is direct and how much is the room, and how much air it has crossed.
 *
 * Levels live in `SPINE_LEVEL`, linear gains at the voice's output before placement and the
 * master. The loudest corridor sound (a latch) stays more than 15 dB under the stamp.
 */
import { NOISE_SECONDS } from './noise.ts';
import { FLOOR, type VoiceEnv } from './voices.ts';
import { swingVelocity, type AirProfile, type Closure, type DoorFeel } from './spineDoors.ts';

export const SPINE_LEVEL = {
  stepTap: 0.05,
  stepBody: 0.0068,
  stepClick: 0.011,
  stepToe: 0.02,
  stepToeBody: 0.003,
  stepScuff: 0.007,
  handleRub: 0.04,
  handleTick: 0.055,
  latchClick: 0.4,
  latchBody: 0.03,
  latchRing: 0.012,
  swingAir: 0.008,
  creak: 0.012,
  groan: 0.012,
  chamberAir: 0.008,
  chamberHum: 0.0016,
  rattleKnock: 0.05,
  rattleTick: 0.045,
  rattleLink: 0.06,
  paper: 0.03,
  felt: 0.005,
  pin: 0.02,
  radiator: 0.012,
  farDoor: 0.02,
  farPipe: 0.018,
} as const;

/** Where a voice sits. Pan is -1 left .. 1 right; dry and wet are linear gains. */
export interface Placement {
  readonly pan: number;
  /** The direct sound. */
  readonly dry: number;
  /** The send to the corridor's room. */
  readonly wet: number;
  /** Distance: air takes the top end off. Omit for a close sound. */
  readonly lowpass?: number;
}

export interface SpineEnv extends VoiceEnv {
  /** Input of the corridor's reverb, or null when the platform has none. */
  readonly send: AudioNode | null;
}

/**
 * One self-cleaning node graph with a placement hung off its output. It mirrors `Shot` in
 * `voices.ts`, which keeps its node list private, and adds the pan and the dry/wet split so
 * nothing about a voice's position is left to the caller.
 */
export class SpineShot {
  private readonly nodes: AudioNode[] = [];
  private pending = 0;
  private readonly done: () => void;
  private mix: AudioNode | null = null;

  constructor(
    private readonly env: SpineEnv,
    private readonly place: Placement,
  ) {
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

  noise(kind: 'white' | 'pink', when: number, stopAt: number): AudioBufferSourceNode {
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

  chain<T extends AudioNode>(first: AudioNode, ...rest: [...AudioNode[], T]): T {
    let previous = first;
    for (const node of rest) {
      previous.connect(node);
      previous = node;
    }
    return previous as T;
  }

  /** What every layer feeds. The placement is built on first use and ends at the dry bus and the send. */
  get bus(): AudioNode {
    if (this.mix !== null) return this.mix;
    const { ctx, out, send } = this.env;
    const mix = this.gain(1);
    let tail: AudioNode = mix;
    if (this.place.lowpass !== undefined) {
      const air = this.filter('lowpass', this.place.lowpass, 0.5);
      tail.connect(air);
      tail = air;
    }
    // Always through a panner when there is one, so every voice shares the same equal-power law
    // and a centred sound is not 3 dB hotter than a placed one.
    if (typeof ctx.createStereoPanner === 'function') {
      const panner = this.track(ctx.createStereoPanner());
      panner.pan.value = this.place.pan;
      tail.connect(panner);
      tail = panner;
    }
    const dry = this.gain(this.place.dry);
    tail.connect(dry);
    dry.connect(out);
    if (send !== null && this.place.wet > 0) {
      const wet = this.gain(this.place.wet);
      tail.connect(wet);
      wet.connect(send);
    }
    this.mix = mix;
    return mix;
  }
}

// Envelope shapes ---------------------------------------------------------------------------

/** Near-instant attack, exponential fall to the floor at `when + attack + decay`. */
function burst(param: AudioParam, when: number, peak: number, decay: number, attack = 0.0012): void {
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

/** A level that follows `curve` (0..1 samples, equal steps in time) across `length`. */
function follow(param: AudioParam, when: number, length: number, peak: number, curve: readonly number[], power = 1): void {
  param.setValueAtTime(FLOOR, when);
  curve.forEach((v, i) => {
    param.linearRampToValueAtTime(Math.max(FLOOR, peak * v ** power), when + (length * i) / Math.max(1, curve.length - 1));
  });
}

/** Piecewise-linear level through [seconds after `when`, fraction of `peak`] points. */
function through(param: AudioParam, when: number, peak: number, points: readonly (readonly [number, number])[]): void {
  param.setValueAtTime(FLOOR, when);
  for (const [t, v] of points) param.linearRampToValueAtTime(Math.max(FLOOR, peak * v), when + t);
}

const spread = (rand: () => number, amount: number): number => 1 + (rand() * 2 - 1) * amount;

// Building blocks ---------------------------------------------------------------------------

/** A click: a few milliseconds of noise through one filter. */
function hit(
  s: SpineShot,
  out: AudioNode,
  when: number,
  type: BiquadFilterType,
  frequency: number,
  q: number,
  peak: number,
  decay: number,
  attack = 0.0008,
): void {
  const src = s.noise('white', when, when + attack + decay + 0.02);
  const amp = s.gain(0);
  burst(amp.gain, when, peak, decay, attack);
  s.chain(src, s.filter(type, frequency, q), amp);
  amp.connect(out);
}

/** Weight: a sine that falls from `from` to `to` over `glide` and dies away by `decay`. */
function thud(s: SpineShot, out: AudioNode, when: number, from: number, to: number, glide: number, peak: number, decay: number): void {
  const tone = s.osc('sine', from, when, when + decay + 0.03);
  tone.frequency.setValueAtTime(from, when);
  tone.frequency.exponentialRampToValueAtTime(to, when + glide);
  const amp = s.gain(0);
  burst(amp.gain, when, peak, decay, 0.002);
  s.chain(tone, amp);
  amp.connect(out);
}

/** A short metallic ring: one sine that stops by `decay`. Used for material, never for pitch. */
function ring(s: SpineShot, out: AudioNode, when: number, frequency: number, peak: number, decay: number): void {
  const tone = s.osc('sine', frequency, when, when + decay + 0.02);
  const amp = s.gain(0);
  burst(amp.gain, when, peak, decay, 0.0008);
  s.chain(tone, amp);
  amp.connect(out);
}

/** Noise through a bandpass that slides from `from` to `to`, swelling and settling over `length`. */
function rub(
  s: SpineShot,
  out: AudioNode,
  when: number,
  length: number,
  from: number,
  to: number,
  q: number,
  peak: number,
  rise = 0.35,
): void {
  const src = s.noise('white', when, when + length + 0.03);
  const band = s.filter('bandpass', from, q);
  band.frequency.setValueAtTime(from, when);
  band.frequency.linearRampToValueAtTime(to, when + length);
  const amp = s.gain(0);
  swell(amp.gain, when, peak, length * rise, length);
  s.chain(src, band, amp);
  amp.connect(out);
}

// Footsteps ---------------------------------------------------------------------------------

export interface StepVoice {
  /** Silence the step from `at`. Only for a step that has not started: it is a gate, not a fade. */
  withdraw(at: number): void;
}

/**
 * One footstep on terrazzo in soft soles: a heel that lands with a short dull tap and the body
 * of the shoe on stone, then the ball of the foot a beat behind it, softer. The feet differ a
 * little in weight and brightness, and every step differs from the last by small seeded
 * amounts, so a walk never machine-guns.
 */
export function footstep(env: SpineEnv, when: number, step: { foot: 0 | 1; weight: number }, place: Placement): StepVoice {
  const s = new SpineShot(env, place);
  const gate = s.gain(1);
  gate.connect(s.bus);
  const rand = env.rand;
  const pitch = spread(rand, 0.04);
  const level = step.weight * 10 ** (((rand() * 2 - 1) * 0.9) / 20);
  const gap = 0.075 + (rand() * 2 - 1) * 0.012;
  // The right shoe is a touch brighter and lighter than the left.
  const tilt = step.foot === 0 ? 0.95 : 1.06;
  const weight = level * (step.foot === 0 ? 1.04 : 0.96);

  // Heel: a dull tap (soft sole, so the top is gone by 3 kHz), the shoe's body on the slab,
  // and a trace of the stone's hardness.
  hit(s, gate, when, 'bandpass', 1300 * pitch * tilt, 0.9, SPINE_LEVEL.stepTap * weight, 0.03, 0.001);
  thud(s, gate, when, 175 * pitch * tilt, 92 * pitch, 0.045, SPINE_LEVEL.stepBody * weight, 0.085);
  hit(s, gate, when, 'highpass', 2400 * pitch, 0.7, SPINE_LEVEL.stepClick * weight, 0.005, 0.0004);

  // Ball of the foot rolling down.
  const toeAt = when + gap;
  hit(s, gate, toeAt, 'bandpass', 800 * pitch * tilt, 0.8, SPINE_LEVEL.stepToe * weight, 0.026, 0.002);
  thud(s, gate, toeAt, 125 * pitch, 86 * pitch, 0.03, SPINE_LEVEL.stepToeBody * weight, 0.05);

  // Sole texture on some steps: a breath of grit just before the heel.
  if (rand() < 0.4) {
    const scuffAt = when - 0.035;
    const scuff = s.noise('white', scuffAt, scuffAt + 0.06);
    const scuffAmp = s.gain(0);
    swell(scuffAmp.gain, scuffAt, SPINE_LEVEL.stepScuff * weight, 0.02, 0.05);
    s.chain(scuff, s.filter('bandpass', 3200, 0.7), scuffAmp);
    scuffAmp.connect(gate);
  }

  return {
    withdraw(at) {
      gate.gain.cancelScheduledValues(at);
      gate.gain.setValueAtTime(0, at);
    },
  };
}

// Doors: opening ----------------------------------------------------------------------------

/**
 * The handle turning over `length`: the mechanism, not the hand. A lever rubs on its spindle and
 * meets its stop; a knob rolls; a wheel ratchets; a ring lifts and chinks; a plate is pressed.
 */
export function handleTurn(env: SpineEnv, when: number, feel: DoorFeel, length: number, place: Placement): void {
  const s = new SpineShot(env, place);
  const out = s.bus;
  const rand = env.rand;
  const pitch = spread(rand, 0.04);
  switch (feel.handle) {
    case 'lever':
      rub(s, out, when, length, 1500 * pitch, 2400 * pitch, 2.2, SPINE_LEVEL.handleRub);
      hit(s, out, when, 'bandpass', 1100 * pitch, 3, SPINE_LEVEL.handleTick, 0.01);
      hit(s, out, when + length - 0.006, 'bandpass', 2000 * pitch, 4, SPINE_LEVEL.handleTick * 1.1, 0.008);
      break;
    case 'knob':
      rub(s, out, when, length, 900 * pitch, 1300 * pitch, 1.2, SPINE_LEVEL.handleRub * 0.9, 0.5);
      hit(s, out, when + length * 0.3, 'bandpass', 1400 * pitch, 3, SPINE_LEVEL.handleTick * 0.5, 0.01);
      break;
    case 'wheel':
      rub(s, out, when, length, 380 * pitch, 520 * pitch, 1.5, SPINE_LEVEL.handleRub);
      for (let i = 0; i < 4; i += 1) {
        hit(s, out, when + (length * (i + 0.5)) / 4, 'bandpass', 1800 * pitch, 5, SPINE_LEVEL.handleTick * 0.9, 0.006);
      }
      break;
    case 'ring-pull':
      for (const [offset, weight] of [[0, 1], [0.035, 0.7], [0.075, 0.45]] as const) {
        hit(s, out, when + offset, 'bandpass', 4200 * pitch, 6, SPINE_LEVEL.handleTick * weight, 0.02);
        ring(s, out, when + offset, 4100 * pitch, SPINE_LEVEL.latchRing * 0.5 * weight, 0.03);
      }
      break;
    case 'push-plate':
      hit(s, out, when, 'bandpass', 700 * pitch, 1, SPINE_LEVEL.handleTick * 1.2, 0.02, 0.002);
      thud(s, out, when, 160 * pitch, 110, 0.03, SPINE_LEVEL.latchBody * 0.3, 0.05);
      break;
  }
}

/**
 * The latch lets go. The tongue clears the keeper with a click, the leaf takes up the load with
 * a dull knock in its own body, and a metal door adds a hard, very short ring. The knock is
 * noise and a falling sine, never a held note.
 */
export function latchRelease(env: SpineEnv, when: number, feel: DoorFeel, place: Placement): void {
  const s = new SpineShot(env, place);
  const out = s.bus;
  const rand = env.rand;
  const pitch = spread(rand, 0.03);
  const weight = feel.latchWeight;

  hit(s, out, when - 0.004, 'bandpass', feel.latchHz * 0.6 * pitch, 2, SPINE_LEVEL.latchClick * 0.5 * weight, 0.012);
  hit(s, out, when, 'bandpass', feel.latchHz * pitch, 3, SPINE_LEVEL.latchClick * weight, 0.006);
  thud(s, out, when, feel.bodyHz * 1.1 * pitch, feel.bodyHz * 0.62, 0.04, SPINE_LEVEL.latchBody * weight, Math.max(0.05, feel.bodyDecay * 0.7));

  if (feel.metal > 0.5) {
    // Inharmonic and over in a few hundredths of a second: it reads as brass and steel, not as a note.
    ring(s, out, when, 2950 * pitch, SPINE_LEVEL.latchRing * feel.metal, 0.018);
    ring(s, out, when, 6850 * pitch, SPINE_LEVEL.latchRing * 0.5 * feel.metal, 0.01);
  } else {
    hit(s, out, when + 0.002, 'bandpass', 450 * pitch, 3, SPINE_LEVEL.latchClick * 0.25 * (1 - feel.metal), 0.03);
  }
  if (feel.glass > 0) {
    const buzz = s.noise('white', when + 0.01, when + 0.09);
    const buzzAmp = s.gain(0);
    swell(buzzAmp.gain, when + 0.01, SPINE_LEVEL.latchRing * 0.4 * feel.glass, 0.015, 0.07);
    s.chain(buzz, s.filter('bandpass', 3400, 4), buzzAmp);
    buzzAmp.connect(out);
  }
}

/**
 * A leaf swinging on its hinges for `length`. Air, friction and strain all follow the speed of
 * the swing (`swingVelocity`), so the loudest moment is the fastest, and a leaf that is still
 * settling at the end is silent. `soft` scales a door that is being closed with care.
 */
export function hingeSwing(env: SpineEnv, when: number, feel: DoorFeel, length: number, soft: number, place: Placement): void {
  const s = new SpineShot(env, place);
  const out = s.bus;
  const rand = env.rand;
  const curve = swingVelocity(16);
  const end = when + length + 0.03;

  // Air pushed ahead of the leaf: pink noise, lowpassed lower for a bigger door.
  const air = s.noise('pink', when, end);
  const airAmp = s.gain(0);
  follow(airAmp.gain, when, length, SPINE_LEVEL.swingAir * feel.airWeight * soft, curve);
  s.chain(air, s.filter('highpass', 70, 0.5), s.filter('lowpass', feel.airHz, 0.4), airAmp);
  airAmp.connect(out);

  // Hinge friction: a narrow band of noise whose centre rises with speed, chopped by stick-slip.
  if (feel.creak > 0) {
    const scrape = s.noise('white', when, end);
    const band = s.filter('bandpass', 700, 9);
    const low = 650 * spread(rand, 0.08);
    const high = low * 2.2;
    band.frequency.setValueAtTime(low, when);
    curve.forEach((v, i) => {
      band.frequency.linearRampToValueAtTime(low + (high - low) * v, when + (length * i) / (curve.length - 1));
    });
    const slip = s.gain(0.5);
    const chop = s.osc('sawtooth', 22, when, end);
    chop.frequency.setValueAtTime(22, when);
    chop.frequency.linearRampToValueAtTime(34, when + length * 0.45);
    chop.frequency.linearRampToValueAtTime(20, when + length);
    const depth = s.gain(0.5);
    s.chain(chop, depth);
    depth.connect(slip.gain);
    const amp = s.gain(0);
    follow(amp.gain, when, length, SPINE_LEVEL.creak * feel.creak * soft, curve, 1.5);
    s.chain(scrape, band, slip, amp);
    amp.connect(out);
  }

  // Strain on a heavy leaf: low and broad, felt as much as heard.
  if (feel.groan > 0.05) {
    const strain = s.noise('pink', when, end);
    const amp = s.gain(0);
    follow(amp.gain, when, length, SPINE_LEVEL.groan * feel.groan * soft, curve);
    s.chain(strain, s.filter('bandpass', 105, 1.6), amp);
    amp.connect(out);
  }
}

/**
 * The chamber's own air arriving through the open door as the camera walks in: a swell of its
 * room tone over `rise`, held a moment, then released by the time the real ambience has taken
 * over (the room crossfade starts as the threshold completes). Bounded, so a chamber that is
 * slow to load never leaves a hanging bed behind.
 */
export function chamberAir(env: SpineEnv, when: number, profile: AirProfile, rise: number, place: Placement): void {
  const s = new SpineShot(env, place);
  const out = s.bus;
  const end = when + rise + 1.9;
  const shape: readonly (readonly [number, number])[] = [
    [rise * 0.5, 0.12],
    [rise, 1],
    [rise + 0.5, 0.85],
    [rise + 1.8, 0],
  ];

  const air = s.noise('pink', when, end);
  const airAmp = s.gain(0);
  through(airAmp.gain, when, SPINE_LEVEL.chamberAir * profile.level, shape);
  s.chain(air, s.filter('highpass', 60, 0.5), s.filter('lowpass', profile.lowpass, 0.5), airAmp);
  airAmp.connect(out);

  for (const [hz, weight] of profile.hum) {
    const tone = s.osc('sine', hz, when, end);
    const amp = s.gain(0);
    through(amp.gain, when, SPINE_LEVEL.chamberHum * profile.level * weight, shape);
    s.chain(tone, amp);
    amp.connect(out);
  }
}

// Doors: sealed -----------------------------------------------------------------------------

/** The handle tried and meeting the lock: a short press, no turn. */
function handlePress(s: SpineShot, out: AudioNode, when: number, feel: DoorFeel, pitch: number): void {
  hit(s, out, when, 'bandpass', 1200 * pitch, 3, SPINE_LEVEL.handleTick, 0.012);
  rub(s, out, when, 0.06, 1400 * pitch, 1900 * pitch, 2.2, SPINE_LEVEL.handleRub * 0.8);
  if (feel.handle === 'wheel') {
    for (let i = 0; i < 3; i += 1) {
      hit(s, out, when + 0.02 + i * 0.03, 'bandpass', 1800 * pitch, 5, SPINE_LEVEL.handleTick * 0.8, 0.006);
    }
  }
}

/** A knock of the leaf in its frame: the body, plus a dull click of wood or metal on its stop. */
function frameKnock(s: SpineShot, out: AudioNode, when: number, feel: DoorFeel, weight: number, pitch: number): void {
  thud(s, out, when, feel.bodyHz * 0.95 * pitch, feel.bodyHz * 0.6, 0.03, SPINE_LEVEL.rattleKnock * weight, Math.max(0.06, feel.bodyDecay * 0.75));
  hit(s, out, when, 'bandpass', (350 + 700 * feel.metal) * pitch, 1.2, SPINE_LEVEL.rattleTick * 0.9 * weight, 0.014);
}

const RATTLE_TRIM: Record<Closure, number> = { bolt: 1.4, chain: 1.4, seal: 1, padlock: 1.3 };

/**
 * A sealed door tried over `length`. What it sounds like depends on what holds it: a bolt
 * catches in its keeper and the leaf knocks in the frame; a chain pulls taut and its links
 * scatter; a pressure seal stops the wheel dead and creaks; a padlock's shackle chatters. It
 * says no, flatly. Nothing here rings on, and nothing falls into a pitch.
 */
export function sealedRattle(env: SpineEnv, when: number, feel: DoorFeel, closure: Closure, length: number, place: Placement): void {
  // Each closure is voiced to land at the same loudness, a flat "no" and not a louder one for a chain.
  const trim = RATTLE_TRIM[closure];
  const s = new SpineShot(env, { ...place, dry: place.dry * trim, wet: place.wet * trim });
  const out = s.bus;
  const rand = env.rand;
  const pitch = spread(rand, 0.04);
  const at = (fraction: number): number => when + length * fraction;

  handlePress(s, out, when, feel, pitch);

  switch (closure) {
    case 'bolt': {
      hit(s, out, at(0.17), 'bandpass', feel.latchHz * 0.8 * pitch, 4, SPINE_LEVEL.rattleTick, 0.008);
      frameKnock(s, out, at(0.17), feel, 0.6, pitch);
      for (const [fraction, weight] of [[0.34, 1], [0.55, 0.6], [0.79, 0.35]] as const) {
        frameKnock(s, out, at(fraction), feel, weight, pitch * spread(rand, 0.03));
      }
      break;
    }
    case 'chain': {
      // The chain comes taut across the leaves, slackens and scatters its links.
      frameKnock(s, out, at(0.1), feel, 0.8, pitch);
      hit(s, out, at(0.1), 'bandpass', 1800 * pitch, 1.5, SPINE_LEVEL.rattleTick * 0.8, 0.02);
      frameKnock(s, out, at(0.4), feel, 0.4, pitch);
      const links = 18;
      for (let i = 0; i < links; i += 1) {
        const fraction = 0.06 + 0.84 * (i / links) ** 0.8 + rand() * 0.015;
        const weight = (1 - 0.65 * (i / links)) * (0.5 + 0.5 * rand());
        hit(s, out, at(fraction), 'bandpass', (1800 + 3600 * rand()) * pitch, 6, SPINE_LEVEL.rattleLink * weight, 0.014);
      }
      break;
    }
    case 'seal': {
      // The wheel turns a little and stops against the stop; the seal creaks and the rivets answer.
      frameKnock(s, out, at(0.26), feel, 1, pitch);
      for (const [ratio, weight, decay] of [[2.2, 1, 0.12], [6.1, 0.45, 0.06], [11.4, 0.2, 0.035]] as const) {
        ring(s, out, at(0.26), feel.bodyHz * ratio * pitch, SPINE_LEVEL.latchRing * 0.8 * weight * feel.metal, decay);
      }
      rub(s, out, at(0.33), length * 0.3, 760 * pitch, 460 * pitch, 4, SPINE_LEVEL.creak * 1.4, 0.4);
      hit(s, out, at(0.55), 'bandpass', 1100 * pitch, 8, SPINE_LEVEL.rattleTick * 0.4, 0.02);
      hit(s, out, at(0.74), 'bandpass', 1300 * pitch, 8, SPINE_LEVEL.rattleTick * 0.25, 0.02);
      break;
    }
    case 'padlock': {
      frameKnock(s, out, at(0.12), feel, 0.5, pitch);
      const tinks = 7;
      for (let i = 0; i < tinks; i += 1) {
        const f = (3200 + 1600 * rand()) * pitch;
        const weight = 1 - (0.8 * i) / tinks;
        hit(s, out, at(0.08 + 0.8 * (i / tinks) + rand() * 0.02), 'bandpass', f, 7, SPINE_LEVEL.rattleTick * 0.7 * weight, 0.03);
      }
      frameKnock(s, out, at(0.45), feel, 0.3, pitch);
      break;
    }
  }
}

// Doors: closing ----------------------------------------------------------------------------

/**
 * The door closing softly over `length`: air and a little hinge at the speed of the swing, then
 * the latch tongue sliding over its keeper and dropping in with a quiet click and a damped knock
 * at the very end. A door closed with care; it never slams.
 */
export function doorClose(env: SpineEnv, when: number, feel: DoorFeel, length: number, place: Placement): void {
  hingeSwing(env, when, feel, length, 0.7, place);
  const s = new SpineShot(env, place);
  const out = s.bus;
  const pitch = spread(env.rand, 0.03);
  const at = when + length - 0.012;
  hit(s, out, at - 0.006, 'bandpass', feel.latchHz * 0.7 * pitch, 2, SPINE_LEVEL.latchClick * 0.3 * feel.latchWeight, 0.01);
  hit(s, out, at, 'bandpass', feel.latchHz * 0.9 * pitch, 3, SPINE_LEVEL.latchClick * 0.5 * feel.latchWeight, 0.007);
  thud(s, out, at, feel.bodyHz * 0.9 * pitch, feel.bodyHz * 0.55, 0.04, SPINE_LEVEL.latchBody * 0.4 * feel.latchWeight, Math.max(0.05, feel.bodyDecay * 0.5));
}

// The board ---------------------------------------------------------------------------------

/**
 * The notice board: paper stirring on felt and a pin or two. Opening is a little longer;
 * closing is a settling. Both are barely there, an acknowledgement and not a cue.
 */
export function board(env: SpineEnv, when: number, opening: boolean, place: Placement): void {
  const s = new SpineShot(env, place);
  const out = s.bus;
  const rand = env.rand;
  const length = opening ? 0.5 : 0.3;
  const grains = opening ? 9 : 5;

  for (let i = 0; i < grains; i += 1) {
    const t = when + 0.02 + (length - 0.08) * (i / grains) + rand() * 0.03;
    const grainLength = 0.018 + rand() * 0.03;
    const weight = (0.35 + 0.65 * rand()) * (1 - 0.5 * (i / grains));
    const grain = s.noise('white', t, t + grainLength + 0.02);
    const amp = s.gain(0);
    swell(amp.gain, t, SPINE_LEVEL.paper * weight * (opening ? 1 : 0.7), grainLength * 0.35, grainLength);
    s.chain(grain, s.filter('bandpass', 2200 + 3000 * rand(), 0.8), amp);
    amp.connect(out);
  }

  // The felt takes the weight of the paper.
  const feltAt = opening ? when + 0.03 : when + length - 0.06;
  thud(s, out, feltAt, 210, 130, 0.03, SPINE_LEVEL.felt * (opening ? 1 : 0.7), 0.04);

  for (const offset of opening ? [0.14, 0.33] : [0.2]) {
    const t = when + offset;
    const f = 5000 + 800 * rand();
    const level = SPINE_LEVEL.pin * (opening ? 1 : 0.6);
    hit(s, out, t, 'bandpass', f, 3, level, 0.008);
    ring(s, out, t, f * 1.12, level * 0.25, 0.012);
  }
}

// The building at night ---------------------------------------------------------------------

/** One tick of a cast-iron radiator: the iron taking up heat, small and dull and far off. */
export function radiatorTick(env: SpineEnv, when: number, level: number, place: Placement): void {
  const s = new SpineShot(env, place);
  const out = s.bus;
  const f = 1100 + 1300 * env.rand();
  hit(s, out, when, 'bandpass', f, 3.5, SPINE_LEVEL.radiator * level, 0.03, 0.0008);
  ring(s, out, when, f * 2.37, SPINE_LEVEL.radiator * 0.2 * level, 0.02);
  thud(s, out, when, 240, 170, 0.02, SPINE_LEVEL.radiator * 0.2 * level, 0.04);
}

/** A door shutting somewhere far down the building: a low thud and a small latch, mostly room. */
export function farDoor(env: SpineEnv, when: number, place: Placement): void {
  const s = new SpineShot(env, place);
  const out = s.bus;
  thud(s, out, when, 84, 52, 0.06, SPINE_LEVEL.farDoor, 0.16);
  hit(s, out, when - 0.008, 'bandpass', 650, 2, SPINE_LEVEL.farDoor * 0.3, 0.02);
  hit(s, out, when, 'bandpass', 380, 1.4, SPINE_LEVEL.farDoor * 0.5, 0.04);
}

/** A pipe settling in a wall: two or three dull knocks, each a little softer, and a faint strain of metal. */
export function farPipe(env: SpineEnv, when: number, place: Placement): void {
  const s = new SpineShot(env, place);
  const out = s.bus;
  const rand = env.rand;
  const knocks = 2 + Math.floor(rand() * 2);
  let t = when;
  for (let i = 0; i < knocks; i += 1) {
    const weight = 1 - 0.35 * i;
    thud(s, out, t, 230 * spread(rand, 0.05), 150, 0.04, SPINE_LEVEL.farPipe * weight, 0.1);
    hit(s, out, t, 'bandpass', 520, 2.5, SPINE_LEVEL.farPipe * 0.5 * weight, 0.03);
    t += 0.28 + rand() * 0.22;
  }
  rub(s, out, when + 0.1, 0.7, 520, 430, 4, SPINE_LEVEL.farPipe * 0.12, 0.4);
}
