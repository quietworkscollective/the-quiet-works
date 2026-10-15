import { expect, test, type Page } from '@playwright/test';
import { expectSpine } from './helpers.ts';

/**
 * The lobby's life as the visitor meets it (ADR 0004): the board's office-hours card follows the
 * visitor's own clock, and the lobby draws without console noise, also under reduced motion. That
 * the lobby costs no frames while idle is guarded by corridor-world.spec.ts (a frozen Date would
 * stall the camera's timed hand-over, so it is not asserted here). How each looks is the evidence
 * screenshots' job; this guards behaviour.
 */

/** Messages that are not the app's (see corridor-world.spec.ts). */
const isKnownNoise = (text: string): boolean => text.includes('THREE.Clock') || text.includes('GL Driver Message');

const canvas = (page: Page) => page.locator('.tqw-corridor-canvas canvas');

/** The world has drawn: the canvas carries `data-world="ready"`. */
async function worldReady(page: Page): Promise<void> {
  await expect(canvas(page)).toHaveAttribute('data-world', 'ready', { timeout: 30_000 });
}

// Fixed instants are written with the zone's own offset (Sydney in May is UTC+10, no daylight
// saving), so each case reads as the local wall-clock time it names.
test.use({ timezoneId: 'Australia/Sydney' });

test.describe('the lobby board', () => {
  const cases: readonly { at: string; local: string; card: 'open' | 'closed'; why: string }[] = [
    { at: '2026-05-12T08:59:00+10:00', local: '08:59', card: 'closed', why: 'a minute before opening' },
    { at: '2026-05-12T09:00:00+10:00', local: '09:00', card: 'open', why: 'opening time' },
    { at: '2026-05-12T16:59:00+10:00', local: '16:59', card: 'open', why: 'a minute before closing' },
    { at: '2026-05-12T17:00:00+10:00', local: '17:00', card: 'closed', why: 'closing time' },
    // 23:30 here is 13:30 UTC and 02:00 here is 16:00 UTC the day before: a card that read UTC would say open.
    { at: '2026-05-12T23:30:00+10:00', local: '23:30', card: 'closed', why: 'late evening, which is working hours in UTC' },
    { at: '2026-05-12T02:00:00+10:00', local: '02:00', card: 'closed', why: 'the small hours, which are working hours in UTC' },
  ];

  // Loads the lobby under several clocks, too slow for software-rendered runners; the clock logic
  // itself is covered by officeHours.test.ts in the unit job.
  test("the office-hours card follows the visitor's own clock: open 09:00 to 17:00 local, closed otherwise", { tag: '@extended' }, async ({ page }) => {
    test.setTimeout(240_000);
    const noise: string[] = [];
    page.on('console', (m) => {
      if (['error', 'warning'].includes(m.type()) && !isKnownNoise(m.text())) noise.push(`${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`));
    for (const c of cases) {
      await page.clock.setFixedTime(new Date(c.at));
      await page.goto('/');
      await worldReady(page);
      await expect(canvas(page), `${c.local} (${c.why})`).toHaveAttribute('data-office-hours', c.card);
    }
    expect(noise).toEqual([]);
  });

  test('the card says the same on the landing and once the visitor is in the corridor', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-05-12T12:00:00+10:00'));
    await page.goto('/');
    await worldReady(page);
    await expect(canvas(page)).toHaveAttribute('data-office-hours', 'open');
    await page.getByRole('link', { name: 'Enter The Quiet Works' }).click();
    await expectSpine(page, 'corridor');
    await expect(canvas(page)).toHaveAttribute('data-office-hours', 'open');
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the lobby draws without noise and its card reads the clock', async ({ page }) => {
    const noise: string[] = [];
    page.on('console', (m) => {
      if (['error', 'warning'].includes(m.type()) && !isKnownNoise(m.text())) noise.push(`${m.type()}: ${m.text()}`);
    });
    await page.clock.setFixedTime(new Date('2026-05-12T18:30:00+10:00'));
    await page.goto('/');
    await worldReady(page);
    await expect(canvas(page)).toHaveAttribute('data-office-hours', 'closed');
    expect(noise).toEqual([]);
  });
});
