import { describe, expect, it } from 'vitest';
import { createGlintScheduler, GLINT, swell, targetKey, type GlintContext, type GlintTarget } from './glint.ts';

const BOARD: GlintTarget = { kind: 'board' };
const BALL: GlintTarget = { kind: 'prop', id: 'football' };
const OFFICE: GlintTarget = { kind: 'door', id: 'certification-office' };

function setup(random: () => number = () => 0.5) {
  let t = 0;
  const s = createGlintScheduler({ nowMs: () => t, random });
  const context: GlintContext & { enabled: boolean; list: GlintTarget[]; refuse: boolean } = {
    enabled: true,
    list: [BALL, OFFICE],
    refuse: false,
    candidates() {
      return this.list;
    },
    begin() {
      return !this.refuse;
    },
  };
  return {
    s,
    context,
    at: () => t,
    advance: (ms: number) => {
      t += ms;
    },
    /** Polls every 16 ms for `ms`, recording each glint as it starts and ends. */
    run(ms: number) {
      const glints: { key: string; start: number; end: number; peak: number }[] = [];
      let open: (typeof glints)[number] | null = null;
      const stop = t + ms;
      while (t < stop) {
        const frame = s.poll(context);
        if (frame) {
          const key = targetKey(frame.target);
          if (open && open.key !== key) {
            // Two glints showing at once is the failure this exists to catch.
            throw new Error(`overlap: ${open.key} and ${key} at ${t}`);
          }
          if (!open) {
            open = { key, start: t, end: t, peak: 0 };
            glints.push(open);
          }
          open.end = t;
          open.peak = Math.max(open.peak, frame.value);
        } else if (open) {
          open = null;
        }
        t += 16;
      }
      return glints;
    },
  };
}

describe('the swell', () => {
  it('is nothing at either end and full in the middle, smoothly', () => {
    expect(swell(0)).toBe(0);
    expect(swell(1)).toBe(0);
    expect(swell(0.5)).toBeCloseTo(1, 12);
    expect(swell(-1)).toBe(0);
    expect(swell(2)).toBe(0);
    for (let i = 1; i <= 20; i += 1) expect(swell(i / 40)).toBeGreaterThanOrEqual(swell((i - 1) / 40));
    for (let i = 21; i < 40; i += 1) expect(swell(i / 40)).toBeLessThanOrEqual(swell((i - 1) / 40));
  });
});

describe('the board pin at hand-over', () => {
  it('glints once for 800 ms when the visitor arrives, and nothing else glints with it', () => {
    const { s, context, run } = setup();
    s.arrived();
    const glints = run(3000);
    expect(glints).toHaveLength(1);
    expect(glints[0]!.key).toBe('board');
    expect(glints[0]!.end - glints[0]!.start).toBeGreaterThanOrEqual(800 - 40);
    expect(glints[0]!.end - glints[0]!.start).toBeLessThanOrEqual(800);
    expect(glints[0]!.peak).toBeGreaterThan(0.95);
    void context;
  });

  it('is 800 ms and the later ones 600 ms', () => {
    expect(GLINT.boardMs).toBe(800);
    expect(GLINT.objectMs).toBe(600);
  });

  it('waits for the scene to be quiet: a visitor who is busy gets it afterwards', () => {
    const { s, context, run } = setup();
    context.enabled = false;
    s.arrived();
    expect(run(5000)).toHaveLength(0);
    context.enabled = true;
    const glints = run(2000);
    expect(glints[0]!.key).toBe('board');
  });

  it('tries again if no render window is free, and does not give up', () => {
    const { s, context, run } = setup();
    context.refuse = true;
    s.arrived();
    expect(run(GLINT.retryMs * 2)).toHaveLength(0);
    context.refuse = false;
    expect(run(GLINT.retryMs * 2)[0]!.key).toBe('board');
  });
});

describe('the idle glint', () => {
  it('comes 18 to 25 seconds after the last one ended, however the dice fall', () => {
    for (const roll of [0, 0.25, 0.5, 0.999999]) {
      const { s, run } = setup(() => roll);
      s.arrived();
      const glints = run(120_000);
      expect(glints.length).toBeGreaterThanOrEqual(4);
      for (let i = 1; i < glints.length; i += 1) {
        const quiet = glints[i]!.start - glints[i - 1]!.end;
        expect(quiet, `roll ${roll}, glint ${i}`).toBeGreaterThanOrEqual(18_000 - 40);
        expect(quiet, `roll ${roll}, glint ${i}`).toBeLessThanOrEqual(25_000 + 40);
      }
    }
  });

  it('is 18 to 25 seconds', () => {
    expect(GLINT.minGapMs).toBe(18_000);
    expect(GLINT.maxGapMs).toBe(25_000);
  });

  it('lasts 600 ms and swells to full', () => {
    const { s, run } = setup();
    s.arrived();
    const glints = run(60_000).slice(1);
    expect(glints.length).toBeGreaterThan(1);
    for (const g of glints) {
      expect(g.end - g.start).toBeGreaterThanOrEqual(600 - 40);
      expect(g.end - g.start).toBeLessThanOrEqual(600);
      expect(g.peak).toBeGreaterThan(0.95);
    }
  });

  it('never has two showing at once, over ten minutes of polling', () => {
    // `run` throws if two different targets are ever showing together.
    const { s, run, context } = setup(() => Math.random());
    s.arrived();
    context.list = [BALL, OFFICE, BOARD, { kind: 'prop', id: 'chess' }];
    expect(() => run(600_000)).not.toThrow();
  });

  it('picks only from what could glint now, and only one thing', () => {
    const { s, context, run } = setup(() => 0.99);
    s.arrived();
    context.list = [BALL];
    const glints = run(70_000).slice(1);
    expect(glints.length).toBeGreaterThan(1);
    for (const g of glints) expect(g.key).toBe('prop:football');
  });

  it('can pick any of the candidates', () => {
    let roll = 0;
    const { s, context, run } = setup(() => roll);
    s.arrived();
    context.list = [BALL, OFFICE];
    const seen = new Set<string>();
    for (const r of [0, 0.99, 0, 0.99]) {
      roll = r;
      for (const g of run(30_000)) seen.add(g.key);
    }
    expect(seen.has('prop:football')).toBe(true);
    expect(seen.has('door:certification-office')).toBe(true);
  });

  it('looks again soon, and does not glint, when nothing is nearby', () => {
    const { s, context, run } = setup();
    s.arrived();
    run(2000);
    context.list = [];
    expect(run(60_000)).toHaveLength(0);
    context.list = [BALL];
    expect(run(10_000)[0]?.key).toBe('prop:football');
  });

  it('does nothing while a render window cannot be had, and glints when one can', () => {
    const { s, context, run } = setup();
    s.arrived();
    run(2000);
    context.refuse = true;
    expect(run(60_000)).toHaveLength(0);
    context.refuse = false;
    expect(run(10_000)).toHaveLength(1);
  });
});

describe('when it must not glint', () => {
  it('never glints while disabled (reduced motion, hidden, off screen, or the visitor busy), however long', () => {
    const { s, context, run } = setup();
    context.enabled = false;
    s.arrived();
    expect(run(600_000)).toHaveLength(0);
    expect(s.nextWakeMs()).toBeNull();
  });

  it('cuts a glint short the moment it is disabled, and does not resume it', () => {
    const { s, context, advance, run } = setup();
    s.arrived();
    expect(s.poll(context)).not.toBeNull();
    advance(300);
    expect(s.poll(context)?.value).toBeGreaterThan(0);
    context.enabled = false;
    expect(s.poll(context)).toBeNull();
    context.enabled = true;
    advance(100);
    // The board pin's highlight was a single one: it is not owed again, and the next is a full interval away.
    expect(s.poll(context)).toBeNull();
    expect(run(18_000 - 1000)).toHaveLength(0);
  });

  it('starts the quiet interval afresh after being disabled: it does not glint the moment it returns', () => {
    const { s, context, run } = setup();
    s.arrived();
    run(5000);
    context.enabled = false;
    run(60_000);
    context.enabled = true;
    expect(run(17_000)).toHaveLength(0);
  });
});

describe('waking', () => {
  it('says how long until something happens, so the shell can sleep between glints', () => {
    const { s, context, advance } = setup();
    expect(s.nextWakeMs()).toBeNull();
    s.arrived();
    s.poll(context);
    expect(s.nextWakeMs()).toBe(800);
    advance(800 + 1);
    s.poll(context);
    const wake = s.nextWakeMs()!;
    expect(wake).toBeGreaterThanOrEqual(GLINT.minGapMs - 20);
    expect(wake).toBeLessThanOrEqual(GLINT.maxGapMs);
  });

  it('forgets everything on reset', () => {
    const { s, context, run } = setup();
    s.arrived();
    s.poll(context);
    s.reset();
    expect(s.nextWakeMs()).toBeNull();
    // The board pin is no longer owed, and the quiet interval starts afresh.
    expect(run(17_000)).toHaveLength(0);
    expect(run(10_000).length).toBeGreaterThanOrEqual(1);
  });
});
