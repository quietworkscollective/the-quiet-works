import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { EXCHANGE_VIEWS, type ExchangeViewId } from '../src/chambers/exchange/stage.ts';

const VIEW_ROUTE: Readonly<Record<ExchangeViewId, readonly string[]>> = {
  wide: ['Board'],
  jacks: ['Board', 'View jacks'],
  'desk-top': ['Board', 'View desk top'],
  kneehole: ['Desk underside'],
  shelf: ['Ticket shelf'],
};
const VIEWS = Object.keys(VIEW_ROUTE) as ExchangeViewId[];

/** Every object a visitor can read by name, the view that holds it, and the finding it records. */
const OBJECT_ACTIONS = [
  ['wide', 'Lift the cardigan', 'cardigan'],
  ['desk-top', 'Lift handset', 'handset-first'],
  ['desk-top', 'Read the rulebook', 'rulebook'],
  ['desk-top', 'Turn the cap', 'tea-flask'],
  ['kneehole', 'Trace the diagram', 'wiring-diagram'],
  ['shelf', 'Read rota', 'shift-roster'],
  ['shelf', 'Read index', 'shelf-index'],
] as const;

const room = (page: Page) => page.locator('.tqw-exchange');
const action = (page: Page, name: string) => room(page).getByRole('button', { name, exact: true });

async function goToView(page: Page, view: ExchangeViewId): Promise<void> {
  for (const name of VIEW_ROUTE[view]) await action(page, name).click();
  await expect(room(page)).toHaveAttribute('data-view', view);
}

/** The room in 3D with its bake bound and its development inspection hook present. */
async function readyRoom(page: Page): Promise<void> {
  await page.goto('/the-exchange?quality=high&holes=magenta');
  await expect(room(page)).toHaveAttribute('data-mode', '3d');
  await expect(room(page)).toHaveAttribute('data-room-ready', 'true', { timeout: 60_000 });
  await expect(page.locator('.tqw-exchange-canvas')).toHaveAttribute('data-frame-ready', 'true', { timeout: 60_000 });
  await expect(page.locator('.tqw-exchange-canvas canvas')).toHaveAttribute('data-baked', 'exchange', { timeout: 60_000 });
  await page.waitForFunction(() => !!window.__tqwExchange);
}

const camera = (page: Page) => page.evaluate(() => {
  const room = window.__tqwExchange;
  if (!room) throw new Error('Missing fixed-stage inspection hook');
  return room.inspectCamera();
});

/** Waits out the frame that applies a view, then proves the camera sits on its authored pose. */
async function expectPose(page: Page, view: ExchangeViewId): Promise<void> {
  for (const [axis, value] of EXCHANGE_VIEWS[view].position.entries()) {
    await expect.poll(async () => (await camera(page)).position[axis], `${view} camera axis ${axis}`).toBeCloseTo(value, 2);
  }
}

test('text mode reaches every room object and records its finding', async ({ page }) => {
  await page.goto('/the-exchange?mode=text');
  await expect(page.getByRole('heading', { name: 'The Exchange', exact: true })).toBeVisible();
  for (const [view, name, id] of OBJECT_ACTIONS) {
    await goToView(page, view);
    await action(page, name).click();
    await expect(room(page)).toHaveAttribute('data-findings', new RegExp(`(^|,)${id}(,|$)`));
    await action(page, 'Close').click();
  }
});

test('waiting changes nothing: ten idle minutes neither start night service nor open a route', async ({ page }) => {
  await page.clock.install();
  await page.goto('/the-exchange?mode=text');
  await expect(room(page)).toHaveAttribute('data-service', 'day');
  const state = () => room(page).evaluate(element => ({ ...(element as HTMLElement).dataset }));
  const before = await state();
  await page.clock.runFor(10 * 60 * 1000);
  expect(await state()).toEqual(before);
  await expect(action(page, 'Resume service')).toHaveCount(0);
});

test('the Archive lists found titles only and contains no counters', async ({ page }) => {
  await page.goto('/the-exchange?mode=text');
  const reader = page.locator('.tqw-exchange-reader-body');
  await action(page, 'Archive').click();
  await expect(reader).toHaveText('Found records appear here.');
  await action(page, 'Close').click();
  await action(page, 'Lift the cardigan').click();
  await action(page, 'Close').click();
  await action(page, 'Archive').click();
  await expect(reader.locator('[data-archive-entry]')).toHaveText(['Cardigan on the chair']);
  const text = await reader.innerText();
  expect(text, 'archive content must not expose found or unfound totals').not.toMatch(/\d+\s*(?:\/|of)\s*\d+|found\s*:\s*\d+|total\s*:\s*\d+/i);
});

test.describe('the fixed stage', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('holds each framed view on its authored pose, with no holes, inside the room budgets', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await readyRoom(page);
    const captureRoot = process.env['TQW_CAPTURE_ROOT'] ?? testInfo.outputPath('captures');
    await mkdir(captureRoot, { recursive: true });
    const device = testInfo.project.name === 'desktop' ? 'desktop' : 'pixel-7';

    for (const view of VIEWS) {
      await goToView(page, view);
      await expectPose(page, view);
      const result = await page.evaluate(() => {
        const inspection = window.__tqwExchange;
        if (!inspection) throw new Error('Missing fixed-stage inspection hook');
        return { magenta: inspection.clearAndCountMagenta(), stats: inspection.stats() };
      });
      console.info(`[Exchange budget] ${device} ${view}: ${JSON.stringify(result)}`);
      expect(result.magenta, `${view} stage sweep`).toBe(0);
      expect(result.stats.calls, `${view} draw calls`).toBeLessThanOrEqual(150);
      expect(result.stats.triangles, `${view} visible triangles`).toBeLessThanOrEqual(250_000);
      expect(result.stats.lights, `${view} lights`).toBeLessThanOrEqual(6);
      await page.screenshot({ path: join(captureRoot, `${device}-${view}.png`) });
    }
    expect(errors).toEqual([]);
  });

  test('keys and a drag leave the camera where the view put it', async ({ page }) => {
    test.setTimeout(180_000);
    await readyRoom(page);
    const canvas = page.locator('.tqw-exchange-canvas canvas');
    for (const view of VIEWS) {
      await goToView(page, view);
      await expectPose(page, view);
      const before = await camera(page);
      await canvas.focus();
      for (const key of ['w', 'a', 's', 'd', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
        await page.keyboard.press(key);
        expect(await camera(page), `${key} at ${view}`).toEqual(before);
      }
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.move(box!.x + box!.width * 0.3, box!.y + box!.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(box!.x + box!.width * 0.7, box!.y + box!.height * 0.6, { steps: 8 });
      await page.mouse.up();
      expect(await camera(page), `drag at ${view}`).toEqual(before);
      await expect(room(page)).toHaveAttribute('data-view', view);
    }
  });
});
