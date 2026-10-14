import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import type { Finding, FindingKind, RoomCount } from '@tqw/engine';
import type { Harness } from './discoveries-harness/main.ts';
import { site } from './helpers.ts';

/**
 * ADR 0003, R-1: unlocks are remembered on the device only, in one versioned key, written only
 * once something is discovered, erased by "Forget everything", with no cookies and no network.
 *
 * Nothing in the app records a discovery yet, so the store is driven through a harness page
 * (e2e/discoveries-harness) that wires the real adapter to the real store in real Chromium. The spec
 * serves it from its own Vite dev server (port 5197 unless TQW_E2E_DEV_PORT says otherwise); the
 * harness is never part of the production build. The production site itself is checked on the
 * preview server Playwright starts: a fresh visit stores nothing, and no test hook ships.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(WEB_ROOT, '../..');
const DEV_PORT = Number(process.env['TQW_E2E_DEV_PORT'] ?? 5197);
const HARNESS_ORIGIN = `http://127.0.0.1:${DEV_PORT}`;

/** Written out here on purpose: the key is part of the privacy promise, so a rename must fail this spec. */
const KEY = 'unheld.v1';
const OFFICE = 'certification-office';

type W = { __harness: Harness };

// ---- Helpers that run in the page --------------------------------------------------------------

const storageSnapshot = (page: Page): Promise<Record<string, string | null>> =>
  page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])));

async function expectNoCookies(page: Page, context: BrowserContext): Promise<void> {
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => document.cookie)).toBe('');
}

const record = (page: Page, id: string, kind: FindingKind = 'memo'): Promise<void> =>
  page.evaluate(
    ([findingId, findingKind]) =>
      (window as unknown as W).__harness.store.record('certification-office', {
        id: findingId,
        kind: findingKind as FindingKind,
      } satisfies Finding),
    [id, kind] as const,
  );

const has = (page: Page, id: string): Promise<boolean> =>
  page.evaluate((findingId) => (window as unknown as W).__harness.store.has('certification-office', findingId), id);

const counts = (page: Page): Promise<readonly RoomCount[]> =>
  page.evaluate(() => (window as unknown as W).__harness.store.counts());

const forget = (page: Page): Promise<void> => page.evaluate(() => (window as unknown as W).__harness.store.forget());

const exportText = (page: Page): Promise<string> =>
  page.evaluate(() => (window as unknown as W).__harness.store.exportText());

const importText = (page: Page, text: string): Promise<boolean> =>
  page.evaluate((value) => (window as unknown as W).__harness.store.importText(value), text);

const storageAvailable = (page: Page): Promise<boolean> =>
  page.evaluate(() => (window as unknown as W).__harness.storageAvailable);

const notifications = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as W).__harness.notifications);

const isEmptyState = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const state = (window as unknown as W).__harness.store.getState();
    return Object.keys(state.found).length === 0 && state.recognitions.length === 0;
  });

/** Records page errors and requests to other origins, so a test can assert there were none. */
function watch(page: Page) {
  const errors: string[] = [];
  const foreign: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(HARNESS_ORIGIN) && !url.startsWith('data:') && !url.startsWith('blob:')) foreign.push(url);
  });
  return { errors, foreign };
}

async function openHarness(page: Page, errors: readonly string[]): Promise<void> {
  await page.goto(`${HARNESS_ORIGIN}/`);
  try {
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  } catch {
    throw new Error(`The harness page did not start. Page errors: ${errors.join(' | ') || 'none'}`);
  }
}

// ---- The production site -----------------------------------------------------------------------

test.describe('the production site', () => {
  test('a fresh visit stores nothing and sets no cookies', async ({ page, context }) => {
    await page.goto('/');
    await expect(site(page)).toHaveAttribute('data-spine', /.+/);
    expect(await storageSnapshot(page)).toEqual({});
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
    await expectNoCookies(page, context);
  });

  test('ships no test hook: nothing on window, and no harness code in the build', async ({ page }) => {
    await page.goto('/');
    await expect(site(page)).toHaveAttribute('data-spine', /.+/);
    expect(await page.evaluate(() => '__harness' in window)).toBe(false);

    const dist = path.join(WEB_ROOT, 'dist');
    expect(existsSync(path.join(dist, 'index.html'))).toBe(true);
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(html|js|mjs|css)$/.test(name)) files.push(full);
      }
    };
    walk(dist);
    expect(files.length).toBeGreaterThan(1);
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text, path.relative(dist, file)).not.toContain('__harness');
      expect(text, path.relative(dist, file)).not.toContain('discoveries-harness');
    }
  });
});

// ---- The store in a real browser ---------------------------------------------------------------

test.describe('the discovery store in a browser', () => {
  let server: ViteDevServer | undefined;

  test.beforeAll(async () => {
    server = await createServer({
      configFile: false,
      root: path.join(HERE, 'discoveries-harness'),
      logLevel: 'error',
      // The harness reaches into ../../src and the workspace packages, outside its own folder.
      server: { host: '127.0.0.1', port: DEV_PORT, strictPort: true, fs: { allow: [REPO_ROOT] } },
    });
    await server.listen();
  });

  test.afterAll(async () => {
    await server?.close();
  });

  test('a fresh visit has empty storage and no cookies, and nothing leaves the page', async ({ page, context }) => {
    const { errors, foreign } = watch(page);
    await openHarness(page, errors);
    expect(await storageAvailable(page)).toBe(true);
    expect(await isEmptyState(page)).toBe(true);
    expect(await storageSnapshot(page)).toEqual({});
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
    await expectNoCookies(page, context);
    expect(foreign).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('after a record, storage holds exactly one key: the versioned document of ids', async ({ page, context }) => {
    const { errors } = watch(page);
    await openHarness(page, errors);
    await record(page, 'memo-001');
    expect(Object.keys(await storageSnapshot(page))).toEqual([KEY]);

    await record(page, 'duck-requisition', 'secret');
    await record(page, 'memo-001'); // a repeat changes nothing
    const snapshot = await storageSnapshot(page);
    expect(Object.keys(snapshot)).toEqual([KEY]);
    expect(JSON.parse(snapshot[KEY]!)).toEqual({
      version: 1,
      found: {
        [OFFICE]: [
          { id: 'memo-001', kind: 'memo' },
          { id: 'duck-requisition', kind: 'secret' },
        ],
      },
      recognitions: [],
    });
    expect(await notifications(page)).toBe(2);
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
    await expectNoCookies(page, context);
    expect(errors).toEqual([]);
  });

  test('a later visit remembers what was found, and the counts follow', async ({ page }) => {
    const { errors } = watch(page);
    await openHarness(page, errors);
    await record(page, 'memo-001');
    await record(page, 'duck-requisition', 'secret');
    const before = await storageSnapshot(page);

    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
    expect(await has(page, 'memo-001')).toBe(true);
    expect(await has(page, 'duck-requisition')).toBe(true);
    expect(await has(page, 'memo-002')).toBe(false);
    const [room] = await counts(page);
    expect(room).toMatchObject({ chamber: OFFICE, papers: { found: 1 }, secrets: { found: 1 } });
    expect(await storageSnapshot(page)).toEqual(before);
    expect(errors).toEqual([]);
  });

  test('forgetting empties storage and the page, and stays forgotten after a reload', async ({ page, context }) => {
    const { errors } = watch(page);
    await openHarness(page, errors);
    await record(page, 'memo-001');
    expect(Object.keys(await storageSnapshot(page))).toEqual([KEY]);

    await forget(page);
    expect(await storageSnapshot(page)).toEqual({});
    expect(await isEmptyState(page)).toBe(true);
    expect(await has(page, 'memo-001')).toBe(false);

    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
    expect(await isEmptyState(page)).toBe(true);
    expect(await storageSnapshot(page)).toEqual({});
    await expectNoCookies(page, context);
    expect(errors).toEqual([]);
  });

  test('export, forget, import restores exactly the stored document', async ({ page }) => {
    const { errors } = watch(page);
    await openHarness(page, errors);
    await record(page, 'memo-001');
    await record(page, 'duck-requisition', 'secret');
    await record(page, 'the-fifth', 'payoff');
    const stored = await storageSnapshot(page);
    const text = await exportText(page);

    await forget(page);
    expect(await storageSnapshot(page)).toEqual({});

    expect(await importText(page, text)).toBe(true);
    expect(await storageSnapshot(page)).toEqual(stored);
    expect(await exportText(page)).toBe(text);
    expect(errors).toEqual([]);
  });

  test('an invalid import is refused and storage is left exactly as it was', async ({ page }) => {
    const { errors } = watch(page);
    await openHarness(page, errors);
    await record(page, 'memo-001');
    const stored = await storageSnapshot(page);

    // Each of these would empty the store if it were accepted, so a wrongly accepted one shows.
    const empty = { version: 1, found: {}, recognitions: [] };
    expect(await importText(page, 'not json')).toBe(false);
    expect(await importText(page, JSON.stringify({ ...empty, version: 2 }))).toBe(false);
    expect(await importText(page, JSON.stringify({ ...empty, found: { basement: [] } }))).toBe(false);
    // Valid, and refused for its size alone.
    expect(await importText(page, `${JSON.stringify(empty)}${' '.repeat(64 * 1024)}`)).toBe(false);
    expect(await storageSnapshot(page)).toEqual(stored);
    expect(await has(page, 'memo-001')).toBe(true);
    expect(errors).toEqual([]);
  });

  test('a stored value of another version is ignored, left alone until a record, and forget erases it', async ({
    page,
  }) => {
    const { errors } = watch(page);
    await openHarness(page, errors);
    const foreignValue = JSON.stringify({
      version: 2,
      found: { [OFFICE]: [{ id: 'memo-001', kind: 'memo' }] },
      recognitions: [],
    });
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [KEY, foreignValue] as const);

    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
    expect(await isEmptyState(page)).toBe(true);
    expect(await storageSnapshot(page)).toEqual({ [KEY]: foreignValue });

    await forget(page);
    expect(await storageSnapshot(page)).toEqual({});
    expect(errors).toEqual([]);
  });

  test('with storage blocked the site runs on memory alone, without errors or cookies', async ({ page, context }) => {
    const { errors } = watch(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        },
      });
    });
    await openHarness(page, errors);
    expect(await storageAvailable(page)).toBe(false);

    await record(page, 'memo-001');
    await record(page, 'duck-requisition', 'secret');
    expect(await has(page, 'memo-001')).toBe(true);
    const [room] = await counts(page);
    expect(room).toMatchObject({ papers: { found: 1 }, secrets: { found: 1 } });

    const text = await exportText(page);
    await forget(page);
    expect(await isEmptyState(page)).toBe(true);
    expect(await importText(page, text)).toBe(true);
    expect(await has(page, 'duck-requisition')).toBe(true);
    await expectNoCookies(page, context);
    expect(errors).toEqual([]);
  });

  test('with storage full the site keeps what it finds in memory, without errors', async ({ page, context }) => {
    const { errors } = watch(page);
    await page.addInitScript(() => {
      Storage.prototype.setItem = function setItem() {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      };
    });
    await openHarness(page, errors);
    expect(await storageAvailable(page)).toBe(true);

    await record(page, 'memo-001');
    expect(await has(page, 'memo-001')).toBe(true);
    const [room] = await counts(page);
    expect(room).toMatchObject({ papers: { found: 1 } });
    expect(await notifications(page)).toBe(1);
    expect(await storageSnapshot(page)).toEqual({});
    await expectNoCookies(page, context);
    expect(errors).toEqual([]);
  });
});
