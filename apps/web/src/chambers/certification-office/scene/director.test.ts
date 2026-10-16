import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCertificationStore } from '@tqw/engine';
import { TIMING } from '../../../timing.ts';
import { Director, type DirectorEvent } from './director.ts';

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
    director,
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
  vi.useRealTimers();
});

describe('response completion', () => {
  it('releases the temporary press lock if the renderer misses the response frame', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const s = setup();
    const invalidate = vi.fn();
    s.director.setInvalidate(invalidate);
    s.store.dispatch({ type: 'PRESS' });
    s.store.dispatch({ type: 'RELEASE' });
    s.director.beginFrame(1001);
    invalidate.mockClear();
    vi.advanceTimersByTime(30_000);
    expect(invalidate).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(s.store.getState().processing).toBe(false);
    expect(s.store.getState().playStep).toBe('refused');
    expect(s.store.getState().memo.revealed).toBe(false);
    s.detach();
  });

  it('settles a reduced reply after its completed draw and cancels the later full-motion wake', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const s = setup();
    const invalidate = vi.fn();
    s.director.setInvalidate(invalidate);
    s.director.beginFrame(1000, true);
    s.store.dispatch({ type: 'PRESS' });
    s.store.dispatch({ type: 'RELEASE' });
    const reply = s.of('reply')[0]!;
    s.director.beginFrame(reply.printAt + 120, true);
    expect(s.store.getState().processing).toBe(true);
    s.director.afterFrame();
    await Promise.resolve();
    expect(s.store.getState().processing).toBe(false);
    invalidate.mockClear();
    vi.advanceTimersByTime(30_000);
    expect(invalidate).not.toHaveBeenCalled();
    s.detach();
  });

  it('settles the reduced submission reply after its completed draw, with no late wake', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const s = setup();
    const invalidate = vi.fn();
    s.director.setInvalidate(invalidate);
    s.director.beginFrame(1000, true);
    s.store.dispatch({ type: 'PRESS' });
    s.store.dispatch({ type: 'RELEASE' });
    const reply = s.of('reply')[0]!;
    s.director.beginFrame(reply.printAt + 119, true);
    s.director.afterFrame();
    await Promise.resolve();
    expect(s.store.getState().processing).toBe(true);
    s.director.beginFrame(reply.printAt + 120, true);
    s.director.afterFrame();
    await Promise.resolve();
    expect(s.store.getState().processing).toBe(false);
    expect(s.of('overload')).toHaveLength(0);
    expect(s.of('memo-revealed')).toHaveLength(0);
    invalidate.mockClear();
    vi.advanceTimersByTime(30_000);
    expect(invalidate).not.toHaveBeenCalled();
    s.detach();
  });

  it('cannot settle a new stamp with an old frame queued before reset', async () => {
    const s = setup();
    s.store.dispatch({ type: 'PRESS' });
    s.store.dispatch({ type: 'RELEASE' });
    s.director.beginFrame(31_000);
    s.director.afterFrame();
    s.store.dispatch({ type: 'RESET' });
    s.store.dispatch({ type: 'PRESS' });
    s.store.dispatch({ type: 'RELEASE' });
    await Promise.resolve();
    expect(s.store.getState().processing).toBe(true);
    s.director.beginFrame(32_000);
    s.director.afterFrame();
    await Promise.resolve();
    expect(s.store.getState().processing).toBe(false);
    s.detach();
  });
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

describe('Office reply and resolution events', () => {
  function stamp(s: ReturnType<typeof setup>, t: number) {
    s.at(t);
    s.store.dispatch({ type: 'PRESS' });
    s.at(t + 300);
    s.store.dispatch({ type: 'RELEASE' });
  }

  it('keeps repeat replies on the same sheet without overload or early memo reveal', () => {
    const s = setup();
    stamp(s, 10_000);
    s.store.dispatch({ type: 'RESPONSE_SETTLED', step: 1 });
    stamp(s, 15_000);
    const replies = s.of('reply');
    expect(replies).toHaveLength(2);
    expect(s.store.getState().stamps).toBe(1);
    expect(s.of('overload')).toHaveLength(0);
    expect(s.of('memo-revealed')).toHaveLength(0);
    s.detach();
  });

  it('does not turn a stillness event into a story beat', () => {
    const s = setup();
    s.at(30_000);
    s.store.dispatch({ type: 'STILLNESS' });
    expect(s.of('stillness')).toHaveLength(0);
    expect(s.of('memo-revealed')).toHaveLength(0);
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
