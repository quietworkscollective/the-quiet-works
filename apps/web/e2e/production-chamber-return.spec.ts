import { expect, test } from '@playwright/test';
import { CHAMBERS } from '@tqw/engine';
import { site } from './helpers.ts';

// This literal release contract must change deliberately when another room is released.
const released = new Set(['certification-office']);

for (const chamber of CHAMBERS) {
  test(`production route /${chamber.slug} keeps its release and Menu return contract`, async ({ page }) => {
    await page.goto(`/${chamber.slug}`);
    const isReleased = released.has(chamber.id);
    const stripReturn = page.getByRole('button', { name: 'Return to the corridor' });
    if (isReleased) {
      await expect(site(page)).toHaveAttribute('data-spine', 'chamber');
      await expect(page.locator('.tqw-chamber-host')).toBeVisible();
      await expect(stripReturn).toBeVisible();
    } else {
      const missing = page.getByRole('dialog', { name: "This address isn't in the directory" });
      await expect(missing).toBeVisible();
      await expect(site(page)).toHaveAttribute('data-spine', 'entrance');
      await expect(site(page)).toHaveAttribute('data-page', 'not-found');
      await expect(page.locator('.tqw-chamber-host')).toHaveCount(0);
      await expect(stripReturn).toHaveCount(0);
      await missing.getByRole('link', { name: 'Back to the entrance', exact: true }).click();
      await expect(missing).toBeHidden();
      // The not-found recovery returns to the hero; reach the game strip before opening its Menu.
      await page.evaluate(() => {
        const game = document.getElementById('game')!;
        const window_ = game.querySelector<HTMLElement>('.tqw-game__window');
        window.scrollTo(0, game.offsetTop + game.offsetHeight - (window_?.offsetHeight ?? window.innerHeight));
      });
      await expect(site(page)).toHaveAttribute('data-spine', 'corridor');
    }

    await page.locator('.tqw-game__tools').getByRole('button', { name: 'Menu', exact: true }).click();
    const menu = page.getByRole('dialog', { name: 'Menu', exact: true });
    const menuReturn = menu.getByRole('button', { name: 'Return to the corridor' });
    if (isReleased) await expect(menuReturn).toBeVisible();
    else await expect(menuReturn).toHaveCount(0);
    const entrance = menu.getByRole('button', { name: 'Back to the entrance' });
    await expect(entrance).toBeVisible();
    await entrance.click();
    await expect(menu).toBeHidden();
    await expect(site(page)).toHaveAttribute('data-spine', 'entrance');
    await expect(page.locator('.tqw-chamber-host')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });
}
