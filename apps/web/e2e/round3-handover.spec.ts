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

async function pose(page: Page): Promise<{ x: number; z: number; yaw: number; pitch: number }> {
  return world(page).evaluate((el) => {
    const [x, z, yaw] = (el.getAttribute('data-pose') ?? '').split(',').map(Number);
    return { x: x ?? NaN, z: z ?? NaN, yaw: yaw ?? NaN, pitch: Number(el.getAttribute('data-pitch')) };
  });
}

async function handover(page: Page, mobile: boolean): Promise<void> {
  await page.goto('/');
  await expect(world(page).locator('canvas')).toHaveAttribute('data-world', 'ready', { timeout: 90_000 });
  if (!mobile) {
    for (let i = 0; i < 14 && await site(page).getAttribute('data-engaged') !== 'true'; i += 1) {
      await page.mouse.wheel(0, 280);
      await page.waitForTimeout(80);
    }
  } else {
    for (let i = 0; i < 8 && await site(page).getAttribute('data-engaged') !== 'true'; i += 1) {
      await scrollPage(page, true, true);
    }
  }
  await expect(site(page)).toHaveAttribute('data-spine', 'corridor');
}

test('the smoke hand-over engages and scrolling walks, then scrolls back to the hero without a click', async ({ page, isMobile }, info) => {
  // GitHub's software-rendered phone profile walks the whole hand-over far slower than a GPU.
  test.setTimeout(process.env['CI'] ? 420_000 : 180_000);
  test.skip(!['desktop', 'mobile'].includes(info.project.name), 'covered on desktop and Pixel 7');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await handover(page, isMobile);
  await expect(site(page)).toHaveAttribute('data-engaged', 'true');
  await expect(world(page)).toHaveAttribute('data-at-handover', 'true');
  const start = await pose(page);
  await scrollPage(page, isMobile, true);
  await expect.poll(async () => (await pose(page)).z, { timeout: 10_000 }).toBeLessThan(start.z - 0.08);

  for (
    let i = 0;
    i < 20 &&
    (await site(page).getAttribute('data-engaged')) === 'true' &&
    (await world(page).getAttribute('data-at-handover')) !== 'true';
    i += 1
  ) {
    await scrollPage(page, isMobile, false, true);
  }
  if ((await site(page).getAttribute('data-engaged')) === 'true') {
    await expect(world(page)).toHaveAttribute('data-at-handover', 'true');
    await scrollPage(page, isMobile, false);
  }
  await expect(site(page)).toHaveAttribute('data-engaged', 'false');
  await expect(site(page)).toHaveAttribute('data-spine', 'entrance');

  for (let i = 0; i < 12 && (await page.evaluate(() => window.scrollY)) > 0; i += 1) {
    await scrollPage(page, isMobile, false);
  }
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect.poll(async () => (await pose(page)).z, { timeout: 10_000 }).toBeCloseTo(9.8, 1);
  const entrance = await pose(page);
  expect(entrance.x).toBeCloseTo(0, 1);
  expect(entrance.yaw).toBeCloseTo(0, 0);
  expect(entrance.pitch).toBeCloseTo(0, 0);
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
