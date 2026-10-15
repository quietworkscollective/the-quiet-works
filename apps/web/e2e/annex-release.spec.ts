import { expect, test } from '@playwright/test';
import { door, expectSpine } from './helpers.ts';

test.describe('Annex release gate in production', () => {
  for (const room of [
    { title: 'The Exchange', path: '/the-exchange' },
    { title: 'The Outline Room', path: '/outline-room' },
  ]) {
    test(`${room.path} is not found and does not load room code`, async ({ page }) => {
      const scriptRequests: string[] = [];
      page.on('request', (request) => {
        if (request.resourceType() === 'script') scriptRequests.push(new URL(request.url()).pathname);
      });
      await page.goto(room.path);

      await expect(page.getByRole('dialog', { name: "This address isn't in the directory" })).toBeVisible();
      await expect(page.locator('.tqw-site')).toHaveAttribute('data-chamber', '');
      await expect(page.locator('.tqw-exchange, .tqw-outline-room')).toHaveCount(0);
      expect(scriptRequests.some((url) => /exchange|outline|annex/i.test(url))).toBe(false);
      expect(await page.evaluate(() => Object.keys(window).filter((name) =>
        name.startsWith('__tqw') || name === '__outlineStageProbe' || name === '__bake',
      ))).toEqual([]);
    });
  }

  test('both Annex doors show the sealed state in the corridor', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Enter The Quiet Works' }).click();
    await expectSpine(page, 'corridor');

    for (const title of ['The Exchange', 'The Outline Room']) {
      await expect(door(page, title, 'sealed')).toHaveAttribute('data-status', 'sealed');
    }
  });
});
