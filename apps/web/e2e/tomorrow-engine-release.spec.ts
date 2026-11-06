import { expect, test } from '@playwright/test';

test('the Tomorrow Engine opens in the production build', async ({ page }) => {
  await page.goto('/tomorrow-engine?mode=text');
  await expect(page.locator('.tqw-tomorrow-engine')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Leave', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('dialog', { name: "This address isn't in the directory" })).toHaveCount(0);
});
