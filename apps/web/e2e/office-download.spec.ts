import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { sceneTimeout } from './timeouts.ts';
const deferredModels = JSON.parse(readFileSync(new URL('../src/chambers/certification-office/scene/deferredModels.json', import.meta.url), 'utf8')) as Record<string, string>;

const manifest = JSON.parse(readFileSync(new URL('../dist/.vite/manifest.json', import.meta.url), 'utf8')) as Record<string, { file: string }>;
const deferredFiles = Object.values(deferredModels).map(source => `/${manifest[source]!.file}`);

test.use({ reducedMotion: 'reduce' });

test('a cold direct Office visit fits 3 MB before the first prepared frame', async ({ page }, testInfo) => {
  test.setTimeout(process.env.CI ? 240_000 : 120_000);
  await page.addInitScript(() => {
    const state = { ready: 0, violations: [] as string[] };
    Object.assign(window, { officeDownload: state });
    document.addEventListener('securitypolicyviolation', event => state.violations.push(event.violatedDirective));
    const observer = new MutationObserver(() => {
      if (!state.ready && document.querySelector('.tqw-canvas[data-ready="true"]')) {
        state.ready = performance.timeOrigin + performance.now();
        observer.disconnect();
      }
    });
    observer.observe(document, { subtree: true, attributes: true, childList: true });
  });
  const transfers: { path: string; start: number; raw: number; gzip: number; wire: number; encoding?: string }[] = [];
  const pending: Promise<void>[] = [];
  page.on('response', response => {
    // Blob textures have this origin too; their bytes already arrived inside the model chunks.
    const url = new URL(response.url());
    if (url.protocol !== 'http:' || url.origin !== new URL(testInfo.project.use.baseURL!).origin) return;
    pending.push(response.body().then(async body => {
      const encoding = response.headers()['content-encoding'];
      const sizes = await response.request().sizes();
      transfers.push({ path: new URL(response.url()).pathname, start: response.request().timing().startTime,
        raw: body.length, gzip: gzipSync(body).length, wire: sizes.responseBodySize, ...(encoding ? { encoding } : {}) });
    }));
  });
  await page.goto('/certification-office');
  await expect(page.locator('.tqw-canvas')).toHaveAttribute('data-ready', 'true', { timeout: sceneTimeout(60_000) });
  await expect(page.locator('[data-spine]')).toHaveAttribute('data-spine', 'chamber');
  await page.waitForLoadState('networkidle');
  await Promise.all(pending);
  const state = await page.evaluate(() => (window as unknown as { officeDownload: { ready: number; violations: string[] } }).officeDownload);
  const first = transfers.filter(transfer => transfer.start <= state.ready);
  const evidence = { ready: state.ready, firstGzipBytes: first.reduce((sum, transfer) => sum + transfer.gzip, 0),
    firstWireBytes: first.reduce((sum, transfer) => sum + transfer.wire, 0),
    fullWireBytes: transfers.reduce((sum, transfer) => sum + transfer.wire, 0),
    fullGzipBytes: transfers.reduce((sum, transfer) => sum + transfer.gzip, 0), transfers, violations: state.violations };
  await testInfo.attach('cold-office-transfers', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  await testInfo.attach('office-arrival', { body: await page.screenshot(), contentType: 'image/png' });
  expect(state.violations).toEqual([]);
  expect(evidence.firstGzipBytes).toBeLessThanOrEqual(3_000_000);
  for (const file of deferredFiles) {
    expect(first.map(transfer => transfer.path)).not.toContain(file);
    expect(transfers.map(transfer => transfer.path)).toContain(file);
  }
});

test('completing the occluded dressing leaves every arrival pixel unchanged', async ({ page }, testInfo) => {
  test.setTimeout(process.env.CI ? 240_000 : 120_000);
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/assets/*.js', async route => {
    if (deferredFiles.includes(new URL(route.request().url()).pathname)) await gate;
    await route.continue();
  });
  try {
    await page.goto('/certification-office');
    await expect(page.locator('.tqw-canvas')).toHaveAttribute('data-ready', 'true', { timeout: sceneTimeout(20_000) });
    await expect(page.locator('[data-spine]')).toHaveAttribute('data-spine', 'chamber');
    await page.waitForTimeout(500);
    const canvas = page.locator('.tqw-canvas canvas').first();
    const before = await canvas.screenshot();
    const frame = Number(await page.locator('.tqw-canvas').getAttribute('data-frame'));
    release();
    await page.waitForLoadState('networkidle');
    await expect.poll(async () => Number(await page.locator('.tqw-canvas').getAttribute('data-frame'))).toBeGreaterThan(frame);
    await page.waitForTimeout(500);
    const after = await canvas.screenshot();
    await testInfo.attach('before-dressing', { body: before, contentType: 'image/png' });
    await testInfo.attach('after-dressing', { body: after, contentType: 'image/png' });
    expect(after.equals(before), 'occluded dressing must not change the arrival view').toBe(true);
  } finally { release(); }
});
