/**
 * What makes a clean recording sound like it comes out of a gramophone, made at runtime from Web
 * Audio so the files stay clean and the character can be tuned without re-encoding them:
 *
 *   a very slow wow  ->  gentle saturation  ->  a band from about 250 Hz to 5 kHz, with a little
 *   body in the middle
 *
 * Warm, not a gimmick: the wow is two tenths of a per cent of pitch every two seconds, which the
 * ear reads as a turntable and not as a vibrato; the saturation only rounds the loudest notes; the
 * band is a horn's, narrow but not tinny. The surface crackle is added next to this, not through it
 * (`surface.ts`), so it is not saturated or band-limited twice.
 */

export const CHARACTER = {
  /** The band the horn passes. Each edge is a pair of second-order filters, 6 dB down at the corner. */
  highpassHz: 250,
  lowpassHz: 5000,
  /** A touch of cabinet body in the mids, in dB at its centre. */
  bodyHz: 650,
  bodyDb: 2.5,
  /** The wow: pitch deviation, as a fraction of the pitch, at this rate. */
  wowHz: 0.5,
  wowPitch: 0.002,
  /** The delay the wow swings around, seconds: more than its swing, so the line never reads negative. */
  wowBaseS: 0.004,
  /** The saturator's drive: 1 is tanh itself, a soft knee that only the loudest notes reach. */
  drive: 1.3,
} as const;

/**
 * The swing, in seconds of delay, that moves pitch by `pitch` at `hz`. A delay that varies as
 * D sin(2 pi f t) changes the speed of what passes through it by up to D 2 pi f, so D is the
 * pitch deviation over 2 pi f.
 */
export const wowDepthS = (pitch: number = CHARACTER.wowPitch, hz: number = CHARACTER.wowHz): number => pitch / (2 * Math.PI * hz);

/** A soft-knee curve for a `WaveShaper`: tanh, scaled so that small signals pass at unity gain. */
export function saturationCurve(drive: number = CHARACTER.drive, points = 2049): Float32Array {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i += 1) {
    const x = (i / (points - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / drive;
  }
  return curve;
}

export interface Character {
  readonly input: AudioNode;
  readonly output: AudioNode;
  readonly nodes: readonly AudioNode[];
  /** The wow's oscillator: it never ends by itself, and the owner stops it. */
  readonly sources: readonly AudioScheduledSourceNode[];
}

/** Build the chain in `ctx`. Nothing here starts until the oscillator does, at `when`. */
export function createCharacter(ctx: BaseAudioContext, when: number): Character {
  const nodes: AudioNode[] = [];
  const sources: AudioScheduledSourceNode[] = [];
  const keep = <T extends AudioNode>(node: T): T => {
    nodes.push(node);
    return node;
  };

  // The wow: a delay whose time a slow sine swings by a fraction of a millisecond.
  const wow = keep(ctx.createDelay(CHARACTER.wowBaseS * 2));
  wow.delayTime.value = CHARACTER.wowBaseS;
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = CHARACTER.wowHz;
  const swing = keep(ctx.createGain());
  swing.gain.value = wowDepthS();
  lfo.connect(swing);
  swing.connect(wow.delayTime);
  lfo.start(when);
  nodes.push(lfo);
  sources.push(lfo);

  const shaper = keep(ctx.createWaveShaper());
  shaper.curve = saturationCurve() as Float32Array<ArrayBuffer>;
  shaper.oversample = '2x';

  const filter = (type: BiquadFilterType, hz: number, q: number, gainDb = 0): BiquadFilterNode => {
    const node = keep(ctx.createBiquadFilter());
    node.type = type;
    node.frequency.value = hz;
    node.Q.value = q;
    node.gain.value = gainDb;
    return node;
  };
  // Two second-order sections each: 12 dB an octave would leave the low end of a piano in the room.
  const stages = [
    filter('highpass', CHARACTER.highpassHz, Math.SQRT1_2),
    filter('highpass', CHARACTER.highpassHz, Math.SQRT1_2),
    filter('peaking', CHARACTER.bodyHz, 0.8, CHARACTER.bodyDb),
    filter('lowpass', CHARACTER.lowpassHz, Math.SQRT1_2),
    filter('lowpass', CHARACTER.lowpassHz, Math.SQRT1_2),
  ];

  wow.connect(shaper);
  let previous: AudioNode = shaper;
  for (const stage of stages) {
    previous.connect(stage);
    previous = stage;
  }
  return { input: wow, output: previous, nodes, sources };
}
