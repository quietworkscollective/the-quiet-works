/**
 * The record's surface: the soft crackle of a worn shellac disc, and the run-out groove at its end.
 * Both are made once, per context, from the desk's own white noise (`createNoiseBuffers`) and a
 * seeded stream, so the same gramophone always crackles the same way and nothing here touches
 * `Math.random`.
 *
 * The crackle is sparse and small: many faint ticks and now and then a firmer one, each a few
 * milliseconds of the shared noise with a fast fall. It loops without a seam because every tick
 * dies away well before the end of the buffer. The run-out is one turn of a 78 rpm record (1.28 s):
 * the low thump of the needle riding the eccentric groove, with the surface noise heavier and
 * duller than in the music.
 */
import { createPrng } from '../noise.ts';

/** A 78 rpm record turns once in 60 / 78 seconds. */
export const REVOLUTION_S = 60 / 78;

/** Mean ticks a second in the crackle bed. */
export const TICKS_PER_S = 7;
export const CRACKLE_SECONDS = 9;

export interface Tick {
  /** Seconds from the start of the bed. */
  readonly at: number;
  /** Linear peak, 0 to 1. */
  readonly peak: number;
  /** How long it takes to fall away, in seconds. */
  readonly decay: number;
}

/**
 * Where the ticks fall: Poisson in time, mostly very faint, a few firmer. Kept apart from the
 * samples so a test can ask how many there are and how loud without decoding a buffer.
 */
export function crackleTicks(seconds: number, seed: number, perSecond = TICKS_PER_S): Tick[] {
  const rand = createPrng(seed);
  const ticks: Tick[] = [];
  let at = 0;
  while (true) {
    // Exponential gaps make a Poisson process.
    at += -Math.log(1 - rand()) / perSecond;
    // Leave the end clear so the bed loops without a join.
    if (at > seconds - 0.05) break;
    // Log-normal peaks: most near the floor, an occasional firmer one.
    const gauss = Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
    const peak = Math.min(1, 0.09 * Math.exp(0.9 * gauss));
    ticks.push({ at, peak, decay: 0.0012 + 0.0045 * rand() });
  }
  return ticks;
}

/** The crackle bed as samples, read from `source` (the shared white noise, any length). */
export function crackleSamples(source: Float32Array, sampleRate: number, seconds = CRACKLE_SECONDS, seed = 0xc4ac): Float32Array {
  const length = Math.round(sampleRate * seconds);
  const out = new Float32Array(length);
  if (source.length === 0) return out;
  for (const tick of crackleTicks(seconds, seed)) {
    const start = Math.round(tick.at * sampleRate);
    const span = Math.round(tick.decay * 6 * sampleRate);
    // Each tick reads its own stretch of the noise, so no two sound alike.
    const offset = Math.floor(tick.at * 7919 * sampleRate) % source.length;
    for (let i = 0; i < span && start + i < length; i += 1) {
      const fall = Math.exp(-i / (tick.decay * sampleRate));
      out[start + i] = (out[start + i] ?? 0) + (source[(offset + i) % source.length] ?? 0) * fall * tick.peak;
    }
  }
  return out;
}

/**
 * One turn of the run-out groove: a low thump where the groove's eccentric turn pushes the needle,
 * a smaller tick half a turn later, and a bed of heavy surface noise under both.
 */
export function runOutSamples(source: Float32Array, sampleRate: number, seed = 0x80f1): Float32Array {
  const length = Math.round(sampleRate * REVOLUTION_S);
  const out = new Float32Array(length);
  if (source.length === 0) return out;
  const rand = createPrng(seed);
  // The thump: a falling sine, about 70 Hz to 45 Hz over 90 ms.
  const thump = Math.round(0.11 * sampleRate);
  let phase = 0;
  for (let i = 0; i < thump && i < length; i += 1) {
    const t = i / sampleRate;
    phase += (2 * Math.PI * (45 + 25 * Math.exp(-t / 0.03))) / sampleRate;
    out[i] = (out[i] ?? 0) + Math.sin(phase) * Math.exp(-t / 0.035) * 0.9;
  }
  // The smaller tick half a turn on, and the first tick's own click.
  const clickAt = [0, Math.round(length / 2)];
  for (const [index, start] of clickAt.entries()) {
    const span = Math.round(0.012 * sampleRate);
    for (let i = 0; i < span && start + i < length; i += 1) {
      out[start + i] = (out[start + i] ?? 0) + (source[(start * 3 + i) % source.length] ?? 0) * Math.exp(-i / (0.0025 * sampleRate)) * (index === 0 ? 0.5 : 0.28);
    }
  }
  // A few firmer ticks scattered through the turn, so each turn reads as groove and not as a click track.
  for (let n = 0; n < 5; n += 1) {
    const start = Math.floor(rand() * (length - 0.02 * sampleRate));
    for (let i = 0; i < 0.01 * sampleRate; i += 1) out[start + i] = (out[start + i] ?? 0) + (source[(start + i * 3) % source.length] ?? 0) * Math.exp(-i / (0.002 * sampleRate)) * 0.18;
  }
  return out;
}

/** The loudest sample's magnitude. */
export function peakOf(samples: Float32Array): number {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  return peak;
}
