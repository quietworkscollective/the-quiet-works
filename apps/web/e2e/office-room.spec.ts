import { toggleOfficePlaces } from './officePlaces.ts';
import { expect, test } from '@playwright/test';
import { app, audioContexts, closeMenu, countAudioContexts, expectStamps, openMenu, roomReady, stampTarget, stampWithKeyboard } from './helpers.ts';

test('R-8: a distant 3D press approaches before it can stamp', async ({ page }, info) => {
  await page.goto('/certification-office');
  await expect(page.locator('.tqw-canvas')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  const target = await stampTarget(page);
  if (info.project.name === 'mobile') await page.touchscreen.tap(target.x, target.y);
  else await page.mouse.click(target.x, target.y);
  await expectStamps(page, 0);
  await expect(app(page)).toHaveAttribute('data-station', 'desk');
  const close = await stampTarget(page);
  if (info.project.name === 'mobile') await page.touchscreen.tap(close.x, close.y);
  else await page.mouse.click(close.x, close.y);
  await expectStamps(page, 1);
});

test('R-8: a keyboard stamp acts from arrival and frames the desk', async ({ page }) => {
  await page.goto('/certification-office');
  await expect(page.locator('.tqw-canvas')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await toggleOfficePlaces(page);
  await stampWithKeyboard(page);
  await expectStamps(page, 1);
  await expect(app(page)).toHaveAttribute('data-station', 'desk');
  await page.getByRole('button', { name: 'Step back', exact: true }).click();
  await expect(app(page)).toHaveAttribute('data-station', 'room');
});

test('movement keys release the desk while its DOM control has focus', async ({ page }) => {
  await page.goto('/certification-office');
  await expect(page.locator('.tqw-canvas')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await toggleOfficePlaces(page);
  const approach = page.getByRole('button', { name: 'Approach the desk', exact: true });
  await approach.click();
  await expect(app(page)).toHaveAttribute('data-station', 'desk');
  await approach.focus();
  await page.keyboard.press('w');
  await expect(app(page)).toHaveAttribute('data-station', 'room');
});


test('dragging from the distant physical press looks without approaching or stamping', async ({ page }, info) => {
  await page.goto('/certification-office');
  await expect(page.locator('.tqw-canvas')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect(page.locator('.tqw-canvas')).toHaveAttribute('data-position', /1\.62/, { timeout: 25_000 });
  const target = await stampTarget(page);
  const canvas = page.locator('.tqw-canvas');
  const position = await canvas.getAttribute('data-position');
  const pose = await canvas.getAttribute('data-pose');
  if (info.project.name === 'mobile') {
    const touch = await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [target] });
    for (let step = 1; step <= 8; step++) await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: target.x + step * 12, y: target.y }],
    });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touch.detach();
  } else {
    await page.mouse.move(target.x, target.y); await page.mouse.down();
    await page.mouse.move(target.x + 96, target.y, { steps: 8 }); await page.mouse.up();
  }
  await expect(canvas).not.toHaveAttribute('data-pose', pose ?? '');
  await expect(canvas).toHaveAttribute('data-position', position ?? '');
  await expect(app(page)).toHaveAttribute('data-station', 'room');
  await expectStamps(page, 0);
});

test('wheel travel stays silent and scrolling the DOM inspection leaves the camera alone', async ({ page }) => {
  await countAudioContexts(page);
  await page.goto('/certification-office');
  await expect(page.locator('.tqw-canvas')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect(page.locator('.tqw-canvas')).toHaveAttribute('data-position', /1\.62/, { timeout: 25_000 }); await stampTarget(page);
  const canvas = page.locator('.tqw-canvas');
  const before = await canvas.getAttribute('data-position');
  const point = await stampTarget(page);
  await page.mouse.move(point.x, point.y); await page.mouse.wheel(0, 100);
  await expect(canvas).not.toHaveAttribute('data-position', before ?? '');
  await expect.poll(() => audioContexts(page)).toBe(0);
  await expectStamps(page, 0);
  // Let the shared 300 ms acceleration and 180 ms settling finish before inspecting.
  await expect(canvas).toHaveAttribute('data-moving', 'false', { timeout: 25_000 });
  await toggleOfficePlaces(page);
  await page.getByText('Things nearby', { exact: true }).click();
  const summary = await page.getByText('Things nearby', { exact: true }).boundingBox();
  if (!summary) throw new Error('inspection control is missing');
  const resting = await canvas.getAttribute('data-position');
  await page.mouse.move(summary.x + summary.width / 2, summary.y + summary.height / 2);
  await page.mouse.wheel(0, 200); await page.waitForTimeout(1500);
  await expect(canvas).toHaveAttribute('data-position', resting ?? '');
});

test('a reduced-motion station captures the outgoing image and cuts to a stationary view', async ({ page }) => {
  await page.goto('/certification-office');
  await expect(page.locator('.tqw-canvas')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect(page.locator('.tqw-canvas')).toHaveAttribute('data-position', /1\.62/, { timeout: 25_000 }); await stampTarget(page);
  await roomReady(page);
  // Settings live in the Menu (ADR 0003).
  const menu = await openMenu(page);
  await menu.getByRole('button', { name: 'Reduced motion' }).click();
  await closeMenu(page);
  await page.evaluate(() => {
    const overlay = document.querySelector<HTMLCanvasElement>('.tqw-office-dissolve');
    if (!overlay) throw new Error('dissolve canvas is missing');
    const result = { copied: false, positions: [] as string[] };
    (window as unknown as { officeCut: typeof result }).officeCut = result;
    new MutationObserver(() => {
      if (overlay.width > 1 && overlay.height > 1) {
        const pixels = overlay.getContext('2d')?.getImageData(0, 0, overlay.width, overlay.height).data;
        result.copied ||= Boolean(pixels?.some((value, index) => index % 4 !== 3 && value > 0));
      }
    }).observe(overlay, { attributes: true });
    const canvas = document.querySelector('.tqw-canvas');
    let previousPosition = canvas?.getAttribute('data-position');
    if (canvas) new MutationObserver(() => {
      const position = canvas.getAttribute('data-position');
      if (position && previousPosition !== position) {
        previousPosition = position; result.positions.push(position);
      }
    }).observe(canvas, { attributes: true, attributeFilter: ['data-position'] });
  });
  await toggleOfficePlaces(page);
  await page.getByRole('button', { name: 'View the window', exact: true }).click();
  await expect(page.locator('.tqw-canvas')).toHaveAttribute('data-position', '-2.25,1.62,6.70');
  await expect.poll(() => page.evaluate(() => (window as unknown as { officeCut: { copied: boolean } }).officeCut.copied)).toBe(true);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => (window as unknown as { officeCut: { positions: string[] } }).officeCut.positions))
    .toEqual(['-2.25,1.62,6.70']);
});


test('a nearby free view holds the press without reclaiming camera framing', async ({ page }, info) => {
  await page.goto('/certification-office');
  await expect(page.locator('.tqw-canvas')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect(page.locator('.tqw-canvas')).toHaveAttribute('data-position', /1\.62/, { timeout: 25_000 });
  await toggleOfficePlaces(page);
  await page.getByRole('button', { name: 'Approach the desk', exact: true }).click();
  await expect(app(page)).toHaveAttribute('data-station', 'desk');
  await toggleOfficePlaces(page);
  await page.keyboard.down('a'); await page.waitForTimeout(100); await page.keyboard.up('a');
  await expect(app(page)).toHaveAttribute('data-station', 'room');
  const canvas = page.locator('.tqw-canvas');
  await expect(canvas).toHaveAttribute('data-moving', 'false', { timeout: 25_000 });
  const origin = await canvas.getAttribute('data-position');
  const view = await stampTarget(page);
  await page.mouse.move(view.x, view.y); await page.mouse.wheel(0, -20);
  await expect(canvas).not.toHaveAttribute('data-position', origin ?? '');
  await expect(canvas).toHaveAttribute('data-moving', 'false', { timeout: 25_000 });
  const before = await canvas.getAttribute('data-pose');
  const pose = (before ?? '').split(',').map(Number);
  expect(Math.hypot((pose[0] ?? 0) + 1, (pose[1] ?? 0) - 2.9)).toBeLessThan(0.3);
  const target = await stampTarget(page);
  const touch = info.project.name === 'mobile' ? await page.context().newCDPSession(page) : null;
  if (touch) await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [target] });
  else { await page.mouse.move(target.x, target.y); await page.mouse.down(); }
  await expect(app(page)).toHaveAttribute('data-pressing', 'true');
  await page.waitForTimeout(400);
  await expect(canvas).toHaveAttribute('data-pose', before ?? '');
  await expect(app(page)).toHaveAttribute('data-station', 'room');
  if (touch) { await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await touch.detach(); }
  else await page.mouse.up();
  await expectStamps(page, 1);
  const again = await stampTarget(page);
  if (info.project.name === 'mobile') await page.touchscreen.tap(again.x, again.y);
  else await page.mouse.click(again.x, again.y);
  await expectStamps(page, 2);
  await expect(canvas).toHaveAttribute('data-pose', before ?? '');
});
