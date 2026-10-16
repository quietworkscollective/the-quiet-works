import { expect, test, type Page } from '@playwright/test';

const site = (page: Page) => page.locator('.tqw-site');
const world = (page: Page) => page.locator('.tqw-corridor-canvas');

async function swipe(page: Page, down: boolean, distance = 480): Promise<void> {
  const session = await page.context().newCDPSession(page);
  const x = 195;
  const centreY = 422;
  const fromY = down ? centreY - distance / 2 : centreY + distance / 2;
  const toY = down ? centreY + distance / 2 : centreY - distance / 2;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x, y: fromY }] });
  for (let i = 1; i <= 5; i += 1) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ id: 1, x, y: fromY + ((toY - fromY) * i) / 5 }],
    });
    await page.waitForTimeout(20);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}

async function scrollPage(page: Page, mobile: boolean, down: boolean, fine = false): Promise<void> {
  if (mobile) await swipe(page, !down, fine ? 20 : 480);
  else await page.mouse.wheel(0, down ? (fine ? 40 : 300) : fine ? -40 : -300);
  await page.waitForTimeout(250);
}

/** Scrolls from the hero through the smoke until the game window is in view, as a visitor would. */
async function handover(page: Page, mobile: boolean): Promise<void> {
  await page.goto('/');
  await expect(world(page).locator('canvas')).toHaveAttribute('data-world', 'ready', { timeout: 90_000 });
  for (let i = 0; i < 30 && (await site(page).getAttribute('data-spine')) !== 'corridor'; i += 1) {
    await scrollPage(page, mobile, true);
  }
  await expect(site(page)).toHaveAttribute('data-spine', 'corridor');
}

const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

test('scrolling through the smoke never takes the page: it scrolls on past the game window and back to the hero', async ({ page, isMobile }, info) => {
  // GitHub's software-rendered phone profile walks the whole hand-over far slower than a GPU.
  test.setTimeout(process.env['CI'] ? 420_000 : 180_000);
  test.skip(!['desktop', 'mobile'].includes(info.project.name), 'covered on desktop and Pixel 7');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await handover(page, isMobile);
  await expect(site(page)).toHaveAttribute('data-engaged', 'false');

  // The next gestures move the page, not the visitor: no hold.
  const atWindow = await scrollY(page);
  for (let i = 0; i < 3; i += 1) await scrollPage(page, isMobile, true);
  await expect.poll(() => scrollY(page)).toBeGreaterThan(atWindow);
  await expect(site(page)).toHaveAttribute('data-engaged', 'false');
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');

  for (let i = 0; i < 40 && (await scrollY(page)) > 0; i += 1) await scrollPage(page, isMobile, false);
  await expect.poll(() => scrollY(page)).toBe(0);
  await expect(site(page)).toHaveAttribute('data-spine', 'entrance');
  await expect(site(page)).toHaveAttribute('data-engaged', 'false');
});

test('reduced motion keeps the invitation at rest at the hand-over', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'covered on desktop');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(world(page).locator('canvas')).toHaveAttribute('data-world', 'ready', { timeout: 90_000 });
  await page.mouse.wheel(0, 2800);
  await expect(site(page)).toHaveAttribute('data-spine', 'corridor');
  await expect(site(page)).toHaveAttribute('data-reduced-motion', 'true');
  await expect(site(page)).toHaveAttribute('data-engaged', 'false');
  await expect(page.getByRole('button', { name: 'Enter The Quiet Works' })).toBeVisible();
  await page.getByRole('button', { name: 'Enter The Quiet Works' }).click();
  await expect(site(page)).toHaveAttribute('data-engaged', 'true');
});

test('Tab users get the invitation without automatic engagement', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'covered on desktop');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(world(page).locator('canvas')).toHaveAttribute('data-world', 'ready', { timeout: 90_000 });
  await page.keyboard.press('Home');
  await page.keyboard.press('Tab');
  await expect(page.locator('.tqw-skip')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.tqw-game__enter-button')).toBeFocused();
  await expect(site(page)).toHaveAttribute('data-engaged', 'false');
});

test('Leave and Escape release the engaged window', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'covered on desktop');
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await handover(page, false);
  await page.getByRole('button', { name: 'Enter The Quiet Works' }).click();
  await expect(site(page)).toHaveAttribute('data-engaged', 'true');
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(site(page)).toHaveAttribute('data-engaged', 'false');
  await page.mouse.wheel(0, -300);
  await expect(site(page)).toHaveAttribute('data-spine', 'entrance');

  await page.getByRole('button', { name: 'Enter The Quiet Works' }).click();
  await expect(site(page)).toHaveAttribute('data-engaged', 'true');
  await page.keyboard.press('Escape');
  await expect(site(page)).toHaveAttribute('data-engaged', 'false');
  await page.mouse.wheel(0, -300);
  await expect(site(page)).toHaveAttribute('data-spine', 'entrance');
});
