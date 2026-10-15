import { describe, expect, it, vi } from 'vitest';
import { createNoiseBuffers } from '../noise.ts';
import { FakeAudioContext, installFakeAudio } from '../spineTestAudio.ts';
import { CRACKLE_SECONDS, crackleSamples, crackleTicks, peakOf, REVOLUTION_S, runOutSamples, TICKS_PER_S } from './surface.ts';
import { SURFACE_DB, createSurfaceBuffers } from './surfaceVoice.ts';

const RATE = 48_000;
/** A stand-in for the desk's white noise: deterministic, full scale. */
const noise = (length: number): Float32Array => {
  const out = new Float32Array(length);
  let a = 12345;
  for (let i = 0; i < length; i += 1) {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    out[i] = (a / 4294967296) * 2 - 1;
  }
  return out;
};

const rms = (samples: Float32Array): number => Math.sqrt(samples.reduce((n, s) => n + s * s, 0) / samples.length);

describe('the surface crackle', () => {
  it('is sparse: a few ticks a second over the whole bed, and the same ticks every time', () => {
    const ticks = crackleTicks(CRACKLE_SECONDS, 1);
    expect(ticks.length).toBeGreaterThan(TICKS_PER_S * CRACKLE_SECONDS * 0.6);
    expect(ticks.length).toBeLessThan(TICKS_PER_S * CRACKLE_SECONDS * 1.5);
    expect(crackleTicks(CRACKLE_SECONDS, 1)).toEqual(ticks);
    expect(crackleTicks(CRACKLE_SECONDS, 2)).not.toEqual(ticks);
  });

  it('is mostly faint, with an occasional firmer tick, none above full scale', () => {
    const peaks = crackleTicks(60, 3).map((t) => t.peak).sort((a, b) => a - b);
    const median = peaks[Math.floor(peaks.length / 2)] ?? 1;
    expect(median).toBeLessThan(0.15);
    expect(peaks[peaks.length - 1]).toBeLessThanOrEqual(1);
    expect(peaks.filter((p) => p > 0.3).length).toBeGreaterThan(0);
    // Under a tenth of the ticks are firm: a texture, not a rhythm.
    expect(peaks.filter((p) => p > 0.3).length / peaks.length).toBeLessThan(0.1);
  });

  it('loops without a join: nothing falls in the last 50 ms of the bed, and every tick has died away', () => {
    const ticks = crackleTicks(CRACKLE_SECONDS, 4);
    for (const t of ticks) expect(t.at + t.decay * 6).toBeLessThan(CRACKLE_SECONDS);
    const samples = crackleSamples(noise(RATE * 2), RATE, CRACKLE_SECONDS, 4);
    const tail = samples.subarray(samples.length - Math.round(0.05 * RATE));
    expect(peakOf(tail)).toBe(0);
    expect(samples.length).toBe(Math.round(RATE * CRACKLE_SECONDS));
  });

  it('is made from the desk noise alone: silent noise gives a silent bed, and Math.random is never asked', () => {
    const random = vi.spyOn(Math, 'random');
    expect(peakOf(crackleSamples(new Float32Array(RATE), RATE))).toBe(0);
    expect(peakOf(crackleSamples(new Float32Array(0), RATE))).toBe(0);
    expect(peakOf(crackleSamples(noise(RATE), RATE))).toBeGreaterThan(0);
    expect(peakOf(runOutSamples(noise(RATE), RATE))).toBeGreaterThan(0);
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });
});

describe('the run-out groove', () => {
  it('is exactly one turn of a 78 rpm record, with its thump at the start and a smaller tick half a turn on', () => {
    const samples = runOutSamples(noise(RATE), RATE);
    expect(samples.length).toBe(Math.round(RATE * REVOLUTION_S));
    expect(REVOLUTION_S).toBeCloseTo(0.769, 2);
    const window = (from: number, to: number) => rms(samples.subarray(Math.round(from * RATE), Math.round(to * RATE)));
    const half = REVOLUTION_S / 2;
    expect(window(0, 0.08)).toBeGreaterThan(window(0.2, 0.3) * 3);
    expect(window(half, half + 0.012)).toBeGreaterThan(window(0.25, 0.25 + 0.012) * 1.2);
  });
});

describe('the surface buffers in the graph', () => {
  it('are made once from the desk noise at a fixed RMS, so a level in dB sets the gain by one subtraction', () => {
    installFakeAudio();
    const ctx = new FakeAudioContext();
    const white = createNoiseBuffers(ctx as unknown as BaseAudioContext);
    // The fake buffers are silent, so fill the white noise as the real one would be, and rebuild.
    white.white.getChannelData(0).set(noise(white.white.length));
    const buffers = createSurfaceBuffers(ctx as unknown as BaseAudioContext, white);
    expect(rms(buffers.crackle.getChannelData(0))).toBeCloseTo(0.25, 3);
    expect(rms(buffers.runOut.getChannelData(0))).toBeCloseTo(0.25, 3);
    expect(buffers.runOut.length).toBe(Math.round(ctx.sampleRate * REVOLUTION_S));
  });

  it('keeps the crackle far under the music, and louder in the lead-in and the groove than beneath the music', () => {
    // The music sits near -22 dBFS beside the gramophone; the crackle under it at least 24 dB lower.
    expect(SURFACE_DB.music).toBeLessThanOrEqual(-22 - 24);
    expect(SURFACE_DB.hiss).toBeLessThan(SURFACE_DB.music);
    expect(SURFACE_DB.lead).toBeGreaterThan(SURFACE_DB.music);
    expect(SURFACE_DB.runOut).toBeGreaterThan(SURFACE_DB.music);
    // Even the lead-in, the needle alone on the disc, is well under the music's level.
    expect(SURFACE_DB.lead).toBeLessThan(-22 - 10);
  });
});
