import { toggleOfficePlaces } from './officePlaces.ts';
import { expect, test } from '@playwright/test';

test('Office controls are contextual and its accessible stamp operates directly from arrival', async ({ page }) => {
  await page.goto('/certification-office');
  await expect(page.locator('.tqw-canvas')).toHaveAttribute('data-position', /1.62/, { timeout: 30_000 });
  await expect(page.locator('.tqw-canvas')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  const app = page.locator('.tqw-app');
  await expect(app).toHaveAttribute('data-station', 'room');
  await expect(page.getByRole('button', { name: 'Hold to stamp the form', exact: true })).toBeHidden();
  await expect(page.getByRole('combobox', { name: 'Impression position' })).toBeHidden();
  await toggleOfficePlaces(page);
  await expect(page.getByRole('combobox', { name: 'Impression position' })).toBeHidden();
  const stamp = page.getByRole('button', { name: 'Hold to stamp the form', exact: true });
  await stamp.focus();
  await page.keyboard.down('Space');
  await expect(app).toHaveAttribute('data-pressing', 'true');
  await page.keyboard.up('Space');
  await expect(app).toHaveAttribute('data-stamps', '1');
  await expect(app).toHaveAttribute('data-station', 'desk', { timeout: 25_000 });
  await toggleOfficePlaces(page);
  await expect(stamp).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Impression position' })).toBeVisible();
  await expect(page.locator('.tqw-context-cue')).toBeVisible();
  await toggleOfficePlaces(page);
  await page.getByText('Things nearby', { exact: true }).click();
  const ink = page.getByRole('button', { name: /^Ink pad:/ });
  await ink.focus();
  await expect(page.locator('.tqw-context-cue')).toHaveAttribute('data-focused', 'true');
  await expect(page.locator('.tqw-context-cue button')).toHaveText('Open ink pad');
  await page.keyboard.down('s');
  await page.waitForTimeout(2400);
  await page.keyboard.up('s');
  await expect(ink).toBeFocused();
  await page.waitForTimeout(500);
  await expect(page.locator('.tqw-context-cue button')).toHaveText('Open ink pad');
  await page.getByText('Places and actions', { exact: true }).focus();
  await expect(page.locator('.tqw-context-cue')).toBeHidden();
});

test('preparing the room does not count as visitor stillness', async ({ page }) => {
  test.setTimeout(90_000);
  let releaseFonts = () => {};
  const fonts = new Promise<void>(resolve => { releaseFonts = resolve; });
  await page.route(/\.woff2(?:\?|$)/, async route => {
    const response = await route.fetch();
    await fonts;
    await route.fulfill({ response });
  });
  try {
    await page.goto('/certification-office', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.tqw-app')).toHaveAttribute('data-mode', '3d');
    await page.waitForTimeout(25_000);
    await expect(page.locator('.tqw-canvas')).toHaveAttribute('data-ready', 'false');
    await expect(page.locator('.tqw-app')).toHaveAttribute('data-memo', 'hidden');
    await expect(page.locator('.tqw-app')).toHaveAttribute('data-shadow', 'false');
  } finally { releaseFonts(); }
  await expect(page.locator('.tqw-canvas')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
});
