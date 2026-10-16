import { expect, test, type Page } from '@playwright/test';
import { audioContexts, countAudioContexts, site } from './helpers.ts';

async function swipe(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: 195, y: 662 }] });
  for (let step = 1; step <= 5; step += 1) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ id: 1, x: 195, y: 662 - step * 96 }],
    });
    await page.waitForTimeout(20);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}

/** Scrolls through the smoke to the resting game window, as a visitor would. Scrolling never engages it. */
async function arriveByScrolling(page: Page, mobile: boolean): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.tqw-corridor-canvas canvas')).toHaveAttribute('data-world', 'ready', { timeout: 90_000 });
  for (let step = 0; step < 20 && await site(page).getAttribute('data-spine') !== 'corridor'; step += 1) {
    if (mobile) await swipe(page);
    else await page.mouse.wheel(0, 280);
    await page.waitForTimeout(250);
  }
  await expect(site(page)).toHaveAttribute('data-spine', 'corridor');
  await expect(site(page)).toHaveAttribute('data-engaged', 'false');
}

const enterControl = (page: Page) => page.locator('.tqw-game__enter-button');

test('native hand-over and dragging leave audio locked until a deliberate Enter', async ({ page, isMobile }) => {
  await countAudioContexts(page);
  await arriveByScrolling(page, isMobile);
  expect(await audioContexts(page)).toBe(0);
  const size = page.viewportSize()!;
  const x = size.width / 2;
  const y = size.height * 0.8;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 70, y - 25, { steps: 8 });
  await page.mouse.up();
  expect(await audioContexts(page)).toBe(0);
  await enterControl(page).click();
  await expect(site(page)).toHaveAttribute('data-engaged', 'true');
  await expect.poll(() => audioContexts(page)).toBeGreaterThan(0);
});

test('after Leave the resting window gives the wheel back to the page', async ({ page, isMobile }) => {
  test.skip(isMobile, 'native mouse wheel');
  await arriveByScrolling(page, false);
  await enterControl(page).click();
  await expect(site(page)).toHaveAttribute('data-engaged', 'true');
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(site(page)).toHaveAttribute('data-engaged', 'false');
  const canvas = page.locator('.tqw-corridor-canvas');
  await expect(canvas).toHaveAttribute('data-at-handover', 'true');
  const pose = await canvas.getAttribute('data-pose');
  const y = await page.evaluate(() => window.scrollY);
  await page.mouse.move(720, 450);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(y + 300);
  await expect(canvas).toHaveAttribute('data-pose', pose!);
  await expect(site(page)).toHaveAttribute('data-engaged', 'false');
});
