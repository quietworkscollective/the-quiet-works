import { describe, expect, it } from 'vitest';
import type { Found } from './context.ts';
import type { CueTarget } from './cueText.ts';
import { CUE_TUNING } from './cueTuning.ts';
import { createCueTracker } from './cueTracker.ts';

const BOARD: CueTarget = { kind: 'board' };
const WHEEL: CueTarget = { kind: 'prop', id: 'bicycle-wheel' };
const found = (target: CueTarget, blocked = false): Found => ({ target, distanceM: 2, gazeDeg: 5, blocked });

function setup(reduced = false) {
  let t = 1000;
  const tracker = createCueTracker({ nowMs: () => t, reduced: () => reduced });
  return {
    tracker,
    wait: (ms: number) => {
      t += ms;
    },
  };
}

describe('when a label appears', () => {
  it('waits for the target to be steady for 250 ms: a label is not a flash as the visitor walks past', () => {
    const { tracker, wait } = setup();
    expect(tracker.update(found(BOARD))).toEqual({ target: null, visible: false });
    wait(CUE_TUNING.dwellMs - 10);
    expect(tracker.update(found(BOARD)).target).toBeNull();
    wait(20);
    expect(tracker.update(found(BOARD))).toEqual({ target: BOARD, visible: true });
  });

  it('starts the wait again if the target changes or is lost before it completes', () => {
    const { tracker, wait } = setup();
    tracker.update(found(BOARD));
    wait(200);
    tracker.update(found(WHEEL));
    wait(200);
    expect(tracker.update(found(WHEEL)).target).toBeNull();
    wait(60);
    expect(tracker.update(found(WHEEL)).target).toEqual(WHEEL);
    const other = setup();
    other.tracker.update(found(BOARD));
    other.wait(200);
    other.tracker.update(null);
    other.wait(200);
    expect(other.tracker.update(found(BOARD)).target).toBeNull();
  });

  it('shows one label at a time: a second target waits until the first has gone', () => {
    const { tracker, wait } = setup();
    tracker.update(found(BOARD));
    wait(300);
    expect(tracker.update(found(BOARD)).target).toEqual(BOARD);
    // `find` hands the label over: the first goes (fading), the second waits its own 250 ms.
    expect(tracker.update(found(WHEEL))).toEqual({ target: BOARD, visible: false });
    wait(CUE_TUNING.fadeOutMs + 10);
    expect(tracker.update(found(WHEEL))).toEqual({ target: null, visible: false });
    wait(CUE_TUNING.dwellMs);
    expect(tracker.update(found(WHEEL))).toEqual({ target: WHEEL, visible: true });
  });

  it('does not start for a target behind a wall', () => {
    const { tracker, wait } = setup();
    tracker.update(found(BOARD, true));
    wait(1000);
    expect(tracker.update(found(BOARD, true)).target).toBeNull();
  });
});

describe('when a label goes', () => {
  function shown(reduced = false) {
    const s = setup(reduced);
    s.tracker.update(found(BOARD));
    s.wait(300);
    s.tracker.update(found(BOARD));
    return s;
  }

  it('fades out over 120 ms once the thing is lost, and is gone after', () => {
    const { tracker, wait } = shown();
    expect(tracker.update(null)).toEqual({ target: BOARD, visible: false });
    wait(CUE_TUNING.fadeOutMs - 20);
    expect(tracker.update(null)).toEqual({ target: BOARD, visible: false });
    wait(40);
    expect(tracker.update(null)).toEqual({ target: null, visible: false });
  });

  it('does not fade under reduced motion: it goes at once', () => {
    const { tracker } = shown(true);
    expect(tracker.update(null)).toEqual({ target: null, visible: false });
  });

  it('survives 349 ms behind a wall and goes at 350 ms', () => {
    const { tracker, wait } = shown();
    expect(tracker.update(found(BOARD, true)).visible).toBe(true);
    wait(CUE_TUNING.occludedMs - 1);
    expect(tracker.update(found(BOARD, true)).visible).toBe(true);
    wait(2);
    expect(tracker.update(found(BOARD, true)).visible).toBe(false);
  });

  it('forgets an occlusion that cleared: the 350 ms starts over the next time', () => {
    const { tracker, wait } = shown();
    tracker.update(found(BOARD, true));
    wait(300);
    tracker.update(found(BOARD, false));
    wait(100);
    expect(tracker.update(found(BOARD, true)).visible).toBe(true);
    wait(300);
    expect(tracker.update(found(BOARD, true)).visible).toBe(true);
  });
});

describe('waking', () => {
  it('says when the wait or the fade ends, so a still scene settles with no frame drawn', () => {
    const { tracker, wait } = setup();
    expect(tracker.nextWakeMs()).toBeNull();
    tracker.update(found(BOARD));
    expect(tracker.nextWakeMs()).toBe(CUE_TUNING.dwellMs);
    wait(100);
    expect(tracker.nextWakeMs()).toBe(CUE_TUNING.dwellMs - 100);
    wait(200);
    tracker.update(found(BOARD));
    expect(tracker.nextWakeMs()).toBeNull();
    tracker.update(null);
    expect(tracker.nextWakeMs()).toBe(CUE_TUNING.fadeOutMs);
  });

  it('forgets everything on reset', () => {
    const { tracker, wait } = setup();
    tracker.update(found(BOARD));
    wait(300);
    tracker.update(found(BOARD));
    tracker.reset();
    expect(tracker.view()).toEqual({ target: null, visible: false });
    expect(tracker.nextWakeMs()).toBeNull();
  });
});
