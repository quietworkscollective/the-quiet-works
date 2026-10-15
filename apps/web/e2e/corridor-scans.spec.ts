import { expect, test } from '@playwright/test';

/**
 * The corridor's scanned surfaces (plaster, terrazzo, oak, door paint, enamel, brass) arrive as
 * image files after the materials exist, and the world draws nothing until they are on their
 * materials. The canvas says how that went in `data-scans`: `ok`, or `failed:` and the ids that
 * could not be loaded (their materials keep a flat colour, and the world still draws).
 *
 * The production build is what is served here, so this also checks that the files are really
 * reachable under the Content-Security-Policy (img-src 'self' data:) and that the hashed asset
 * names resolve, which a unit test cannot.
 */

const canvas = (page: import('@playwright/test').Page) => page.locator('.tqw-corridor-canvas canvas');

test.describe('corridor scanned surfaces', () => {
  for (const [tier, url] of [
    ['lite', '/'],
    ['full', '/?quality=high'],
  ] as const) {
    test(`${tier} tier: every scan loads before the world is drawn`, async ({ page }) => {
      // A software rasteriser compiles the full tier's programs slowly.
      test.setTimeout(150_000);
      await page.goto(url);
      await expect(canvas(page)).toHaveAttribute('data-world', 'ready', { timeout: 120_000 });
      await expect(canvas(page)).toHaveAttribute('data-scans', 'ok');
    });
  }

  test('a scan that cannot be loaded is named, and the world still draws in its flat colour', async ({ page }) => {
    // The two smallest scans (enamel, brass) are inlined in the script as data: URLs, which cannot be blocked by name.
    await page.route('**/*.webp', (route) => route.abort());
    await page.goto('/');
    await expect(canvas(page)).toHaveAttribute('data-world', 'ready', { timeout: 45_000 });
    const scans = await canvas(page).getAttribute('data-scans');
    expect(scans).toMatch(/^failed:/);
    for (const id of ['plaster-worn', 'oak-panelling', 'terrazzo', 'painted-timber']) expect(scans).toContain(id);
  });
});
