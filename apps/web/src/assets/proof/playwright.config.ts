import { defineConfig, devices } from '@playwright/test';

/**
 * The asset library under the site's real Content-Security-Policy.
 *
 *   TQW_ASSET_PORT=5180 pnpm --filter @tqw/web exec playwright test -c src/assets/proof/playwright.config.ts
 *
 * Global setup builds the app (to read the policy from its own `_headers`), builds the harness page,
 * and serves it with that policy as an HTTP header. Headless Chromium renders WebGL through
 * SwiftShader, so this proves loading and rendering, never frame rates.
 */
const port = Number(process.env.TQW_ASSET_PORT ?? 5180);

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './setup.ts',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } }],
});
