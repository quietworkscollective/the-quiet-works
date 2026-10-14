import { afterEach, describe, expect, it, vi } from 'vitest';
import { officeHoursState } from './officeHours.ts';

/** A visitor's clock: local time on the day, set through a mocked system time. */
function stateAt(hour: number, minute: number, second = 0): ReturnType<typeof officeHoursState> {
  vi.setSystemTime(new Date(2026, 9, 14, hour, minute, second));
  return officeHoursState(new Date());
}

describe('the office-hours card follows the visitor\'s clock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is open from 09:00 and closed from 17:00', () => {
    vi.useFakeTimers();
    expect(stateAt(8, 59, 59)).toBe('closed');
    expect(stateAt(9, 0)).toBe('open');
    expect(stateAt(12, 30)).toBe('open');
    expect(stateAt(16, 59, 59)).toBe('open');
    expect(stateAt(17, 0)).toBe('closed');
  });

  it('is closed all night, across midnight, until nine', () => {
    vi.useFakeTimers();
    for (const [h, m] of [[17, 1], [20, 0], [23, 59], [0, 0], [3, 30], [8, 0]] as const) expect(stateAt(h, m), `${h}:${m}`).toBe('closed');
  });

  it('reads the local clock, not UTC: the same instant is open for one visitor and closed for another', () => {
    // A fixed instant; whichever zone the test runs in, the answer must agree with that zone's own hour.
    const noonUtc = new Date(Date.UTC(2026, 9, 14, 12, 0, 0));
    const expected = noonUtc.getHours() >= 9 && noonUtc.getHours() < 17 ? 'open' : 'closed';
    expect(officeHoursState(noonUtc)).toBe(expected);
  });
});
