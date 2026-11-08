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

// Guards the founder's iPhone review (2026-11-08): the scene was a 96-184 px strip under a stack of
// large grids, too small to touch, and every reader replaced it. The scene must now take most of a
// phone browser's height, the controls fit one compact panel beneath it, and an open reader must
// leave the upper part of the scene in view.
test('on a phone browser the scene leads, the controls fit one compact panel, and an open reader leaves the scene in view', async ({ page }) => {
  const viewport = page.viewportSize()!;
  test.skip(viewport.width > 799, 'phone layout only');
  await readyRoom(page);
  const box = (selector: string) => page.locator(selector).first().boundingBox();
  const scene = (await box('.tqw-exchange-stage'))!;
  const primary = (await box('.tqw-exchange-primary'))!;
  const stations = (await box('.tqw-exchange-stations'))!;
  const actions = (await box('.tqw-exchange-actions'))!;
  const credit = (await box('.tqw-exchange-credit'))!;
  expect(scene.height / viewport.height, 'share of the height given to the scene').toBeGreaterThanOrEqual(0.45);
  expect(actions.y + actions.height - primary.y, 'the whole control panel').toBeLessThanOrEqual(200);
  for (const row of [stations, actions]) expect(row.height, 'one row of controls').toBeLessThanOrEqual(48);
  expect(credit.y, 'credit below the actions').toBeGreaterThanOrEqual(actions.y + actions.height);
  await page.locator('.tqw-exchange-primary').click();
  await expect(page.locator('.tqw-exchange-reader')).toBeVisible();
  const reader = (await box('.tqw-exchange-reader'))!;
  expect(reader.y - scene.y, 'scene left in view above the open reader').toBeGreaterThanOrEqual(scene.height * 0.55);
});

// A drag in the scene looks around from the station, within a bounded arc, and a drag is never
// taken for a tap. Before this, the scene answered taps only and the view could not be turned.
test('a drag in the scene looks around within a bounded arc and does not tap', async ({ page }) => {
  await readyRoom(page);
  const stage = page.locator('.tqw-exchange-canvas');
  const frame = (await stage.boundingBox())!;
  const reader = await room(page).getAttribute('data-reader');
  const drag = async (dx: number, dy: number) => {
    const x = frame.x + frame.width / 2;
    const y = frame.y + frame.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let step = 1; step <= 8; step += 1) await page.mouse.move(x + dx * step / 8, y + dy * step / 8);
    await page.mouse.up();
  };
  await drag(120, 40);
  const gaze = () => stage.getAttribute('data-gaze').then(value => (value ?? '0,0').split(',').map(Number));
  const [yaw, pitch] = await gaze();
  expect(yaw, 'turned by the drag').toBeGreaterThan(0.1);
  expect(pitch, 'tilted by the drag').toBeGreaterThan(0.02);
  await drag(4000, 4000);
  const [farYaw, farPitch] = await gaze();
  expect(farYaw, 'yaw stops at the arc').toBeLessThanOrEqual(0.35);
  expect(farPitch, 'pitch stops at the arc').toBeLessThanOrEqual(0.18);
  expect(await room(page).getAttribute('data-reader'), 'a drag opens nothing').toBe(reader);
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

  test('keys leave the camera where the view put it, and a drag only looks around from there', async ({ page }) => {
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
      // A drag turns the view in place (issue #27): the camera stays put and turns by a bounded angle.
      const after = await camera(page);
      expect(after.position, `drag at ${view} moves nothing`).toEqual(before.position);
      const cos = after.direction.reduce((sum, v, i) => sum + v * before.direction[i]!, 0);
      const turned = (Math.acos(Math.min(1, cos)) * 180) / Math.PI;
      expect(turned, `drag at ${view} looks around`).toBeGreaterThan(1);
      expect(turned, `drag at ${view} stays within the look limit`).toBeLessThanOrEqual(25);
      await expect(room(page)).toHaveAttribute('data-view', view);
    }
  });
});
