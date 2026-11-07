import { expect, test } from '@playwright/test';
import { site } from './helpers.ts';

test('the Exchange opens in the production build', async ({ page }) => {
  await page.goto('/the-exchange');
  await expect(site(page)).toHaveAttribute('data-spine', 'chamber');
  await expect(page.locator('.tqw-exchange')).toBeVisible();
  await expect(page.getByRole('dialog', { name: "This address isn't in the directory" })).toHaveCount(0);
});

test('the Exchange is playable in text mode in the production build', async ({ page }) => {
  await page.goto('/the-exchange?mode=text');
  await expect(site(page)).toHaveAttribute('data-spine', 'chamber');
  await expect(page.getByRole('button', { name: 'View jacks', exact: true }).first()).toBeVisible();
});
