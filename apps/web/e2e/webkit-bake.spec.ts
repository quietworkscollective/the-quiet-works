import { expect, test } from '@playwright/test';
import { site } from './helpers.ts';

// Every browser on an iPhone is WebKit. The corridor's baked lighting binds only when the runtime
// rebuilds exactly the meshes the bake recorded, so a geometry difference between JavaScript
// engines silently drops the bake for every iPhone visitor while Chrome stays lit.
test('the corridor binds its baked lighting in WebKit on a phone', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (/bake/i.test(message.text())) errors.push(message.text()); });
  await page.goto('/');
  await expect(site(page)).toHaveAttribute('data-spine', 'entrance', { timeout: 60_000 });
  await page.getByRole('link', { name: 'Enter The Quiet Works' }).click();
  await expect(site(page)).toHaveAttribute('data-engaged', 'true', { timeout: 30_000 });
  await expect(page.locator('.tqw-corridor-canvas canvas')).toHaveAttribute('data-baked', 'corridor', { timeout: 60_000 });
  expect(errors).toEqual([]);
});
