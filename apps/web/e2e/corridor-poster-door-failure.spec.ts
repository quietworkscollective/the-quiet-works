import { expect, test } from '@playwright/test';
import { site } from './helpers.ts';

declare global {
  interface Window {
    __outlineDoorDecodeFailed?: boolean;
    __outlineDoorHookInstalled?: boolean;
    __posterReadyObserved?: boolean;
  }
}

test('the corridor and hero poster become ready when the optional Outline door model fails', async ({ page }) => {
  await page.addInitScript(() => {
    window.__posterReadyObserved = false;
    const observePoster = (element: Element): void => {
      if (element.matches('.tqw-poster') && element.getAttribute('data-ready') === 'true') {
        window.__posterReadyObserved = true;
      }
      element.querySelectorAll('.tqw-poster').forEach((poster) => {
        if (poster.getAttribute('data-ready') === 'true') window.__posterReadyObserved = true;
      });
    };
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes' && record.target instanceof Element) observePoster(record.target);
        for (const added of record.addedNodes) if (added instanceof Element) observePoster(added);
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-ready'] });

    const NativeDecompressionStream = window.DecompressionStream;
    const brokenDoorDecoder = new Proxy(NativeDecompressionStream, {
      construct(target, args) {
        if (args[0] === 'gzip') {
          window.__outlineDoorDecodeFailed = true;
          throw new Error('Simulated Outline door asset decode failure');
        }
        return Reflect.construct(target, args);
      },
    });
    Object.defineProperty(window, 'DecompressionStream', { configurable: true, value: brokenDoorDecoder });
    window.__outlineDoorHookInstalled = true;
  });

  await page.goto('/');
  const poster = page.locator('.tqw-poster');
  const canvas = page.locator('.tqw-corridor-canvas canvas');
  await expect(poster).toHaveCount(1);
  await expect(poster).toHaveAttribute('data-ready', 'false');
  await expect.poll(() => page.evaluate(() => window.__outlineDoorHookInstalled)).toBe(true);

  await expect.poll(() => page.evaluate(() => window.__outlineDoorDecodeFailed), { timeout: 30_000 }).toBe(true);
  // The poster follows the drawn corridor content without waiting for the custom leaf's bake binding.
  await expect(canvas).toHaveAttribute('data-content', 'ready', { timeout: 7500 });
  await expect(site(page)).toHaveAttribute('data-scene-ready', 'true', { timeout: 7500 });
  await expect.poll(() => page.evaluate(() => window.__posterReadyObserved)).toBe(true);
  await expect(poster).toHaveCount(0, { timeout: 5000 });
  await expect(canvas).not.toHaveAttribute('data-world', 'ready');
});
