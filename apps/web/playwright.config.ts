import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

/**
 * E2E runs against the production build (`vite preview`) so the Content-Security-Policy and
 * bundling are exercised. The default renderer is SwiftShader (CPU); set TQW_E2E_ANGLE=metal on
 * macOS to exercise the real Metal renderer for local GPU verification.
 */
const angle = process.env.TQW_E2E_ANGLE ?? 'swiftshader';
const gpuArgs = angle === 'metal'
  ? ['--use-angle=metal', '--ignore-gpu-blocklist']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

/** Parallel worktrees set TQW_E2E_PORT so each tests its own build; a busy port fails loudly. */
const port = Number(process.env.TQW_E2E_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${port}`;
const artifact = process.env.TQW_E2E_ARTIFACT === '1';
if (artifact && !existsSync(new URL('./dist/index.html', import.meta.url))) {
  throw new Error('Missing production artifact; download it or run pnpm build first');
}

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['full-tier.spec.ts', 'exchange.spec.ts', 'office-budget.spec.ts'],
  // Cold software renders and repeated room visits need a larger CI budget, not weaker predicates.
  timeout: process.env.CI ? 300_000 : 60_000,
  expect: { timeout: process.env.CI ? 90_000 : 10_000 },
  // Shard by individual case so large page/room files cannot monopolise a job. One worker
  // still runs cases sequentially within each runner; fixtures remain independent.
  fullyParallel: true,
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
      // Software correctness checks keep the phone's CSS viewport without paying for a denser backbuffer.
      use: { ...devices['Pixel 7'], deviceScaleFactor: angle === 'metal' ? devices['Pixel 7'].deviceScaleFactor : 1 },
    },
  ],
  webServer: {
    command: `${artifact ? '' : 'pnpm build && '}pnpm preview --port ${port} --strictPort`,
    url: baseURL,
    // Never reuse: a server left on this port may be serving another worktree's build.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
