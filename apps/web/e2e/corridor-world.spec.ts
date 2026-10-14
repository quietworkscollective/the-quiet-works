import { expect, test, type Page } from '@playwright/test';
import { door, expectSpine, site } from './helpers.ts';

/**
 * The corridor world (lobby, architecture, doors, board, light) as the visitor meets it: it
 * draws without console noise, its doors answer a pointer, and it draws nothing while idle.
 * Scene content and look are checked by the evidence screenshots; this guards behaviour.
 */

declare global {
  interface Window {
    __draws: number;
  }
}

/** Counts every WebGL draw call, so a frame loop that never idles shows up as a rising number. */
async function countDraws(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__draws = 0;
    const proto = WebGL2RenderingContext.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
    for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const original = proto[name];
      if (!original) continue;
      proto[name] = function counted(this: unknown, ...args: unknown[]) {
        window.__draws += 1;
        return original.apply(this, args);
      };
    }
  });
}

/**
 * Messages that are not the app's: fiber still builds the deprecated THREE.Clock (the Office
 * silences it for itself), and Chromium's GL driver prints one performance hint per process,
 * from whichever context first reads a pixel back (the Office's scene prints it too).
 */
const isKnownNoise = (text: string): boolean => text.includes('THREE.Clock') || text.includes('GL Driver Message');

/** The world has painted its lettering and drawn: the canvas carries `data-world="ready"`. */
async function worldReady(page: Page): Promise<void> {
  await expect(page.locator('.tqw-corridor-canvas canvas')).toHaveAttribute('data-world', 'ready', { timeout: 30_000 });
}

async function doorTargets(page: Page): Promise<Record<string, [number, number]>> {
  const canvas = page.locator('.tqw-corridor-canvas');
  await expect(canvas).not.toHaveAttribute('data-door-targets', '{}');
  return JSON.parse((await canvas.getAttribute('data-door-targets')) ?? '{}') as Record<string, [number, number]>;
}

test.describe('corridor world', () => {
  test('draws the lobby and corridor without console errors or warnings', async ({ page }) => {
    const noise: string[] = [];
    page.on('console', (m) => {
      if (['error', 'warning'].includes(m.type()) && !isKnownNoise(m.text())) noise.push(`${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`));
    await page.goto('/');
    await expectSpine(page, 'entrance');
    await page.getByRole('link', { name: 'Enter The Quiet Works' }).click();
    await expectSpine(page, 'corridor');
    await doorTargets(page);
    expect(noise).toEqual([]);
  });

  test('draws nothing while idle: no frames in the landing or the corridor', async ({ page }) => {
    await countDraws(page);
    await page.goto('/');
    await expect(page.locator('.tqw-corridor-canvas canvas')).toHaveCount(1);
    // Fonts, then the lettering, then the first frames; give the scene time to settle.
    await page.waitForTimeout(4000);
    const idle = async (): Promise<number> => {
      const before = await page.evaluate(() => window.__draws);
      await page.waitForTimeout(1500);
      return (await page.evaluate(() => window.__draws)) - before;
    };
    // The hero is the one place the scene moves by itself (ADR 0003): a slow arc, drawn at about fifteen
    // frames a second. So the landing is bounded, not silent; the corridor, below, is silent.
    const frames = async (): Promise<number> => Number((await page.locator('.tqw-corridor-canvas').getAttribute('data-frames')) ?? 0);
    const framesBefore = await frames();
    await page.waitForTimeout(3000);
    expect((await frames()) - framesBefore, 'frames drawn in 3 s on the landing').toBeLessThanOrEqual(55);
    await page.getByRole('link', { name: 'Enter The Quiet Works' }).click();
    await expectSpine(page, 'corridor');
    await doorTargets(page);
    await page.waitForTimeout(3000);
    expect(await idle(), 'draw calls while idle in the corridor').toBe(0);
  });

  test('a door answers the pointer: hover shows a pointer, a click focuses it, the floor does nothing', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Enter The Quiet Works' }).click();
    await expectSpine(page, 'corridor');
    await worldReady(page);
    const targets = await doorTargets(page);
    const apartment = targets['apartment'];
    expect(apartment, 'the Apartment door is on screen at hand-over').toBeDefined();
    const [x, y] = apartment!;
    const cursor = () => page.evaluate(() => document.querySelector<HTMLCanvasElement>('.tqw-corridor-canvas canvas')?.style.cursor);
    // The floor at the foot of the view is not a door.
    const size = page.viewportSize()!;
    await page.mouse.move(size.width / 2, size.height * 0.92);
    await expect.poll(cursor).toBe('');
    await page.mouse.move(x, y);
    await expect.poll(cursor).toBe('pointer');
    await page.mouse.click(x, y);
    await expect(site(page)).toHaveAttribute('data-focus', 'apartment');
    // A sealed door stays shut: the visitor is still in the corridor, at the same URL.
    await expectSpine(page, 'corridor');
    await expect(page).toHaveURL(/\/$/);
  });

  test('going through the Office and back twice leaves a working corridor each time', async ({ page }) => {
    test.setTimeout(150_000);
    const noise: string[] = [];
    page.on('console', (m) => {
      if (['error', 'warning'].includes(m.type()) && !isKnownNoise(m.text())) noise.push(m.text());
    });
    await page.goto('/');
    await page.getByRole('link', { name: 'Enter The Quiet Works' }).click();
    await expectSpine(page, 'corridor');
    for (let i = 0; i < 2; i += 1) {
      await worldReady(page);
      await door(page, 'The Certification Office', 'open').focus();
      await page.keyboard.press('Enter');
      // The Office's own scene is slow to start on a software rasteriser: allow it.
      await expect(site(page)).toHaveAttribute('data-spine', 'chamber', { timeout: 45_000 });
      await page.getByRole('button', { name: 'Return to the corridor' }).click();
      await expectSpine(page, 'corridor');
    }
    await worldReady(page);
    expect(noise).toEqual([]);
  });
});
