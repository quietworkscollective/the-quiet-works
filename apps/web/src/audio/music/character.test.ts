import { beforeEach, describe, expect, it } from 'vitest';
import { FakeBiquad, FakeGain, FakeOscillator } from '../spineTestAudio.ts';
import { CHARACTER, createCharacter, saturationCurve, wowDepthS } from './character.ts';
import { FakeDelay, FakeShaper, installMusicAudio, MusicFakeContext } from './testAudio.ts';

describe('the gramophone character', () => {
  it('sets the wow to two tenths of a per cent of pitch at half a hertz', () => {
    expect(CHARACTER.wowHz).toBe(0.5);
    expect(CHARACTER.wowPitch).toBe(0.002);
    // A delay swinging D sin(2 pi f t) moves pitch by D 2 pi f: the swing must give exactly +-0.2 %.
    expect(wowDepthS() * 2 * Math.PI * CHARACTER.wowHz).toBeCloseTo(0.002, 12);
    // A fraction of a millisecond, around a base delay that is always larger.
    expect(wowDepthS()).toBeLessThan(0.001);
    expect(CHARACTER.wowBaseS).toBeGreaterThan(wowDepthS() * 2);
  });

  it('rounds the loudest notes and leaves quiet ones alone', () => {
    const curve = saturationCurve();
    const mid = (curve.length - 1) / 2;
    expect(curve[mid]).toBeCloseTo(0, 12);
    // Odd, so it adds odd harmonics only: warm, not buzzy.
    for (const i of [10, 400, 900]) expect(curve[mid + i]).toBeCloseTo(-(curve[mid - i] ?? 0), 10);
    // Unity gain for small signals.
    expect((curve[mid + 1] ?? 0) / (1 / mid)).toBeCloseTo(1, 3);
    // Never rising too fast, always rising: monotonic.
    for (let i = 1; i < curve.length; i += 1) expect(curve[i] ?? 0).toBeGreaterThan(curve[i - 1] ?? 0);
    // And gentle: a full-scale peak is pulled down by a few dB, not squashed.
    const peak = curve[curve.length - 1] ?? 0;
    expect(20 * Math.log10(peak)).toBeGreaterThan(-6);
    expect(20 * Math.log10(peak)).toBeLessThan(-1);
  });
});

describe('the character chain in the graph', () => {
  let ctx: MusicFakeContext;
  beforeEach(() => {
    installMusicAudio();
    ctx = new MusicFakeContext();
  });

  it('passes 250 Hz to 5 kHz: two second-order high-pass and low-pass stages at the corners', () => {
    createCharacter(ctx as unknown as BaseAudioContext, 0);
    const filters = ctx.of(FakeBiquad);
    const edges = (type: string) => filters.filter((f) => f.type === type).map((f) => f.frequency.valueAt(0));
    expect(edges('highpass')).toEqual([250, 250]);
    expect(edges('lowpass')).toEqual([5000, 5000]);
    expect(filters.filter((f) => f.type === 'peaking')).toHaveLength(1);
  });

  it('swings a delay with a half-hertz sine of the depth that gives the wow, and starts nothing else', () => {
    createCharacter(ctx as unknown as BaseAudioContext, 0);
    const [lfo] = ctx.of(FakeOscillator);
    expect(lfo?.frequency.valueAt(0)).toBe(0.5);
    expect(lfo?.startTime).toBe(0);
    const delay = ctx.of(FakeDelay)[0];
    expect(delay?.delayTime.valueAt(0)).toBe(CHARACTER.wowBaseS);
    // The oscillator reaches the delay's time through a gain of exactly the swing.
    const swing = ctx.of(FakeGain).find((g) => g.outputs.has(delay!.delayTime));
    expect(swing?.gain.valueAt(0)).toBeCloseTo(wowDepthS(), 12);
    expect(ctx.sources()).toHaveLength(1);
  });

  it('puts the saturation ahead of the band, so what it adds above 5 kHz is filtered out', () => {
    createCharacter(ctx as unknown as BaseAudioContext, 0);
    const shaper = ctx.of(FakeShaper)[0];
    expect(shaper?.curve).toBeInstanceOf(Float32Array);
    expect(shaper?.oversample).toBe('2x');
    const next = [...(shaper?.outputs ?? [])][0] as FakeBiquad;
    expect(next.type).toBe('highpass');
    const delay = ctx.of(FakeDelay)[0];
    expect(delay?.outputs.has(shaper!)).toBe(true);
  });
});
