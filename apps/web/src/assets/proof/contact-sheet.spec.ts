import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Contact sheets for looking at the library: every model at standing scale under neutral warm light,
 * and every surface on a 2 m panel with a sphere. Evidence only; skipped unless TQW_EVIDENCE_DIR names
 * a folder outside the repository.
 *
 *   TQW_EVIDENCE_DIR=<folder> TQW_ASSET_PORT=5180 pnpm --filter @tqw/web exec playwright test \
 *     -c src/assets/proof/playwright.config.ts contact-sheet
 */
const evidence = process.env.TQW_EVIDENCE_DIR;

test.describe('contact sheets', () => {
  test.skip(!evidence, 'TQW_EVIDENCE_DIR is not set');

  // TQW_SINGLE_IDS=a,b renders those assets alone and larger, for a close look.
  for (const id of (process.env.TQW_SINGLE_IDS ?? '').split(',').filter(Boolean)) {
    test(`${id} alone`, async ({ page }) => {
      await page.goto(`/index.html?view=single&id=${id}`);
      await page.evaluate(() => (window as unknown as { __harness: { ready: Promise<void> } }).__harness.ready);
      const errors = await page.evaluate(() => (window as unknown as { __harness: { errors: string[] } }).__harness.errors);
      expect(errors).toEqual([]);
      mkdirSync(evidence ?? '.', { recursive: true });
      await page.locator('canvas').screenshot({ path: path.join(evidence ?? '.', `single-${id}.png`) });
    });
  }

  for (const view of ['models', 'surfaces'] as const) {
    test(`every ${view.slice(0, -1)} in one sheet`, async ({ page }) => {
      await page.goto(`/index.html?view=${view}`);
      await page.evaluate(() => (window as unknown as { __harness: { ready: Promise<void> } }).__harness.ready);
      const state = await page.evaluate(() => {
        const h = (window as unknown as { __harness: { violations: unknown[]; errors: string[]; coverage: number[] } }).__harness;
        return { violations: h.violations, errors: h.errors, coverage: h.coverage };
      });
      expect(state.violations).toEqual([]);
      expect(state.errors).toEqual([]);
      // Every cell drew something.
      for (const share of state.coverage) expect(share).toBeGreaterThan(0.005);
      const canvas = page.locator('canvas');
      const box = await canvas.boundingBox();
      mkdirSync(evidence ?? '.', { recursive: true });
      await page.setViewportSize({ width: Math.ceil(box?.width ?? 1920) + 8, height: Math.ceil(box?.height ?? 1080) + 8 });
      await page.screenshot({ path: path.join(evidence ?? '.', `${view}-sheet.png`), fullPage: true });
    });
  }
});
