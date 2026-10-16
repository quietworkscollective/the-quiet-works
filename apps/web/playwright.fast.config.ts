import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.TQW_E2E_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${port}`;

// Only DOM/HTTP contracts belong here. Rendering, poses, readiness and frame budgets run elsewhere.
export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/fast.spec.ts', '**/reading-pages.spec.ts', '**/page.spec.ts', '**/readable.spec.ts', '**/readable-text-startup.spec.ts', '**/discoverability*.spec.ts'],
  grep: /@fast/,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    reducedMotion: 'reduce',
    // DOM evidence must not wait on a software-rendered screenshot.
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: true },
    screenshot: 'off',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [
    { name: 'desktop', grepInvert: /without JavaScript:|review captures/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
    { name: 'mobile', grepInvert: /without JavaScript:|crawler HTML:|sitemap dates, route titles|review captures/, use: { ...devices['Pixel 7'], deviceScaleFactor: 1 } },
    { name: 'reading-no-js', grep: /without JavaScript:/, testMatch: ['**/readable.spec.ts'], use: { javaScriptEnabled: false } },
  ],
  webServer: {
    command: `pnpm preview --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
