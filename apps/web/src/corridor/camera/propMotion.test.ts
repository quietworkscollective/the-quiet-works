import { describe, expect, it } from 'vitest';
import { createPropAnimation, PROPS, type PropId } from '../props.ts';
import {
  ACTION_TIMING,
  ATTENTION_FALL_MS,
  ATTENTION_RISE_MS,
  createPropMotion,
} from './propMotion.ts';

const FRAME = 1000 / 60;

function setup(reduced = false) {
  const animation = createPropAnimation();
  let clock = 0;
  const settled: PropId[] = [];
  const motion = createPropMotion(animation, {
    reduced: () => reduced,
    nowMs: () => clock,
    onSettled: (id) => settled.push(id),
  });
  /** Runs `ms` of frames; returns whether the last one asked for another. */
  const run = (ms: number, each?: () => void): boolean => {
    let busy = false;
    for (let t = 0; t < ms - 1e-9; t += FRAME) {
      const dt = Math.min(FRAME, ms - t);
      clock += dt;
      busy = motion.step(dt);
      each?.();
    }
    return busy;
  };
  return { animation, motion, run, settled, wait: (ms: number) => (clock += ms) };
}

describe('hover attention', () => {
  it('rises to full strength within 100 to 150 ms: not before 100, there by 150', () => {
    expect(ATTENTION_RISE_MS).toBeGreaterThanOrEqual(100);
    expect(ATTENTION_RISE_MS).toBeLessThanOrEqual(150);
    const { animation, motion, run } = setup();
    motion.setEmphasis('football', true);
    run(96);
    expect(animation.football.attention).toBeLessThan(1);
    expect(animation.football.attention).toBeGreaterThan(0.6);
    run(60);
    expect(animation.football.attention).toBe(1);
  });

  it('rises smoothly and monotonically, with no overshoot', () => {
    const { animation, motion, run } = setup();
    motion.setEmphasis('chess', true);
    let last = 0;
    run(200, () => {
      expect(animation.chess.attention).toBeGreaterThanOrEqual(last);
      expect(animation.chess.attention).toBeLessThanOrEqual(1);
      last = animation.chess.attention;
    });
  });

  it('fades when the pointer leaves, a little slower than it rose, and the prop then costs no frames', () => {
    const { animation, motion, run } = setup();
    motion.setEmphasis('football', true);
    run(300);
    motion.setEmphasis('football', false);
    run(ATTENTION_FALL_MS - 20);
    expect(animation.football.attention).toBeGreaterThan(0);
    const busy = run(60);
    expect(animation.football.attention).toBe(0);
    expect(busy).toBe(false);
  });

  it('asks for frames only while it is changing', () => {
    const { motion, run } = setup();
    expect(run(100)).toBe(false);
    motion.setEmphasis('chess', true);
    expect(run(50)).toBe(true);
    expect(run(200)).toBe(false);
  });

  it('is per prop: lightening one leaves the others at rest', () => {
    const { animation, motion, run } = setup();
    motion.setEmphasis('football', true);
    run(300);
    for (const spec of PROPS) expect(animation[spec.id].attention).toBe(spec.id === 'football' ? 1 : 0);
  });
});

describe('actions', () => {
  it('has a timeline for every prop, and the wheel spins down over three seconds', () => {
    for (const spec of PROPS) {
      const t = ACTION_TIMING[spec.id];
      expect(t.riseMs, spec.id).toBeGreaterThan(0);
      expect(t.holdMs, spec.id).toBeGreaterThanOrEqual(0);
      expect(t.returnMs, spec.id).toBeGreaterThanOrEqual(0);
    }
    expect(ACTION_TIMING['bicycle-wheel'].riseMs).toBe(3000);
  });

  it('runs 0 to 1 over its own duration, holds, and comes back to 0', () => {
    const { animation, motion, run, wait, settled } = setup();
    const t = ACTION_TIMING['recipe-drawer'];
    expect(motion.trigger('recipe-drawer')).toBe(true);
    expect(motion.running('recipe-drawer')).toBe(true);
    run(t.riseMs / 2);
    expect(animation['recipe-drawer'].action).toBeGreaterThan(0.4);
    expect(animation['recipe-drawer'].action).toBeLessThan(0.6);
    run(t.riseMs / 2 + 2 * FRAME);
    expect(animation['recipe-drawer'].action).toBe(1);
    // It holds without asking for frames, and says when to wake.
    expect(run(FRAME)).toBe(false);
    expect(motion.nextWakeMs()).toBeGreaterThan(t.holdMs - 200);
    wait(t.holdMs + 10);
    expect(motion.nextWakeMs()).toBe(0);
    expect(run(FRAME)).toBe(true);
    run(t.returnMs / 2);
    expect(animation['recipe-drawer'].action).toBeGreaterThan(0.3);
    expect(animation['recipe-drawer'].action).toBeLessThan(0.7);
    run(t.returnMs);
    expect(animation['recipe-drawer'].action).toBe(0);
    expect(motion.running('recipe-drawer')).toBe(false);
    expect(settled).toEqual(['recipe-drawer']);
    expect(motion.nextWakeMs()).toBeNull();
  });

  it('is monotone up while it rises and monotone down while it returns', () => {
    const { animation, motion, run, wait } = setup();
    motion.trigger('trophy-cabinet');
    let last = 0;
    run(ACTION_TIMING['trophy-cabinet'].riseMs + 50, () => {
      expect(animation['trophy-cabinet'].action).toBeGreaterThanOrEqual(last);
      last = animation['trophy-cabinet'].action;
    });
    wait(ACTION_TIMING['trophy-cabinet'].holdMs + 10);
    run(FRAME);
    run(ACTION_TIMING['trophy-cabinet'].returnMs + 50, () => {
      expect(animation['trophy-cabinet'].action).toBeLessThanOrEqual(last + 1e-9);
      last = animation['trophy-cabinet'].action;
    });
    expect(last).toBe(0);
  });

  it('ignores a second activation while it is rising or falling', () => {
    const { motion, run, wait } = setup();
    motion.trigger('repair-kit');
    run(200);
    expect(motion.trigger('repair-kit')).toBe(false);
    run(ACTION_TIMING['repair-kit'].riseMs);
    wait(ACTION_TIMING['repair-kit'].holdMs + 10);
    run(FRAME);
    run(100);
    expect(motion.trigger('repair-kit')).toBe(false);
  });

  it('lets a second activation while it holds put it away early', () => {
    const { animation, motion, run } = setup();
    motion.trigger('recipe-drawer');
    run(ACTION_TIMING['recipe-drawer'].riseMs + 100);
    expect(animation['recipe-drawer'].action).toBe(1);
    expect(motion.trigger('recipe-drawer')).toBe(true);
    run(ACTION_TIMING['recipe-drawer'].returnMs + 100);
    expect(animation['recipe-drawer'].action).toBe(0);
  });

  it('cuts a wheel back to rest at the end of its hold, since a spun-down wheel looks like a still one', () => {
    const { animation, motion, run, wait } = setup();
    motion.trigger('bicycle-wheel');
    run(3100);
    expect(animation['bicycle-wheel'].action).toBe(1);
    wait(500);
    run(FRAME);
    run(FRAME);
    expect(animation['bicycle-wheel'].action).toBe(0);
  });

  it('runs several props at once, each on its own timeline', () => {
    const { animation, motion, run } = setup();
    motion.trigger('football');
    run(500);
    motion.trigger('chess');
    run(100);
    expect(animation.football.action).toBeGreaterThan(animation.chess.action);
    expect(motion.runningIds()).toEqual(['football', 'chess']);
  });

  it('under reduced motion jumps to the end pose in one frame and back after the hold: nothing in between', () => {
    const { animation, motion, run, wait } = setup(true);
    motion.trigger('recipe-drawer');
    const seen = new Set<number>();
    run(FRAME * 3, () => seen.add(animation['recipe-drawer'].action));
    expect([...seen]).toEqual([1]);
    wait(ACTION_TIMING['recipe-drawer'].holdMs + 10);
    run(FRAME * 3, () => seen.add(animation['recipe-drawer'].action));
    expect([...seen].sort()).toEqual([0, 1]);
    expect(motion.running('recipe-drawer')).toBe(false);
  });
});

describe('glint and reset', () => {
  it('keeps the glint between 0 and 1', () => {
    const { animation, motion } = setup();
    motion.setGlint('football', 3);
    expect(animation.football.glint).toBe(1);
    motion.setGlint('football', -2);
    expect(animation.football.glint).toBe(0);
    motion.setGlint('football', 0.4);
    expect(animation.football.glint).toBe(0.4);
  });

  it('puts every prop back to rest', () => {
    const { animation, motion, run } = setup();
    motion.setEmphasis('chess', true);
    motion.trigger('football');
    motion.setGlint('work-glove', 1);
    run(500);
    motion.reset();
    for (const spec of PROPS) expect(animation[spec.id]).toEqual({ attention: 0, action: 0, glint: 0 });
    expect(motion.runningIds()).toEqual([]);
    expect(run(100)).toBe(false);
  });
});
