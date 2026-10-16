import { expect, test } from '@playwright/test';
import { openMenu } from './helpers.ts';

// Text mode exercises the app's DOM contracts without coupling them to a rendering backend.
test.describe('deterministic app navigation', { tag: '@fast' }, () => {
  test('unreleased direct URLs keep their production not-found contract', async ({ page }) => {
    for (const slug of ['apartment', 'tomorrow-engine', 'great-atrium', 'the-exchange', 'outline-room']) {
      const scripts: string[] = [];
      const record = (request: import('@playwright/test').Request) => {
        if (request.resourceType() === 'script') scripts.push(new URL(request.url()).pathname);
      };
      page.on('request', record);
      await page.goto(`/${slug}?mode=text`);
      await expect(page.getByRole('dialog', { name: "This address isn't in the directory" })).toBeVisible();
      await expect(page.locator('.tqw-site')).toHaveAttribute('data-chamber', '');
      await expect(page.locator('.tqw-chamber-host')).toHaveCount(0);
      expect(scripts.some(path => /(?:exchange|outline|apartment)-[\w-]+\.js$/.test(path))).toBe(false);
      page.off('request', record);
    }
  });

  test('the released Office direct URL selects its text chamber', async ({ page }) => {
    await page.goto('/certification-office?mode=text');
    await expect(page.locator('.tqw-site')).toHaveAttribute('data-spine', 'chamber');
    await expect(page.locator('.tqw-site')).toHaveAttribute('data-chamber', 'certification-office');
    await expect(page.getByRole('heading', { name: 'The Certification Office', level: 1, exact: true })).toBeVisible();
    const menu = await openMenu(page);
    await menu.getByRole('button', { name: 'Return to the corridor', exact: true }).click();
    await expect(page.locator('.tqw-site')).toHaveAttribute('data-spine', 'corridor');
    await expect(page.getByRole('heading', { name: 'The corridor', exact: true })).toBeVisible();
  });

  test('the menu and footer navigate reading pages and restore the opener', async ({ page }) => {
    await page.goto('/?mode=text');
    const menu = await openMenu(page);
    await menu.getByRole('link', { name: 'About', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'About UNHELD' })).toBeVisible();
    await page.keyboard.press('Escape');
    for (const [route, heading] of [['about', 'About UNHELD'], ['credits', 'Credits'], ['privacy', 'Privacy']] as const) {
      const opener = page.locator(`.tqw-footer__links a[href="/${route}"]`);
      await opener.click();
      const reading = page.getByRole('dialog', { name: heading, exact: true });
      await expect(reading).toBeVisible();
      await reading.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(opener).toBeFocused();
    }
    await page.locator('.tqw-footer').getByRole('button', { name: 'Menu', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Menu', exact: true })).toBeVisible();
  });

  test('DOM navigation keeps the CSP quiet and produces no console or page errors', async ({ page, request }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' || /Content Security Policy|connect-src|script-src/i.test(message.text())) errors.push(message.text());
    });
    const response = await request.get('/');
    const html = await response.text();
    expect(html).toContain("connect-src 'none'");
    expect(html).not.toContain("script-src 'self' 'unsafe-inline'");
    await page.goto('/?mode=text');
    await (await openMenu(page)).getByRole('link', { name: 'Privacy', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Privacy', exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(errors).toEqual([]);
  });
});
