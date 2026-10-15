import { expect, test } from '@playwright/test';
import { activateDoor, door, expectSpine } from './helpers.ts';

test.describe('Apartment release gate in production', () => {
  test('a direct route stays sealed and requests no Apartment code', async ({ page }) => {
    const scriptRequests: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.resourceType() === 'script') scriptRequests.push(new URL(request.url()).pathname);
    });
    await page.goto('/apartment');

    await expect(page.getByRole('dialog', { name: "This address isn't in the directory" })).toBeVisible();
    await expect(page.locator('.tqw-site')).toHaveAttribute('data-chamber', '');
    await expect(page.locator('.tqw-apartment')).toHaveCount(0);
    expect(scriptRequests.some((url) => /apartment|ApartmentChamber/i.test(url))).toBe(false);
    expect(await page.evaluate(() => Object.keys(window).filter((name) => name.startsWith('__apartment')))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('the corridor door says not yet open and cannot enter the Apartment', async ({ page }) => {
    const scriptRequests: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.resourceType() === 'script') scriptRequests.push(new URL(request.url()).pathname);
    });
    await page.goto('/?quality=high');
    await expectSpine(page, 'entrance');
    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2.6));
    await expectSpine(page, 'corridor');
    await page.getByRole('link', { name: 'Enter The Quiet Works' }).click();
    await expect(page.locator('.tqw-site')).toHaveAttribute('data-engaged', 'true');

    const apartmentDoor = door(page, 'The Apartment', 'sealed');
    await expect(apartmentDoor).toHaveAttribute('data-status', 'sealed');
    await activateDoor(page, 'The Apartment', 'sealed');
    await expect(page.locator('.tqw-site')).toHaveAttribute('data-spine', 'corridor');
    await expect(page.locator('.tqw-apartment')).toHaveCount(0);
    expect(scriptRequests.some((url) => /apartment|ApartmentChamber/i.test(url))).toBe(false);
    expect(errors).toEqual([]);
  });
});
