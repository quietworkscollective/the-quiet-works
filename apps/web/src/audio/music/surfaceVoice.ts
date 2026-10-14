/**
 * The record's surface as a sound that lasts while the needle is down: faint crackle and hiss, a
 * little louder in the lead-in before the music and in the run-out groove after it, with the
 * groove's revolving thump at the very end. One of these exists from the needle dropping to the
 * needle lifting, and takes its nodes with it.
 *
 * Levels are RMS in dBFS at the gramophone's own bus, before distance and the master: the crackle
 * under the music sits some 28 dB below it, far enough that it is a texture and not a noise.
 */
import { dbToGain } from '../voices.ts';
import type { NoiseBuffers } from '../noise.ts';
import { crackleSamples, runOutSamples } from './surface.ts';

export const SURFACE_DB = {
  /** The crackle before the music begins: the needle alone on shellac. */
  lead: -36,
  /** The crackle under the music. */
  music: -50,
  /** The crackle in the run-out groove. */
  runOut: -40,
  /** The constant hiss beneath everything while the needle is down. */
  hiss: -58,
  /** The groove's revolving thump. */
  thump: -33,
} as const;

/** The buffers are made to this RMS, so a level in dB converts to a gain by one subtraction. */
const BUFFER_RMS = 0.25;
const BUFFER_RMS_DB = 20 * Math.log10(BUFFER_RMS);

const FLOOR = 0.0001;

function rmsNormalised(samples: Float32Array, rms: number): Float32Array {
  let sum = 0;
  for (const s of samples) sum += s * s;
  const now = Math.sqrt(sum / Math.max(1, samples.length));
  if (now === 0) return samples;
  const k = rms / now;
  for (let i = 0; i < samples.length; i += 1) samples[i] = (samples[i] ?? 0) * k;
  return samples;
}

export interface SurfaceBuffers {
  readonly crackle: AudioBuffer;
  readonly runOut: AudioBuffer;
}

/** The two buffers, made once per context from the desk's own noise. */
export function createSurfaceBuffers(ctx: BaseAudioContext, noise: NoiseBuffers): SurfaceBuffers {
  const white = noise.white.getChannelData(0);
  const make = (samples: Float32Array): AudioBuffer => {
    const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buffer.getChannelData(0).set(rmsNormalised(samples, BUFFER_RMS));
    return buffer;
  };
  return {
    crackle: make(crackleSamples(white, ctx.sampleRate)),
    runOut: make(runOutSamples(white, ctx.sampleRate)),
  };
}

const gainFor = (db: number): number => dbToGain(db - BUFFER_RMS_DB);

/** Move `param` to `to` over `seconds` from `at`, from wherever it is. */
function ramp(param: AudioParam, to: number, at: number, seconds: number): void {
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(at);
  else {
    param.cancelScheduledValues(at);
    param.setValueAtTime(param.value, at);
  }
  param.linearRampToValueAtTime(to, at + seconds);
}

export class Surface {
  private readonly nodes: AudioNode[] = [];
  private readonly sources: AudioScheduledSourceNode[] = [];
  /** Every gain in the voice, so ending it can bring each to silence. */
  private readonly gains: GainNode[] = [];
  private readonly crackle: GainNode;
  private readonly thump: GainNode;
  private ended = false;

  constructor(
    ctx: BaseAudioContext,
    noise: NoiseBuffers,
    buffers: SurfaceBuffers,
    out: AudioNode,
    now: number,
    rand: () => number,
  ) {
    const loop = (buffer: AudioBuffer, offset: number): AudioBufferSourceNode => {
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.loop = true;
      node.start(now, offset);
      this.sources.push(node);
      this.nodes.push(node);
      return node;
    };
    const gain = (value: number): GainNode => {
      const node = ctx.createGain();
      node.gain.value = value;
      this.nodes.push(node);
      this.gains.push(node);
      return node;
    };

    this.crackle = gain(FLOOR);
    this.thump = gain(FLOOR);
    // Ticks are the high end of the surface: the groove and the shellac are not bass.
    const tickBand = ctx.createBiquadFilter();
    tickBand.type = 'highpass';
    tickBand.frequency.value = 700;
    tickBand.Q.value = 0.7;
    this.nodes.push(tickBand);
    loop(buffers.crackle, rand() * (buffers.crackle.duration || 1)).connect(tickBand);
    tickBand.connect(this.crackle);
    this.crackle.connect(out);

    // The hiss: the shared white noise, narrowed to the band a worn disc hisses in.
    const hiss = ctx.createBufferSource();
    hiss.buffer = noise.white;
    hiss.loop = true;
    hiss.start(now, rand() * 1.9);
    this.sources.push(hiss);
    this.nodes.push(hiss);
    const hissBand = ctx.createBiquadFilter();
    hissBand.type = 'bandpass';
    hissBand.frequency.value = 2600;
    hissBand.Q.value = 0.5;
    this.nodes.push(hissBand);
    const hissGain = gain(FLOOR);
    hiss.connect(hissBand);
    hissBand.connect(hissGain);
    hissGain.connect(out);
    hissGain.gain.setValueAtTime(FLOOR, now);
    hissGain.gain.linearRampToValueAtTime(dbToGain(SURFACE_DB.hiss), now + 0.4);

    const turn = loop(buffers.runOut, 0);
    turn.connect(this.thump);
    this.thump.connect(out);
  }

  /** The needle has just landed: crackle comes up for the lead-in. */
  lead(now: number): void {
    ramp(this.crackle.gain, gainFor(SURFACE_DB.lead), now, 0.12);
  }

  /** The music has begun: the crackle falls back under it. */
  underMusic(now: number): void {
    ramp(this.crackle.gain, gainFor(SURFACE_DB.music), now, 1.4);
  }

  /** The record is over: heavier crackle, and the groove's thump once a turn. */
  runOut(now: number): void {
    ramp(this.crackle.gain, gainFor(SURFACE_DB.runOut), now, 0.5);
    ramp(this.thump.gain, gainFor(SURFACE_DB.thump), now, 0.6);
  }

  /** The needle has left: everything falls away over `seconds`, then the nodes go. Returns the time they are gone. */
  end(now: number, seconds: number): number {
    if (this.ended) return now;
    this.ended = true;
    for (const node of this.gains) ramp(node.gain, FLOOR, now, seconds);
    const stopAt = now + seconds + 0.05;
    for (const source of this.sources) {
      try {
        source.stop(stopAt);
      } catch {
        // Already stopped.
      }
    }
    return stopAt;
  }

  /** Disconnect everything now. */
  dispose(): void {
    this.ended = true;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Not started, or already stopped.
      }
    }
    for (const node of this.nodes) {
      try {
        node.disconnect();
      } catch {
        // Already disconnected.
      }
    }
    this.nodes.length = 0;
    this.sources.length = 0;
  }
}
