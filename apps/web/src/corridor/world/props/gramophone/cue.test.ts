import { describe, expect, it } from 'vitest';
import { CUE, NO_CUE, stepCue, type CueState, type CueView, type CueViews } from './cue.ts';

const look = (distance: number, angleDeg: number, occluded = false): CueView => ({ distance, angleDeg, occluded });
const views = (needle: CueView | null, records: CueView | null = null): CueViews => ({ needle, records });

/** Run `state` forward over `ms` in 10 ms steps with the same view. */
function hold(state: CueState, v: CueViews, from: number, ms: number): { state: CueState; at: number } {
  let s = state;
  let t = from;
  for (let i = 0; i < ms / 10; i += 1) {
    t += 10;
    s = stepCue(s, v, t);
  }
  return { state: s, at: t };
}

describe('the gramophone\'s verb label', () => {
  it('holds the brief\'s numbers: 2.2 m and 25 degrees to earn it, 2.7 m and 35 to lose it, 250 ms to show, 350 ms occluded', () => {
    expect(CUE).toMatchObject({ eligibleM: 2.2, eligibleDeg: 25, showAfterMs: 250, fadeMs: 120, hideM: 2.7, hideDeg: 35, occludedMs: 350 });
  });

  it('appears only after 250 ms of being near and looking at the fitting', () => {
    const v = views(look(2, 10));
    let s = stepCue(NO_CUE, v, 0);
    expect(s.shown).toBeNull();
    ({ state: s } = hold(s, v, 0, 240));
    expect(s.shown).toBeNull();
    ({ state: s } = hold(s, v, 240, 20));
    expect(s.shown).toBe('needle');
  });

  it('does not appear beyond 2.2 m or outside 25 degrees, or when occluded', () => {
    for (const v of [look(2.3, 0), look(1, 26), look(1, 0, true)]) {
      const { state } = hold(NO_CUE, views(v), 0, 2000);
      expect(state.shown).toBeNull();
    }
  });

  it('is shown on the edge of the numbers: 2.2 m and 25 degrees count', () => {
    const { state } = hold(NO_CUE, views(look(2.2, 25)), 0, 300);
    expect(state.shown).toBe('needle');
  });

  it('restarts its wait if the visitor looks away in the meantime', () => {
    const near = views(look(1.5, 5));
    let { state, at } = hold(NO_CUE, near, 0, 200);
    ({ state, at } = hold(state, views(look(1.5, 40)), at, 20));
    expect(state.waiting).toBeNull();
    ({ state, at } = hold(state, near, at, 200));
    expect(state.shown).toBeNull();
    ({ state } = hold(state, near, at, 60));
    expect(state.shown).toBe('needle');
  });

  it('stays while the visitor drifts to 2.7 m or 35 degrees, and goes beyond them', () => {
    const shown = hold(NO_CUE, views(look(1.5, 5)), 0, 300);
    expect(shown.state.shown).toBe('needle');
    // Between the show and hide limits: still there.
    const drift = hold(shown.state, views(look(2.6, 33)), shown.at, 1000);
    expect(drift.state.shown).toBe('needle');
    expect(stepCue(drift.state, views(look(2.71, 10)), drift.at + 10).shown).toBeNull();
    expect(stepCue(drift.state, views(look(1, 35.5)), drift.at + 10).shown).toBeNull();
  });

  it('does not come back at once on the far side of the hide limit: it must earn the label again', () => {
    const shown = hold(NO_CUE, views(look(1.5, 5)), 0, 300);
    const gone = stepCue(shown.state, views(look(3, 5)), shown.at + 10);
    expect(gone.shown).toBeNull();
    // 2.5 m is past the show limit even though it is inside the hide limit.
    expect(hold(gone, views(look(2.5, 5)), shown.at + 10, 2000).state.shown).toBeNull();
  });

  it('keeps a label through a brief occlusion and drops it after 350 ms', () => {
    const shown = hold(NO_CUE, views(look(1.5, 5)), 0, 300);
    const blocked = views(look(1.5, 5, true));
    const early = hold(shown.state, blocked, shown.at, 340);
    expect(early.state.shown).toBe('needle');
    const late = hold(early.state, blocked, early.at, 20);
    expect(late.state.shown).toBeNull();
    // A break in the occlusion resets the count.
    const clear = hold(early.state, views(look(1.5, 5)), early.at, 10);
    expect(clear.state.occludedSince).toBeNull();
    expect(hold(clear.state, blocked, clear.at, 340).state.shown).toBe('needle');
  });

  it('shows one prompt at a time: the fitting looked at most directly, and it keeps the label until that goes', () => {
    const both = views(look(1.8, 20), look(1.6, 8));
    const { state, at } = hold(NO_CUE, both, 0, 300);
    expect(state.shown).toBe('records');
    // The other becomes the better-aimed one: the shown label does not jump.
    const swap = hold(state, views(look(1.8, 3), look(1.6, 12)), at, 1000);
    expect(swap.state.shown).toBe('records');
    // Only when it goes does the other earn its own label, after its own wait.
    const left = hold(swap.state, views(look(1.8, 3), look(3, 12)), swap.at, 10);
    expect(left.state.shown).toBeNull();
    expect(hold(left.state, views(look(1.8, 3), null), left.at, 300).state.shown).toBe('needle');
  });
});
