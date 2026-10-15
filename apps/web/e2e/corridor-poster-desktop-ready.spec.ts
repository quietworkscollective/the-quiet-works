import { expect, test } from '@playwright/test';
import { site } from './helpers.ts';

declare global {
  interface Window {
    __outlineDoorDecodeStarted?: boolean;
    __posterReadyObserved?: boolean;
  }
}

test('desktop poster waits for a live corridor frame while its chunk is held', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'This regression covers the desktop render path.');

  let markHeld = (): void => undefined;
  const held = new Promise<void>((resolve) => { markHeld = resolve; });
  let releaseRoute = (): void => undefined;
  const released = new Promise<void>((resolve) => { releaseRoute = resolve; });
  await page.route(/CorridorScene-[\w-]+\.js$/, async (route) => {
    markHeld();
    await released;
    await route.continue();
  });
  await page.addInitScript(() => {
    window.__outlineDoorDecodeStarted = false;
    window.__posterReadyObserved = false;
    const NativeDecompressionStream = window.DecompressionStream;
    Object.defineProperty(window, 'DecompressionStream', {
      configurable: true,
      value: new Proxy(NativeDecompressionStream, {
        construct(target, args) {
          if (args[0] === 'gzip') window.__outlineDoorDecodeStarted = true;
          return Reflect.construct(target, args);
        },
      }),
    });
    const observe = (element: Element): void => {
      if (element.matches('.tqw-poster') && element.getAttribute('data-ready') === 'true') {
        window.__posterReadyObserved = true;
      }
      element.querySelectorAll('.tqw-poster').forEach((poster) => {
        if (poster.getAttribute('data-ready') === 'true') window.__posterReadyObserved = true;
      });
    };
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes' && record.target instanceof Element) observe(record.target);
        for (const added of record.addedNodes) if (added instanceof Element) observe(added);
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-ready'] });
  });

  await page.goto('/');
  await held;
  const poster = page.locator('.tqw-poster');
  await expect(poster).toHaveCount(1);
  await expect(poster).toHaveAttribute('data-ready', 'false');
  await expect.poll(() => poster.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

  try {
    // Stay beyond the old eight-second fallback while the actual scene module cannot execute.
    await page.waitForTimeout(8500);
    await expect(site(page)).toHaveAttribute('data-scene-ready', 'false');
    await expect(poster).toHaveAttribute('data-ready', 'false');
  } finally {
    releaseRoute();
  }

  // The normal desktop path decodes the authored door asset while the live corridor draws.
  await expect.poll(() => page.evaluate(() => window.__outlineDoorDecodeStarted), { timeout: 30_000 }).toBe(true);
  await expect(page.locator('.tqw-corridor-canvas canvas')).toHaveAttribute('data-content', 'ready', { timeout: 30_000 });
  await expect(site(page)).toHaveAttribute('data-scene-ready', 'true', { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => window.__posterReadyObserved)).toBe(true);
});
