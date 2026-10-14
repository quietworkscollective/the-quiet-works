import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * A model and a surface decode and render under the production Content-Security-Policy, with zero
 * `securitypolicyviolation` events. The policy is the one the app itself builds (apps/web/dist/_headers),
 * sent as an HTTP header, so `connect-src 'none'` is in force: any fetch or XHR, even to the page's own
 * origin, would be reported.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const appHeaders = path.resolve(here, '..', '..', '..', 'dist', '_headers');

interface Harness {
  violations: { directive: string; blocked: string }[];
  errors: string[];
  ready: Promise<void>;
  coverage: number[];
  textures: { name: string; width: number; height: number }[];
  releaseAll: () => number;
  gpu: () => { geometries: number; textures: number };
  baseline: { geometries: number; textures: number };
}

async function open(page: Page, query: string): Promise<string[]> {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  // Also record from outside the page, so a violation cannot be lost to a harness bug.
  await page.addInitScript(() => {
    (window as unknown as { __outer: string[] }).__outer = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      (window as unknown as { __outer: string[] }).__outer.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  await page.goto(`/index.html?${query}`);
  await page.evaluate(() => (window as unknown as { __harness: Harness }).__harness.ready);
  return consoleErrors;
}

test('the page is served with the app\'s real policy', async ({ page }) => {
  const response = await page.goto('/index.html?view=single&id=office-desk-metal');
  const header = response?.headers()['content-security-policy'] ?? '';
  const built = /^\s*Content-Security-Policy:\s*(.+)$/m.exec(readFileSync(appHeaders, 'utf8'))?.[1]?.trim();
  expect(built).toBeTruthy();
  expect(header).toBe(built);
  expect(header).toContain("connect-src 'none'");
  expect(header).toContain("script-src 'self'");
  expect(header).not.toContain('wasm-unsafe-eval');
});

test('a model decodes and renders with no policy violation', async ({ page }) => {
  const consoleErrors = await open(page, 'view=single&id=office-desk-metal');
  const result = await page.evaluate(() => {
    const h = (window as unknown as { __harness: Harness }).__harness;
    return { violations: h.violations, errors: h.errors, coverage: h.coverage, textures: h.textures, outer: (window as unknown as { __outer: string[] }).__outer };
  });
  expect(result.violations).toEqual([]);
  expect(result.outer).toEqual([]);
  expect(result.errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  // The desk covers a real share of the frame, and its three embedded WebP maps decoded: colour at
  // 1024 px, the normal and packed occlusion-roughness maps at half that.
  expect(result.coverage[0]).toBeGreaterThan(0.08);
  expect(result.textures.length).toBe(3);
  expect(result.textures.map((texture) => `${texture.width}x${texture.height}`).sort()).toEqual(['1024x1024', '512x512', '512x512']);
  if (process.env.TQW_EVIDENCE_DIR) await page.screenshot({ path: path.join(process.env.TQW_EVIDENCE_DIR, 'csp-office-desk-metal.png') });
});

test('a surface loads through <img> and renders with no policy violation', async ({ page }) => {
  const consoleErrors = await open(page, 'view=single&id=plaster-clean');
  const result = await page.evaluate(() => {
    const h = (window as unknown as { __harness: Harness }).__harness;
    return { violations: h.violations, errors: h.errors, coverage: h.coverage, outer: (window as unknown as { __outer: string[] }).__outer };
  });
  expect(result.violations).toEqual([]);
  expect(result.outer).toEqual([]);
  expect(result.errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(result.coverage[0]).toBeGreaterThan(0.3);
});

test('the policy really is enforced: a fetch to the page\'s own origin is reported', async ({ page }) => {
  await open(page, 'view=single&id=office-desk-metal');
  await page.evaluate(() => fetch('/index.html').then(() => 'allowed', () => 'blocked'));
  const violations = await page.evaluate(() => (window as unknown as { __harness: Harness }).__harness.violations);
  expect(violations.map((v) => v.directive)).toContain('connect-src');
});

test('releasing every handle frees every GPU geometry and texture', async ({ page }) => {
  await open(page, 'view=single&id=office-desk-metal');
  const before = await page.evaluate(() => (window as unknown as { __harness: Harness }).__harness.gpu());
  expect(before.geometries).toBeGreaterThan(0);
  expect(before.textures).toBeGreaterThanOrEqual(3);
  await page.evaluate(() => (window as unknown as { __harness: Harness }).__harness.releaseAll());
  const after = await page.evaluate(() => (window as unknown as { __harness: Harness }).__harness.gpu());
  const baseline = await page.evaluate(() => (window as unknown as { __harness: Harness }).__harness.baseline);
  // Back to what the harness held before any asset loaded: its own environment map, nothing of ours.
  expect(after).toEqual(baseline);
});

test('the React hooks load under the policy and free everything on unmount', async ({ page }) => {
  const consoleErrors = await open(page, 'view=hooks');
  const before = await page.evaluate(() => (window as unknown as { __harness: Harness }).__harness.gpu());
  const baseline = await page.evaluate(() => (window as unknown as { __harness: Harness }).__harness.baseline);
  const state = await page.evaluate(() => {
    const h = (window as unknown as { __harness: Harness }).__harness;
    return { violations: h.violations, errors: h.errors };
  });
  expect(state.violations).toEqual([]);
  expect(state.errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  // The model (9 meshes, 3 textures) and the surface (3 maps) are on the GPU.
  expect(before.geometries).toBeGreaterThan(baseline.geometries);
  expect(before.textures).toBeGreaterThanOrEqual(baseline.textures + 6);
  await page.evaluate(() => (window as unknown as { __harness: Harness }).__harness.releaseAll());
  const after = await page.evaluate(() => (window as unknown as { __harness: Harness }).__harness.gpu());
  expect(after).toEqual(baseline);
});
