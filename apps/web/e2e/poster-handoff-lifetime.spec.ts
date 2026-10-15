import { expect, test } from '@playwright/test';
import { sceneTimeout } from './timeouts.ts';

declare global {
  interface Window {
    __posterHandoffSample?: { attached: boolean; ready: string | null; opacity: string; duration: string };
    __posterRemovalMs?: number;
  }
}

test('poster readiness stays observable and a late transition cannot extend removal', async ({ page }) => {
  await page.addInitScript(() => {
    let poster: HTMLElement | null = null;
    let readyAt: number | undefined;
    const observer = new MutationObserver(() => {
      poster ??= document.querySelector<HTMLElement>('.tqw-poster');
      if (!poster) return;
      if (readyAt !== undefined) {
        if (!poster.isConnected) {
          window.__posterRemovalMs = performance.now() - readyAt;
          observer.disconnect();
        }
        return;
      }
      if (poster.getAttribute('data-ready') !== 'true') return;
      readyAt = performance.now();
      const element = poster;
      // Sample from readiness, independently of when the compositor reports the fade's end.
      window.setTimeout(() => {
        const style = getComputedStyle(element);
        window.__posterHandoffSample = {
          attached: element.isConnected, ready: element.getAttribute('data-ready'),
          opacity: style.opacity, duration: style.transitionDuration,
        };
      }, 2500);
      // A queued compositor event must not restart cleanup after a slow frame.
      window.setTimeout(() => element.dispatchEvent(new TransitionEvent('transitionend', {
        bubbles: true, propertyName: 'opacity',
      })), 3000);
    });
    observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-ready'] });
  });
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(/CorridorScene-[\w-]+\.js$/, async route => { await held; await route.continue(); });
  try {
    await page.goto('/');
    await expect(page.locator('.tqw-poster')).toHaveAttribute('data-ready', 'false');
  } finally { release(); }
  await expect.poll(() => page.evaluate(() => window.__posterHandoffSample), { timeout: sceneTimeout(30_000) }).toBeDefined();
  expect(await page.evaluate(() => window.__posterHandoffSample)).toEqual({
    attached: true, ready: 'true', opacity: '0', duration: '0.4s',
  });
  await expect.poll(() => page.evaluate(() => window.__posterRemovalMs), { timeout: sceneTimeout(30_000) }).toBeDefined();
  expect(await page.evaluate(() => window.__posterRemovalMs)).toBeLessThan(4500);
});
