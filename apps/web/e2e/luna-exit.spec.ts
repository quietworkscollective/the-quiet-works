import { expect, test, type Page } from '@playwright/test';
import { CHAMBERS } from '@tqw/engine';
import { HERO_VIEW } from '../src/corridor/camera/viewpoints.ts';
import { SITE_SCROLL } from '../src/timing.ts';
import { corridorDrawn, spineIs } from './corridor-view.ts';
import { site } from './helpers.ts';

const canvas = (page: Page) => page.locator('.tqw-corridor-canvas');

function heroPose(page: Page) {
  const viewport = page.viewportSize()!;
  const pose = viewport.height > viewport.width ? HERO_VIEW.portrait : HERO_VIEW.desktop;
  return { x: pose.x, z: pose.z, yaw: pose.yawDeg };
}

async function scrollToProgress(page: Page, progress: number): Promise<void> {
  await page.evaluate(([p, run]) => window.scrollTo(0, window.innerHeight * run! * p!), [progress, SITE_SCROLL.runViewports]);
}

async function currentPose(page: Page): Promise<{ x: number; z: number; yaw: number }> {
  const values = ((await canvas(page).getAttribute('data-pose')) ?? '').split(',').map(Number);
  return { x: values[0] ?? 0, z: values[1] ?? 0, yaw: values[2] ?? 0 };
}

function near(a: { x: number; z: number; yaw: number }, b: { x: number; z: number; yaw: number }): boolean {
  return Math.abs(a.x - b.x) < 0.002 && Math.abs(a.z - b.z) < 0.002 && Math.abs(a.yaw - b.yaw) < 0.05;
}

function atHeroPose(a: { x: number; z: number; yaw: number }, b: { x: number; z: number; yaw: number }): boolean {
  // The returning visitor gets the authored entrance pose, then its shallow 4 cm / 0.3 degree drift.
  return Math.abs(a.x - b.x) <= 0.041 && Math.abs(a.z - b.z) < 0.002 && Math.abs(a.yaw - b.yaw) <= 0.301;
}

test.describe.configure({ timeout: 180_000 });

test('the Office strip returns to the corridor while the room is resting', async ({ page }) => {
  await page.goto('/certification-office');
  await spineIs(page, 'chamber');
  // Deep links arrive engaged; release the window to model a visitor resting after scrolling.
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(site(page)).toHaveAttribute('data-engaged', 'false');
  const back = page.getByRole('button', { name: 'Return to the corridor' });
  await expect(back).toBeVisible();
  await back.click();
  await spineIs(page, 'corridor');
  await expect(page.locator('.tqw-chamber-host')).toHaveCount(0);
});

test('the Menu returns from a room and closes before the chamber is left', async ({ page }) => {
  await page.goto('/certification-office');
  await spineIs(page, 'chamber');
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await page.locator('.tqw-game__tools').getByRole('button', { name: 'Menu' }).click();
  const dialog = page.getByRole('dialog', { name: 'Menu' });
  const back = dialog.getByRole('button', { name: 'Return to the corridor' });
  await expect(back).toBeVisible();
  await expect(dialog.locator('nav[aria-label="Pages"] button').first()).toHaveText('Return to the corridor');
  await back.click();
  await expect(dialog).toBeHidden();
  await spineIs(page, 'corridor');
  await expect(page.locator('.tqw-chamber-host')).toHaveCount(0);
});

test('the corridor return appears only on the current open room across every chamber route', async ({ page }) => {
  for (const chamber of CHAMBERS) {
    await page.goto(`/${chamber.slug}`);
    const isOpen = chamber.status === 'open';
    await spineIs(page, isOpen ? 'chamber' : 'corridor');
    const stripReturn = page.getByRole('button', { name: 'Return to the corridor' });
    if (isOpen) await expect(stripReturn).toBeVisible();
    else {
      await expect(page.locator('.tqw-chamber-host')).toHaveCount(0);
      await expect(stripReturn).toHaveCount(0);
    }

    await page.locator('.tqw-game__tools').getByRole('button', { name: 'Menu' }).click();
    const dialog = page.getByRole('dialog', { name: 'Menu' });
    const menuReturn = dialog.getByRole('button', { name: 'Return to the corridor' });
    if (isOpen) await expect(menuReturn).toBeVisible();
    else await expect(menuReturn).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Back to the entrance' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close the menu' }).click();
  }
});

test('an inert 3D Office hides its controls while text mode remains available', async ({ page }) => {
  await page.goto('/certification-office');
  await spineIs(page, 'chamber');
  const host = page.locator('.tqw-chamber-host');
  await expect(host).not.toHaveAttribute('inert', '');
  const places = host.locator('.tqw-app[data-mode="3d"] .tqw-places');
  await expect(places).toBeVisible();
  await places.getByText('Places and actions', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(places).toHaveAttribute('open', '');
  await expect(places.getByRole('button', { name: 'Approach the desk' })).toBeVisible();
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(host).toHaveAttribute('inert', '');
  await expect(places).toHaveCSS('visibility', 'hidden');
  await expect(host.locator('.tqw-app[data-mode="3d"] .tqw-desk-actions')).toHaveCSS('visibility', 'hidden');
  const cue = host.locator('.tqw-app[data-mode="3d"] .tqw-context-cue');
  if (await cue.count()) await expect(cue).toHaveCSS('visibility', 'hidden');
  await expect(host.locator('.tqw-visually-hidden').first()).toContainText('The Certification Office');

  await page.goto('/certification-office?mode=text');
  const textApp = page.locator('.tqw-app[data-mode="text"]');
  await expect(textApp).toBeVisible();
  await expect(textApp.locator('.tqw-places')).toHaveCSS('visibility', 'visible');
  await expect(textApp).toContainText('Certification Office');
});

test('Back to the entrance from the room returns the page and camera to the landing', async ({ page }) => {
  test.skip(test.info().project.name === 'webkit-iphone', 'camera reset is covered on desktop and Pixel 7');
  await page.goto('/certification-office');
  await spineIs(page, 'chamber');
  await page.locator('.tqw-game__tools').getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Back to the entrance' }).click();
  await spineIs(page, 'entrance');
  await expect(page.locator('.tqw-chamber-host')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await corridorDrawn(page);
  await expect.poll(async () => atHeroPose(await currentPose(page), heroPose(page)), { timeout: 10_000 }).toBe(true);
});

test('a walk up from the corridor restores the hero pose without a reverse corridor walk', async ({ page }) => {
  test.skip(test.info().project.name === 'webkit-iphone', 'camera reset is covered on desktop and Pixel 7');
  await page.goto('/');
  await corridorDrawn(page);
  await scrollToProgress(page, 1);
  await spineIs(page, 'corridor');
  await page.getByRole('button', { name: 'Enter The Quiet Works' }).click();
  await expect(site(page)).toHaveAttribute('data-engaged', 'true');
  const starting = await currentPose(page);
  await page.waitForTimeout(800);
  await page.keyboard.down('w');
  await expect.poll(async () => !near(await currentPose(page), starting), { timeout: 10_000 }).toBe(true);
  await page.keyboard.up('w');
  await page.getByRole('button', { name: /Leave/ }).click();
  await scrollToProgress(page, 0);
  await spineIs(page, 'entrance');
  await expect.poll(async () => atHeroPose(await currentPose(page), heroPose(page)), { timeout: 10_000 }).toBe(true);
  await expect(page.locator('.tqw-context-cue')).toHaveCount(0);
  await expect(page.locator('.tqw-walk')).toHaveCount(0);
});

test('the menu is the way back to the top from the corridor and a deep page', async ({ page }) => {
  await page.goto('/');
  await scrollToProgress(page, 1);
  await spineIs(page, 'corridor');
  await page.locator('.tqw-game__tools').getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Back to the entrance' }).click();
  await spineIs(page, 'entrance');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await corridorDrawn(page);
  await expect.poll(async () => atHeroPose(await currentPose(page), heroPose(page)), { timeout: 10_000 }).toBe(true);

  await page.locator('#details').scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.locator('footer').getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Back to the entrance' }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await spineIs(page, 'entrance');
  await corridorDrawn(page);
  await expect.poll(async () => atHeroPose(await currentPose(page), heroPose(page)), { timeout: 10_000 }).toBe(true);
});

test('the scene, hero motions and smoke run are active on this phone or browser', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const win = window as Window & {
      __tqwReadyAt?: number;
      __tqwAmbientLog?: { at: number; ids: string[] }[];
    };
    win.__tqwAmbientLog = [];
    let last = '';
    const inspect = () => {
      const ready = document.querySelector<HTMLCanvasElement>('.tqw-corridor-canvas canvas')?.dataset['world'] === 'ready';
      if (ready && win.__tqwReadyAt === undefined) win.__tqwReadyAt = performance.now();
      const ids = document.querySelector<HTMLElement>('.tqw-corridor-canvas')?.dataset['ambient'] ?? '';
      if (ids !== last) {
        last = ids;
        win.__tqwAmbientLog?.push({ at: performance.now(), ids: ids.split(',').filter(Boolean) });
      }
    };
    new MutationObserver(inspect).observe(document, {
      attributes: true,
      attributeFilter: ['data-world', 'data-ambient'],
      childList: true,
      subtree: true,
    });
    document.addEventListener('DOMContentLoaded', inspect, { once: true });
  });
  await page.goto('/');
  await corridorDrawn(page);
  await expect(site(page)).toHaveAttribute('data-scene-ready', 'true');
  await expect(site(page)).toHaveAttribute('data-reduced-motion', 'false');
  const initialHeroPose = await currentPose(page);
  await expect
    .poll(async () => {
      const current = await currentPose(page);
      return Math.abs(current.x - initialHeroPose.x) > 0.004 || Math.abs(current.yaw - initialHeroPose.yaw) > 0.04;
    }, { timeout: 10_000, intervals: [250] })
    .toBe(true);
  const readyAt = await page.evaluate(() => (window as Window & { __tqwReadyAt?: number }).__tqwReadyAt ?? performance.now());
  const withinWindow = (id: string, ms: number) => page.evaluate(
    ({ wanted, bound, ready }) => (window as Window & { __tqwAmbientLog?: { at: number; ids: string[] }[] })
      .__tqwAmbientLog?.some((entry) => entry.at >= ready && entry.at <= ready + bound && entry.ids.includes(wanted)) ?? false,
    { wanted: id, bound: ms, ready: readyAt },
  );
  await expect.poll(() => withinWindow('lobby-fan', 250), { timeout: 2_000 }).toBe(true);
  try {
    await expect.poll(() => withinWindow('board-paper', 4_000), { timeout: 7_000 }).toBe(true);
  } catch (error) {
    const log = await page.evaluate(() => {
      const win = window as Window & { __tqwAmbientLog?: { at: number; ids: string[] }[]; __tqwReadyAt?: number };
      return { readyAt: win.__tqwReadyAt, ambient: win.__tqwAmbientLog, current: document.querySelector<HTMLElement>('.tqw-corridor-canvas')?.dataset['ambient'] };
    });
    console.log(`[ambient paper schedule ${testInfo.project.name}] ${JSON.stringify(log)}`);
    throw error;
  }
  try {
    await expect.poll(() => withinWindow('lobby-dust', 8_000), { timeout: 11_000 }).toBe(true);
  } catch (error) {
    const log = await page.evaluate(() => {
      const win = window as Window & { __tqwAmbientLog?: { at: number; ids: string[] }[]; __tqwReadyAt?: number };
      return { readyAt: win.__tqwReadyAt, ambient: win.__tqwAmbientLog, current: document.querySelector<HTMLElement>('.tqw-corridor-canvas')?.dataset['ambient'] };
    });
    console.log(`[ambient schedule ${testInfo.project.name}] ${JSON.stringify(log)}`);
    throw error;
  }
  await expect(page.locator('.tqw-poster')).toHaveCount(0);

  await scrollToProgress(page, 0.55);
  const veil = page.locator('.tqw-veil');
  await expect.poll(async () => Number(await veil.getAttribute('data-coverage'))).toBeGreaterThan(0.8);
  await expect(veil).toHaveAttribute('data-textured', 'true');
  const rendered = await veil.locator('.tqw-veil__layer--a').evaluate(async (node) => {
    const style = getComputedStyle(node);
    const image = style.backgroundImage.match(/blob:[^)" ]+/)?.[0] ?? '';
    const imageLoaded = image ? await new Promise<boolean>((resolve) => {
      const loaded = new Image();
      loaded.onload = () => resolve(loaded.naturalWidth === 256 && loaded.naturalHeight === 256);
      loaded.onerror = () => resolve(false);
      loaded.src = image;
    }) : false;
    return {
      display: style.display, opacity: Number(style.opacity), backgroundImage: style.backgroundImage,
      transform: style.transform, zIndex: getComputedStyle(node.parentElement!).zIndex,
      scrimZIndex: getComputedStyle(document.querySelector('.tqw-game__scrim')!).zIndex,
      imageLoaded,
    };
  });
  expect(rendered.display).toBe('block');
  expect(rendered.opacity).toBeGreaterThan(0.1);
  expect(rendered.backgroundImage).toContain('blob:');
  expect(rendered.transform).not.toBe('none');
  expect(Number(rendered.zIndex)).toBeGreaterThan(Number(rendered.scrimZIndex));
  expect(rendered.imageLoaded).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`smoke-${testInfo.project.name}.png`) });
});
