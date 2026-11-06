import { expect, test } from '@playwright/test';
import { site } from './helpers.ts';

test('the Tomorrow Engine opens in the production build', async ({ page }) => {
  await page.goto('/tomorrow-engine');
  await expect(site(page)).toHaveAttribute('data-spine', 'chamber');
  await expect(page.locator('.tqw-tomorrow-engine')).toBeVisible();
  await expect(page.getByRole('dialog', { name: "This address isn't in the directory" })).toHaveCount(0);
});

test('the Tomorrow Engine is playable in text mode in the production build', async ({ page }) => {
  await page.goto('/tomorrow-engine?mode=text');
  await expect(site(page)).toHaveAttribute('data-spine', 'chamber');
  await expect(page.getByRole('button', { name: 'Wind once' }).first()).toBeVisible();
});
