import { defineConfig, devices } from '@playwright/test';

/**
 * The Exchange suite. It runs against the development server, like playwright.dev.config.ts, because
 * the room's inspection hooks exist only in development. This config exists because every browser
 * here must be installed Chrome with the Chromium sandbox on; the shared configs set neither option.
 * WebKit has no Chromium sandbox to set; it carries the real iPhone engine and touch input.
 */
const angle = process.env.TQW_E2E_ANGLE ?? 'swiftshader';
const gpuArgs = angle === 'metal'
  ? ['--use-angle=metal', '--ignore-gpu-blocklist']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const port = Number(process.env.TQW_E2E_PORT ?? 4291);
const baseURL = `http://127.0.0.1:${port}`;
const chrome = { channel: 'chrome', launchOptions: { chromiumSandbox: true, args: gpuArgs } } as const;

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/exchange.spec.ts', '**/exchange-chain.spec.ts', '**/exchange-guards.spec.ts'],
  outputDir: './test-results/exchange',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ...chrome } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'], ...chrome } },
    { name: 'webkit-iphone', use: { ...devices['iPhone 14'], browserName: 'webkit' } },
  ],
  webServer: {
    command: `pnpm --filter @tqw/web dev --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    // A busy port may belong to another worktree; never silently reuse it.
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
