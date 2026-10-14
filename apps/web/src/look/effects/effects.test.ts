import { describe, expect, it } from 'vitest';
import { CORRIDOR_LOOK, LANDING_LOOK, OFFICE_LOOK } from '../profiles.ts';
import { grainSample, GrainEffect, pcg } from './grain.ts';
import { vignetteFactor, VignetteEffect } from './vignette.ts';

describe('vignette', () => {
  it('loses exactly the profile’s share of light in a corner and nothing at the centre', () => {
    for (const profile of [CORRIDOR_LOOK, OFFICE_LOOK]) {
      const { amount, inner } = profile.vignette;
      for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        expect(vignetteFactor(u, v, amount, inner), `${profile.space} corner ${u},${v}`).toBeCloseTo(1 - amount, 9);
      }
      expect(vignetteFactor(0.5, 0.5, amount, inner)).toBe(1);
    }
  });

  it('is 5 to 8 per cent in a corner, and none at all on the landing', () => {
    for (const profile of [CORRIDOR_LOOK, OFFICE_LOOK]) {
      const loss = 1 - vignetteFactor(0, 0, profile.vignette.amount, profile.vignette.inner);
      expect(loss).toBeGreaterThanOrEqual(0.05);
      expect(loss).toBeLessThanOrEqual(0.08);
    }
    expect(vignetteFactor(0, 0, LANDING_LOOK.vignette.amount, LANDING_LOOK.vignette.inner)).toBe(1);
  });

  it('leaves the inner part of the frame untouched and darkens monotonically toward the corner', () => {
    const { amount, inner } = OFFICE_LOOK.vignette;
    expect(vignetteFactor(0.5 + 0.4 * inner * 0.5, 0.5, amount, inner)).toBe(1);
    let previous = 1;
    for (let step = 0; step <= 50; step += 1) {
      const t = 0.5 - 0.5 * (step / 50);
      const factor = vignetteFactor(t, t, amount, inner);
      expect(factor).toBeLessThanOrEqual(previous + 1e-12);
      previous = factor;
    }
  });

  it('falls off as a smoothstep squared between the inner radius and the corner', () => {
    // Half way from the inner radius (0.5) to the corner is 0.75 of the way out: smoothstep 0.5, squared 0.25.
    const r = 0.75;
    const u = 0.5 + (r / Math.SQRT1_2) * 0.5 * Math.cos(Math.PI / 4);
    expect(vignetteFactor(u, u, 0.08, 0.5)).toBeCloseTo(1 - 0.08 * 0.25, 9);
  });

  it('keeps its numbers on the effect, where the stack updates them in place', () => {
    const effect = new VignetteEffect(0.05, 0.5);
    expect(effect.amount).toBe(0.05);
    effect.amount = 0.07;
    effect.inner = 0.4;
    expect(effect.amount).toBe(0.07);
    expect(effect.inner).toBe(0.4);
  });
});

describe('grain', () => {
  const sample = (seed: number, size = 64): number[][] => {
    const channels: number[][] = [[], [], []];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) grainSample(x, y, seed).forEach((value, c) => channels[c]!.push(value));
    }
    return channels;
  };
  const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;

  it('is the PCG hash: it matches an independent implementation in exact integer arithmetic', () => {
    const reference = (input: bigint): bigint => {
      const mask = 0xffffffffn;
      const state = (input * 747796405n + 2891336453n) & mask;
      const word = ((((state >> ((state >> 28n) + 4n)) ^ state) & mask) * 277803737n) & mask;
      return ((word >> 22n) ^ word) & mask;
    };
    for (const value of [0, 1, 2, 12345, 65535, 4294967295, 2654435761]) {
      expect(pcg(value), `pcg(${value})`).toBe(Number(reference(BigInt(value))));
    }
  });

  it('is deterministic: a pixel’s grain depends only on its place and the seed', () => {
    expect(grainSample(12, 34, 7)).toEqual(grainSample(12, 34, 7));
    expect(pcg(12345)).toBe(pcg(12345));
  });

  it('is frozen for a seed and different for another, so it changes only when the seed does', () => {
    expect(grainSample(12, 34, 7)).not.toEqual(grainSample(12, 34, 8));
    expect(grainSample(12, 34, 7)).not.toEqual(grainSample(13, 34, 7));
  });

  it('stays within half either way, has no bias, and fills the range evenly', () => {
    for (const channel of sample(3)) {
      expect(Math.min(...channel)).toBeGreaterThanOrEqual(-0.5);
      expect(Math.max(...channel)).toBeLessThan(0.5);
      expect(Math.abs(mean(channel))).toBeLessThan(0.01);
      const spread = Math.sqrt(mean(channel.map((v) => v * v)));
      expect(spread, 'uniform noise has a deviation of about 0.289').toBeGreaterThan(0.27);
      expect(spread).toBeLessThan(0.31);
    }
  });

  it('gives the three colour channels independent noise', () => {
    const [r, g, b] = sample(5);
    const correlation = (a: number[], c: number[]): number => {
      const ma = mean(a);
      const mc = mean(c);
      let num = 0;
      let da = 0;
      let dc = 0;
      for (let i = 0; i < a.length; i += 1) {
        num += (a[i]! - ma) * (c[i]! - mc);
        da += (a[i]! - ma) ** 2;
        dc += (c[i]! - mc) ** 2;
      }
      return num / Math.sqrt(da * dc);
    };
    expect(Math.abs(correlation(r!, g!))).toBeLessThan(0.05);
    expect(Math.abs(correlation(g!, b!))).toBeLessThan(0.05);
    expect(Math.abs(correlation(r!, b!))).toBeLessThan(0.05);
  });

  it('keeps neighbouring pixels unrelated, so it reads as grain and not as a pattern', () => {
    const [r] = sample(9);
    let num = 0;
    let den = 0;
    for (let i = 0; i < r!.length - 1; i += 1) {
      num += r![i]! * r![i + 1]!;
      den += r![i]! * r![i]!;
    }
    expect(Math.abs(num / den)).toBeLessThan(0.05);
  });

  it('holds its amount and seed on the effect', () => {
    const effect = new GrainEffect(0.03);
    expect(effect.amount).toBe(0.03);
    expect(effect.seed).toBe(0);
    effect.seed = 12;
    effect.amount = 0.04;
    expect(effect.seed).toBe(12);
    expect(effect.amount).toBe(0.04);
  });

  it('is applied to the display image, in the colour space the profile’s numbers are written in', () => {
    expect(new GrainEffect(0.03).inputColorSpace).toBe('srgb');
  });
});
