import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the production build (`vite preview`) so the Content-Security-Policy and
 * bundling are exercised. Headless Chromium renders WebGL through SwiftShader (CPU), so frame
 * rates here say nothing about real GPUs; performance must be measured on devices.
 */
const gpuArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

/** Parallel worktrees set TQW_E2E_PORT so each tests its own build; a busy port fails loudly. */
const port = Number(process.env.TQW_E2E_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    launchOptions: { args: gpuArgs },
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm preview --port ${port}`,
    url: baseURL,
    // Never reuse: a server left on this port may be serving another worktree's build.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
