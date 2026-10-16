import { expect, test } from '@playwright/test';

test('text mode startup keeps the written fallback out of the handover and shows no scene poster', { tag: '@fast' }, async ({ page }) => {
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/assets\/index-[\w-]+\.js$/, async route => { await held; await route.continue(); });
  try {
    await page.goto('/?mode=text', { waitUntil: 'commit' });
    await page.locator('#static-content').waitFor({ state: 'attached' });
    await expect(page.locator('#static-content')).toBeHidden();
    expect(await page.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage)).toBe('none');
  } finally { release(); }
  await expect(page.locator('.tqw-hero')).toHaveAttribute('data-text', 'true');
  await expect(page.locator('#static-content')).toBeHidden();
  await expect(page.locator('.tqw-poster')).toHaveCount(0);
});
