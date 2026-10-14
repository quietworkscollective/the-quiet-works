import { toggleOfficePlaces } from './officePlaces.ts';
import { expect, test } from '@playwright/test';
import sealed from '../../../packages/engine/src/sealed/certification-office.sealed.json' with { type: 'json' };
import { app, closeMenu, expectSpine, expectStamps, openMenu, site, stampWithKeyboard } from './helpers.ts';

test('text exploration opens retained discoveries and keeps papers through apparatus replay', async ({ page }) => {
  await page.goto('/certification-office?mode=text');
  await toggleOfficePlaces(page);
  // Settings live in the Menu (ADR 0003).
  const menu = await openMenu(page);
  await menu.getByRole('button', { name: 'Sound' }).click();
  await closeMenu(page);
  await page.getByText('Things nearby', { exact: true }).click();
  await page.getByRole('button', { name: /^Drawer:/ }).click();
  await expect(page.locator('[data-item-id="office-06"]')).toHaveAttribute('data-item-digest', sealed.items['office-06'].digest);
  await page.locator('[data-read-item="office-01"]').click();
  await expect(page.getByRole('dialog').locator('[data-item-id="office-01"]')).toHaveAttribute('data-item-digest', sealed.items['office-01'].digest);
  await expect(page.getByRole('dialog')).toContainText('Fictional institutional document');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Tiny underside stamp:/ }).click();
  await expect(page.locator('[data-item-id="office-07"]')).toHaveAttribute('data-item-digest', sealed.items['office-07'].digest);
  await page.locator('[data-keep-item="office-17"]').click();
  await page.getByRole('button', { name: /^Certificate register:/ }).click();
  await page.locator('[data-read-item="office-03"]').click();
  await expect(page.getByRole('dialog').locator('[data-item-id="office-03"]')).toHaveAttribute('data-item-digest', sealed.items['office-03'].digest);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Employee window:/ }).click();
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page.locator('[data-item-id="office-09"]')).toHaveAttribute('data-item-digest', sealed.items['office-09'].digest);
  await page.getByRole('button', { name: /^Routing tray:/ }).click();
  await page.locator('[data-keep-item="office-12"]').click();
  await page.getByRole('button', { name: 'Wait without stamping', exact: true }).click();
  await expectStamps(page, 0);
  await expect(app(page)).toHaveAttribute('data-shadow', 'true');
  await expect(page.locator('[data-item-id="office-10"]')).toHaveAttribute('data-item-digest', sealed.items['office-10'].digest);
  await page.getByRole('button', { name: /Memo 001/ }).click();
  await expect(page.getByRole('dialog')).toContainText('actually present');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Reset the apparatus', exact: true }).click();
  await expectStamps(page, 0);
  await expect(app(page)).toHaveAttribute('data-kept', /office-17/);
  await expect(app(page)).toHaveAttribute('data-kept', /office-12/);
  await expect(page.getByRole('button', { name: /Memo 001/ })).toHaveCount(1);
  await page.getByRole('button', { name: /Memo 001/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Issued while nobody was stamping.');
});

for (const route of ['entrance', 'side door', 'service route'] as const) {
  test(`${route} returns through the shared corridor anchor`, async ({ page }) => {
    await page.goto('/certification-office?mode=text');
  await toggleOfficePlaces(page);
    if (route === 'service route') for (let i = 0; i < 5; i++) await stampWithKeyboard(page);
    await page.getByRole('button', { name: `Leave through ${route}`, exact: true }).click();
    await expectSpine(page, 'corridor');
    await expect(site(page)).toHaveAttribute('data-focus', 'certification-office');
    await expect(page).toHaveURL(/mode=text/);
  });
}

test('stillness after overload exposes the shadow without replacing the first memo provenance', async ({ page }) => {
  await page.goto('/certification-office?mode=text');
  await toggleOfficePlaces(page);
  for (let i = 0; i < 5; i++) await stampWithKeyboard(page);
  await page.getByRole('button', { name: 'Wait without stamping', exact: true }).click();
  await expect(app(page)).toHaveAttribute('data-shadow', 'true');
  await expect(page.locator('[data-item-id="office-10"]')).toHaveAttribute('data-item-digest', sealed.items['office-10'].digest);
  await expect(app(page)).toHaveAttribute('data-memo', 'overload');
  await expect(page.getByRole('button', { name: /Memo 001/ })).toHaveCount(1);
  await page.getByRole('button', { name: /Memo 001/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Ejected during an authority fault.');
});
