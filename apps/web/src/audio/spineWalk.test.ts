import { describe, expect, it } from 'vitest';
import { SPINE_TIMING } from '../timing.ts';
import { createPrng } from './noise.ts';
import { Cadence, STEPS_PER_S_AT_WALK, STRIDE_M, WITHDRAW_AFTER_S, type Step } from './spineWalk.ts';

const TICK = 0.05;
const LOOKAHEAD = 0.2;

/** Drive a cadence like the sound desk does: a tick every 50 ms with the speed as the camera reports it. */
function walk(
  cadence: Cadence,
  from: number,
  to: number,
  speed: (t: number) => number,
): { steps: Step[]; withdrawn: number[] } {
  const steps: Step[] = [];
  const withdrawn: number[] = [];
  for (let t = from; t <= to + 1e-9; t += TICK) {
    withdrawn.push(...cadence.setSpeed(t, speed(t)));
    steps.push(...cadence.due(t, LOOKAHEAD));
  }
  return { steps, withdrawn };
}

const gaps = (steps: readonly Step[]): number[] => steps.slice(1).map((step, i) => step.at - (steps[i]?.at ?? 0));

describe('footstep cadence', () => {
  it('walks at about 1.6 steps a second at the walking pace of 1.1 m/s', () => {
    expect(STEPS_PER_S_AT_WALK).toBe(1.6);
    expect(STRIDE_M * STEPS_PER_S_AT_WALK).toBeCloseTo(SPINE_TIMING.walkMps, 9);

    const { steps } = walk(new Cadence(createPrng(1)), 0, 30, () => SPINE_TIMING.walkMps);
    const rate = (steps.length - 1) / ((steps.at(-1)?.at ?? 0) - (steps[0]?.at ?? 0));
    expect(rate).toBeGreaterThan(1.55);
    expect(rate).toBeLessThan(1.65);
  });

  it('scales with speed: the glide at 0.8 m/s and a slow 0.55 m/s step proportionally less often', () => {
    for (const mps of [SPINE_TIMING.glideMps, 0.55, 1.4]) {
      const { steps } = walk(new Cadence(createPrng(2)), 0, 30, () => mps);
      const rate = (steps.length - 1) / ((steps.at(-1)?.at ?? 0) - (steps[0]?.at ?? 0));
      const expected = (STEPS_PER_S_AT_WALK * mps) / SPINE_TIMING.walkMps;
      expect(rate).toBeGreaterThan(expected * 0.96);
      expect(rate).toBeLessThan(expected * 1.04);
    }
  });

  it('alternates feet, left first', () => {
    const { steps } = walk(new Cadence(createPrng(3)), 0, 10, () => 1.1);
    expect(steps.length).toBeGreaterThan(10);
    steps.forEach((step, i) => expect(step.foot).toBe(i % 2));
  });

  it('varies each gap a little from the seeded generator, never by more than 10 ms, and repeats exactly for one seed', () => {
    const run = (seed: number): Step[] => walk(new Cadence(createPrng(seed)), 0, 20, () => 1.1).steps;
    const a = run(7);
    const ideal = STRIDE_M / 1.1;
    const spread = gaps(a).map((gap) => gap - ideal);
    // Neighbouring gaps move by up to twice the jitter, so a single gap is within 2 x 10 ms of ideal.
    expect(Math.max(...spread.map(Math.abs))).toBeLessThanOrEqual(0.02 + 1e-9);
    expect(new Set(gaps(a).map((gap) => gap.toFixed(4))).size).toBeGreaterThan(10);

    expect(run(7).map((step) => step.at)).toEqual(a.map((step) => step.at));
    expect(run(8).map((step) => step.at)).not.toEqual(a.map((step) => step.at));
  });

  it('never puts two steps closer than 220 ms, even when a walk stops and starts again inside one stride', () => {
    const { steps } = walk(new Cadence(createPrng(4)), 0, 60, () => 1.6);
    expect(Math.min(...gaps(steps))).toBeGreaterThanOrEqual(0.22 - 1e-9);

    // A foot committed, the walk stopped and started again at once: the new first step would fall
    // about 125 ms after the last, which is not a step a body can take.
    const cadence = new Cadence(createPrng(4));
    cadence.setSpeed(0, 1.1);
    let last: Step | undefined;
    for (let t = 0; t < 2 && last === undefined; t += TICK) last = cadence.due(t, LOOKAHEAD)[0];
    expect(last).toBeDefined();
    const lastAt = last?.at ?? 0;
    const now = lastAt - 0.02;
    expect(cadence.setSpeed(now, 0)).toEqual([]);
    cadence.setSpeed(now, 1.1);
    const resumed: Step[] = [];
    for (let t = now; t < now + 2; t += TICK) resumed.push(...cadence.due(t, LOOKAHEAD));
    expect((resumed[0]?.at ?? 0) - lastAt).toBeGreaterThanOrEqual(0.22 - 1e-9);
  });

  it('lands the first foot within about a quarter second of starting to walk', () => {
    const cadence = new Cadence(createPrng(5));
    const { steps } = walk(cadence, 10, 12, () => 1.1);
    expect((steps[0]?.at ?? 0) - 10).toBeGreaterThan(0.1);
    expect((steps[0]?.at ?? 0) - 10).toBeLessThan(0.3);
  });

  it('follows an easing-in walk: slower speeds stretch the early gaps', () => {
    // The camera accelerates to 1.1 m/s over 300 ms, then holds.
    const ramp = (t: number): number => Math.min(1.1, 1.1 * (t / 0.3));
    const { steps } = walk(new Cadence(createPrng(6)), 0.05, 6, ramp);
    expect(steps[0]?.at).toBeLessThan(0.6);
    const [first = 0, second = 0, third = 0] = gaps(steps);
    expect(first).toBeLessThanOrEqual(second + 0.1);
    expect(third).toBeCloseTo(STRIDE_M / 1.1, 1);
  });

  it('treats anything under the settling threshold, and nonsense, as standing still', () => {
    for (const speed of [0, 0.05, 0.119, -1, Number.NaN, Number.NEGATIVE_INFINITY]) {
      const { steps } = walk(new Cadence(createPrng(8)), 0, 5, () => speed);
      expect(steps, `speed ${speed}`).toEqual([]);
    }
    // An absurd speed is capped, not a machine gun.
    const { steps } = walk(new Cadence(createPrng(8)), 0, 10, () => 50);
    expect(steps.length / 10).toBeLessThan(STEPS_PER_S_AT_WALK * (1.6 / 1.1) + 0.2);
  });

  it('lands a little harder at speed: weight rises with pace and stays within 0.78 to 1.0 at normal speeds', () => {
    const weightAt = (mps: number): number => walk(new Cadence(createPrng(9)), 0, 5, () => mps).steps[2]?.weight ?? 0;
    expect(weightAt(0.3)).toBeLessThan(weightAt(0.8));
    expect(weightAt(0.8)).toBeLessThan(weightAt(1.1));
    expect(weightAt(0.3)).toBeGreaterThanOrEqual(0.78);
    expect(weightAt(1.1)).toBeLessThanOrEqual(1.0 + 1e-9);
  });

  it('commits a step at most the lookahead before it lands, never in the past', () => {
    const cadence = new Cadence(createPrng(10));
    cadence.setSpeed(0, 1.1);
    for (let t = 0; t < 10; t += TICK) {
      for (const step of cadence.due(t, LOOKAHEAD)) {
        expect(step.at).toBeGreaterThan(t);
        // The only slack beyond the lookahead is the jitter.
        expect(step.at).toBeLessThanOrEqual(t + LOOKAHEAD + 0.01 + 1e-9);
      }
    }
  });

  it('gives each step a distinct id and hands every step out once', () => {
    const { steps } = walk(new Cadence(createPrng(11)), 0, 20, () => 1.1);
    expect(new Set(steps.map((step) => step.id)).size).toBe(steps.length);
  });
});

describe('stopping', () => {
  it('withdraws steps committed but not yet sounding, and leaves one that has begun to finish', () => {
    const cadence = new Cadence(createPrng(12));
    const { steps } = walk(cadence, 0, 3, () => 1.1);
    const lastAt = steps.at(-1)?.at ?? 0;
    // Stop just before the last committed step lands: it is inside the grace window and stays.
    const nearlyThere = lastAt - WITHDRAW_AFTER_S / 2;
    expect(cadence.setSpeed(nearlyThere, 0)).toEqual([]);

    // Stop well before a committed step: it is withdrawn.
    const early = new Cadence(createPrng(12));
    let committed: Step[] = [];
    early.setSpeed(0, 1.1);
    for (let t = 0; t < 3; t += TICK) {
      const issued = early.due(t, LOOKAHEAD);
      committed = [...committed, ...issued];
      if (issued.length > 0) {
        const withdrawn = early.setSpeed(t, 0);
        expect(withdrawn).toEqual(issued.filter((step) => step.at > t + WITHDRAW_AFTER_S).map((step) => step.id));
        expect(withdrawn.length).toBe(1);
        return;
      }
    }
    throw new Error(`no step was committed in 3 s (${committed.length})`);
  });

  it('issues nothing after stopping, however long the ticks go on', () => {
    const cadence = new Cadence(createPrng(13));
    walk(cadence, 0, 3, () => 1.1);
    cadence.setSpeed(3, 0);
    const later = walk(cadence, 3.05, 10, () => 0);
    expect(later.steps).toEqual([]);
    expect(cadence.walking).toBe(false);
  });

  it('starts a fresh stride when walking resumes, without a step on the same instant', () => {
    const cadence = new Cadence(createPrng(14));
    const first = walk(cadence, 0, 2, () => 1.1).steps;
    cadence.setSpeed(2.05, 0);
    const second = walk(cadence, 2.1, 5, () => 1.1).steps;
    const lastBefore = first.at(-1)?.at ?? 0;
    const firstAfter = second[0]?.at ?? 0;
    expect(firstAfter - lastBefore).toBeGreaterThanOrEqual(0.22 - 1e-9);
    expect(firstAfter).toBeGreaterThan(2.1);
  });

  it('ignores a repeated speed: the same report every frame neither bursts nor restarts the stride', () => {
    const steady = walk(new Cadence(createPrng(15)), 0, 10, () => 1.1).steps;
    const noisy = new Cadence(createPrng(15));
    const steps: Step[] = [];
    for (let t = 0; t <= 10 + 1e-9; t += 1 / 60) {
      noisy.setSpeed(t, 1.1);
      steps.push(...noisy.due(t, LOOKAHEAD));
    }
    expect(Math.abs(steps.length - steady.length)).toBeLessThanOrEqual(1);
  });

  it('does not play catch-up after the main thread stalls', () => {
    const cadence = new Cadence(createPrng(16));
    walk(cadence, 0, 2, () => 1.1);
    // Nothing ticks for three seconds. The step that fell due in the meantime is dropped, not played late.
    const resumed = cadence.due(5, LOOKAHEAD);
    expect(resumed).toEqual([]);
    const later = walk(cadence, 5.05, 8, () => 1.1).steps;
    const rate = later.length / 3;
    expect(rate).toBeLessThan(1.8);
  });
});
