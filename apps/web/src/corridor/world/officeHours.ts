/**
 * The notice board's office-hours card (ADR 0004) follows the visitor's own clock: the Office is
 * open from nine until five and closed between 17:00 and 09:00, local time. It reads nothing but
 * `Date`: no network, no storage, no time zone lookup. The card lies about nothing, because the
 * Office keeps no hours; it is a small kindness that says so.
 */

export type HoursState = 'open' | 'closed';

/** Hours of the visitor's local day: open from `opens` (inclusive) until `closes` (exclusive). */
export const OFFICE_HOURS = { opens: 9, closes: 17 } as const;

/** Whether the Office is "open" at `now` by the visitor's own clock. Closed from 17:00 up to, not including, 09:00. */
export function officeHoursState(now: Date): HoursState {
  const hour = now.getHours();
  return hour >= OFFICE_HOURS.opens && hour < OFFICE_HOURS.closes ? 'open' : 'closed';
}
