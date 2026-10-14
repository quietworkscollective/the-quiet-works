import { expect, test } from '@playwright/test';

/**
 * The test browser renders in software, which the site detects and answers with its lite tier: no
 * finishing stack, no atmosphere. Visitors on real GPUs get the full tier, so every suite that only
 * ever saw the lite tier missed what the stack changes. `?quality=high` forces the full tier here.
 *
 * Guards a real failure: the Office waits for two frames the visitor has seen before it opens, and
 * on the full tier the scene is drawn offscreen into the stack's buffer first, so it never opened.
 */
test.describe('the full rendering tier', () => {
  test.setTimeout(120_000);

  for (const path of ['/certification-office', '/']) {
    test(`opens ${path} with the finishing stack mounted`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${path}?quality=high`);
      const site = page.locator('.tqw-site');
      if (path === '/') await expect(site).toHaveAttribute('data-spine', /entrance|corridor/, { timeout: 60_000 });
      else await expect(site).toHaveAttribute('data-spine', 'chamber', { timeout: 60_000 });
      expect(errors).toEqual([]);
    });
  }
});
