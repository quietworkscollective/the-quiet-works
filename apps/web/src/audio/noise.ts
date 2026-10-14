/**
 * Shared noise sources. Created once per AudioContext on unlock and reused by every voice, so a
 * stamp never allocates or fills a buffer. Generation is seeded: the same desk always sounds the
 * same, and nothing here touches `Math.random`.
 */

export const NOISE_SECONDS = 2;

/** Both buffers are scaled to this RMS so gain staging in `voices.ts` can treat them alike. */
const NOISE_RMS = 0.5;

/** Equal-power crossfade at the loop seam, so a looped buffer has no audible join. */
const SEAM_SECONDS = 0.05;

export interface NoiseBuffers {
  /** Flat spectrum. Transients, rustle, breath. */
  readonly white: AudioBuffer;
  /** Roughly -3 dB per octave. Room tone and ventilation. */
  readonly pink: AudioBuffer;
}

/** Small, fast, seedable generator (mulberry32). Returns floats in [0, 1). */
export function createPrng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function whiteSamples(length: number, rand: () => number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) out[i] = rand() * 2 - 1;
  return out;
}

/** Paul Kellet's refined pink-noise filter: cheap, and flat to within about 0.5 dB. */
function pinkSamples(length: number, rand: () => number): Float32Array {
  const out = new Float32Array(length);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < length; i += 1) {
    const white = rand() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
  }
  return out;
}

/** Make `samples` (length + seam) loop without a join: the tail is folded into the head. */
function foldSeam(samples: Float32Array, length: number, seam: number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) out[i] = samples[i] ?? 0;
  for (let i = 0; i < seam; i += 1) {
    const angle = ((i + 0.5) / seam) * (Math.PI / 2);
    out[i] = (samples[i] ?? 0) * Math.sin(angle) + (samples[length + i] ?? 0) * Math.cos(angle);
  }
  return out;
}

function normalise(samples: Float32Array): void {
  let sum = 0;
  for (const s of samples) sum += s * s;
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  if (rms === 0) return;
  const k = NOISE_RMS / rms;
  for (let i = 0; i < samples.length; i += 1) samples[i] = (samples[i] ?? 0) * k;
}

function toBuffer(ctx: BaseAudioContext, samples: Float32Array): AudioBuffer {
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.getChannelData(0).set(samples);
  return buffer;
}

export function createNoiseBuffers(ctx: BaseAudioContext, seed = 0x51ee7): NoiseBuffers {
  const rand = createPrng(seed);
  const length = Math.round(ctx.sampleRate * NOISE_SECONDS);
  const seam = Math.round(ctx.sampleRate * SEAM_SECONDS);

  const white = foldSeam(whiteSamples(length + seam, rand), length, seam);
  const pink = foldSeam(pinkSamples(length + seam, rand), length, seam);
  normalise(white);
  normalise(pink);

  return { white: toBuffer(ctx, white), pink: toBuffer(ctx, pink) };
}
