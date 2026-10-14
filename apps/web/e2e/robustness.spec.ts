import { expect, test } from '@playwright/test';
import { site } from './helpers.ts';

test('a corridor renderer that cannot start falls back to text mode instead of a blank page', async ({ page }) => {
  // WebGL2 detection succeeds (first request), but the renderer's own context request fails,
  // as on a device that drops contexts under memory pressure.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    let webgl2Requests = 0;
    HTMLCanvasElement.prototype.getContext = function getContext(
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (type === 'webgl2') {
        webgl2Requests += 1;
        if (webgl2Requests > 1) return null;
      }
      return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto('/');
  await expect(site(page)).toHaveAttribute('data-text', 'true');
  await expect(page.getByRole('heading', { level: 1, name: 'The corridor' })).toBeVisible();
});
