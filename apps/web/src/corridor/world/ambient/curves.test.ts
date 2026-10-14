import { describe, expect, it } from 'vitest';
import { AMBIENT_LIFE } from '../../ambient.ts';
import { MOTIONS } from './schedule.ts';
import {
  DUST,
  FAN,
  MOBILE,
  PAPER,
  PIN,
  REFLECTION,
  SHIMMER,
  TAG,
  mobileTurn,
  paperLift,
  pinGlint,
  reflectionLevel,
  secondHandSteps,
  shimmerAmount,
  tagSwing,
} from './curves.ts';

const sample = (fn: (t: number) => number, to: number, steps = 600): number[] => Array.from({ length: steps + 1 }, (_, i) => fn((i / steps) * to));
const peak = (xs: number[]): number => Math.max(...xs.map(Math.abs));

describe('ambient motions are as small and as slow as the consult says', () => {
  it('the paper corner lifts 3 to 5 mm over 1.8 s and is flat again', () => {
    const lift = sample(paperLift, PAPER.durationS);
    expect(peak(lift)).toBeGreaterThanOrEqual(0.003);
    expect(peak(lift)).toBeLessThanOrEqual(0.005);
    expect(paperLift(0)).toBe(0);
    expect(paperLift(PAPER.durationS)).toBeCloseTo(0, 9);
    expect(paperLift(10)).toBeCloseTo(0, 9);
    expect(Math.min(...lift)).toBeGreaterThanOrEqual(-1e-9);
  });

  it('the fan turns 8 to 12 times a minute', () => {
    expect(FAN.rpm).toBeGreaterThanOrEqual(8);
    expect(FAN.rpm).toBeLessThanOrEqual(12);
  });

  it('the pin catches one soft highlight of 800 ms', () => {
    expect(PIN.durationS).toBeCloseTo(0.8, 9);
    expect(pinGlint(0)).toBe(0);
    expect(pinGlint(PIN.durationS)).toBe(0);
    expect(peak(sample(pinGlint, 1))).toBeCloseTo(1, 2);
  });

  it('the tag swings no more than a degree, and is at rest after 1.6 s', () => {
    expect(peak(sample(tagSwing, TAG.durationS))).toBeLessThanOrEqual((1.05 * Math.PI) / 180);
    expect(peak(sample(tagSwing, TAG.durationS))).toBeGreaterThan((0.3 * Math.PI) / 180);
    expect(tagSwing(TAG.durationS)).toBe(0);
  });

  it('the mobile turns plus and minus 3 degrees over 6 s and ends where it began', () => {
    const turn = sample(mobileTurn, MOBILE.durationS);
    expect(peak(turn)).toBeLessThanOrEqual((3.01 * Math.PI) / 180);
    expect(peak(turn)).toBeGreaterThan((1 * Math.PI) / 180);
    expect(mobileTurn(0)).toBe(0);
    expect(mobileTurn(MOBILE.durationS)).toBe(0);
  });

  it('the window reflection is a 2 to 3% luminance change over 4 s', () => {
    expect(peak(sample(reflectionLevel, REFLECTION.durationS))).toBeGreaterThanOrEqual(0.02);
    expect(peak(sample(reflectionLevel, REFLECTION.durationS))).toBeLessThanOrEqual(0.03);
    expect(reflectionLevel(REFLECTION.durationS)).toBeCloseTo(0, 9);
  });

  it('twelve to twenty motes drift at 10 to 25 mm a second for 4 s', () => {
    expect(DUST.motes).toBeGreaterThanOrEqual(12);
    expect(DUST.motes).toBeLessThanOrEqual(20);
    expect(DUST.speedMps).toBeGreaterThanOrEqual(0.01);
    expect(DUST.speedMps).toBeLessThanOrEqual(0.025);
    expect(DUST.durationS).toBe(4);
  });

  it('the clock steps once a second, whole seconds of ambient time', () => {
    expect(secondHandSteps(0)).toBe(0);
    expect(secondHandSteps(0.999)).toBe(0);
    expect(secondHandSteps(1)).toBe(1);
    expect(secondHandSteps(59.5)).toBe(59);
  });

  it('the radiator shimmer stays under one pixel', () => {
    expect(peak(sample(shimmerAmount, SHIMMER.durationS))).toBeLessThan(1);
  });

  it('every window is long enough for its motion to finish, and none over six seconds', () => {
    const need: Record<string, number> = {
      'lobby-fan': 0,
      'board-paper': PAPER.durationS,
      'lobby-dust': DUST.durationS,
      'fan-tag': TAG.durationS,
      'radiator-shimmer': SHIMMER.durationS,
      'repair-mobile': MOBILE.durationS,
      'window-reflection': REFLECTION.durationS,
      'board-pin': PIN.durationS,
    };
    for (const m of MOTIONS) {
      expect(m.windowMs / 1000, m.id).toBeGreaterThanOrEqual(need[m.id] ?? Infinity);
      expect(m.windowMs, m.id).toBeLessThanOrEqual(AMBIENT_LIFE.maxWindowMs);
    }
  });
});
