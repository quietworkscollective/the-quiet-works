import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.TQW_DEV_PORT ?? 5196);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/office-v3.spec.ts', '**/office-action-feedback.spec.ts'],
  timeout: process.env.CI ? 300_000 : 90_000,
  expect: { timeout: process.env.CI ? 90_000 : 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
    { name: 'mobile', use: { ...devices['Pixel 7'], deviceScaleFactor: 1 } },
  ],
  webServer: {
    command: `pnpm --filter @tqw/web dev --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
