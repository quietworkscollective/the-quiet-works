import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCertificationStore } from '@tqw/engine';
import { TIMING } from '../../../timing.ts';
import { Director, OVERLOAD_SCRIPT, QUIET_HATCH_MS, type DirectorEvent } from './director.ts';

/** A store and a Director whose clock the test drives. */
function setup() {
  let now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const store = createCertificationStore();
  const director = new Director(store);
  const events: DirectorEvent[] = [];
  director.subscribe((e) => events.push(e));
  const detach = director.attach();
  return {
    store,
    events,
    detach,
    at: (t: number) => {
      now = t;
    },
    of: <T extends DirectorEvent['type']>(type: T) =>
      events.filter((e): e is Extract<DirectorEvent, { type: T }> => e.type === type),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('Director timing rule (timing.ts header)', () => {
  it('touches the paper descendMs after the contact cue', () => {
    const s = setup();
    s.at(5000);
    s.store.dispatch({ type: 'PRESS' });
    const [contact] = s.of('contact');
    expect(contact?.at).toBe(5000);
    expect(contact?.touchAt).toBe(5000 + 180);
    s.detach();
  });

  it('pushes a quick release out to contact + descend + minDwell', () => {
    const s = setup();
    s.at(5000);
    s.store.dispatch({ type: 'PRESS' });
    s.at(5010);
    s.store.dispatch({ type: 'RELEASE' });
    const [lift] = s.of('lift');
    expect(lift?.at).toBe(5000 + 180 + TIMING.minDwellMs);
    s.detach();
  });

  it('starts the lift at the release time once the dwell has passed', () => {
    const s = setup();
    s.at(5000);
    s.store.dispatch({ type: 'PRESS' });
    s.at(5000 + 900);
    s.store.dispatch({ type: 'RELEASE' });
    const [lift] = s.of('lift');
    expect(lift?.at).toBe(5900);
    s.detach();
  });

  it('prints replyDelayMs after the lift starts, and the imprint index is the stamp count', () => {
    const s = setup();
    s.at(5000);
    s.store.dispatch({ type: 'PRESS' });
    s.at(5010);
    s.store.dispatch({ type: 'RELEASE' });
    const [lift] = s.of('lift');
    const [reply] = s.of('reply');
    expect(lift?.n).toBe(1);
    expect(reply?.printAt).toBe((lift?.at ?? 0) + TIMING.replyDelayMs);
    expect(reply?.printEnd).toBe((lift?.at ?? 0) + TIMING.replyDelayMs + TIMING.printMs);
    s.detach();
  });
});

describe('Director overload and memo schedule', () => {
  function stamp(s: ReturnType<typeof setup>, t: number) {
    s.at(t);
    s.store.dispatch({ type: 'PRESS' });
    s.at(t + 300);
    s.store.dispatch({ type: 'RELEASE' });
  }

  it('starts the overload when the fifth reply finishes printing, memo after overloadMs', () => {
    const s = setup();
    for (let i = 0; i < 5; i += 1) stamp(s, 10_000 + i * 5000);
    const [overload] = s.of('overload');
    const replies = s.of('reply');
    expect(replies).toHaveLength(5);
    expect(overload?.at).toBe(replies[4]?.printEnd);
    const [memo] = s.of('memo-revealed');
    expect(memo?.source).toBe('overload');
    expect(memo?.hatchAt).toBe((overload?.at ?? 0) + OVERLOAD_SCRIPT.unlatchAt);
    s.detach();
  });

  it('keeps the overload on the shared choreography the sound desk schedules (printer start S)', () => {
    const s = setup();
    for (let i = 0; i < 5; i += 1) stamp(s, 10_000 + i * 5000);
    const printStart = s.of('reply')[4]?.printAt ?? Number.NaN;
    const [memo] = s.of('memo-revealed');
    // Latch lets go at S + overloadMs − latch lead; the hatch lands and the memo slides at S + overloadMs.
    expect(memo?.hatchAt).toBe(printStart + TIMING.overloadMs - TIMING.overloadLatchLeadMs);
    expect(memo?.slideAt).toBe(printStart + TIMING.overloadMs + TIMING.memoAfterLandMs);
    expect(OVERLOAD_SCRIPT.bellEnd).toBe(TIMING.bellRingMs);
    // Mechanical hesitation, then a weighted fall (art direction: 200–300 ms, 400–600 ms).
    const fallMs = TIMING.overloadLatchLeadMs - OVERLOAD_SCRIPT.hangMs;
    expect(OVERLOAD_SCRIPT.hangMs).toBeGreaterThanOrEqual(200);
    expect(OVERLOAD_SCRIPT.hangMs).toBeLessThanOrEqual(300);
    expect(fallMs).toBeGreaterThanOrEqual(400);
    expect(fallMs).toBeLessThanOrEqual(600);
    s.detach();
  });

  it('opens the hatch and slides the memo on the quiet schedule for stillness', () => {
    const s = setup();
    s.at(30_000);
    s.store.dispatch({ type: 'STILLNESS' });
    const [memo] = s.of('memo-revealed');
    expect(memo?.source).toBe('stillness');
    expect(memo?.hatchAt).toBe(30_000);
    expect(memo?.slideAt).toBe(30_000 + QUIET_HATCH_MS);
    s.detach();
  });

  it('stops delivering events after detach', () => {
    const s = setup();
    s.detach();
    s.at(5000);
    s.store.dispatch({ type: 'PRESS' });
    expect(s.events).toHaveLength(0);
  });
});
