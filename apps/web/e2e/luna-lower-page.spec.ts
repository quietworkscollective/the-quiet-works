import { expect, test } from '@playwright/test';

test.describe('the exhibition lower page', () => {
  test('keeps the archive, details and colophon content-height and reachable', async ({ page }) => {
    await page.goto('/');
    for (const selector of ['#archive', '#details', '.tqw-footer']) {
      const section = page.locator(selector);
      await expect(section).toBeVisible();
      expect(await section.evaluate((node) => getComputedStyle(node).minHeight)).toBe('0px');
    }

    const footer = page.locator('.tqw-footer');
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeInViewport();
    await expect(footer.getByRole('navigation', { name: 'Footer links' }).getByRole('link')).toHaveText([
      'About',
      'Credits',
      'Privacy',
      'Agents',
      'Licences',
    ]);
  });

  test('fits a 320 pixel viewport without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});
