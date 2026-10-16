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
// WebKit reserves 4190 for Sieve and refuses HTTP there before sending a request.
// Serve the same artifact on this worktree's allocated dev port; retain browser security defaults.
const webkitPort = port === 4190 ? 5190 : port;
const webkitURL = `http://127.0.0.1:${webkitPort}`;
const artifact = process.env.TQW_E2E_ARTIFACT === '1';
if (artifact && !process.argv.includes('--list') && !existsSync(new URL('./dist/index.html', import.meta.url))) {
  throw new Error('Missing production artifact; download it or run pnpm build first');
}
const previewServer = (serverPort: number, buildFirst: boolean) => ({
  command: `${buildFirst && !artifact ? 'pnpm build && ' : ''}pnpm preview --port ${serverPort} --strictPort`,
  url: `http://127.0.0.1:${serverPort}`,
  // A busy port may belong to another worktree; never silently reuse it.
  reuseExistingServer: false,
  timeout: 180_000,
});

export default defineConfig({
  testDir: './e2e',
  // The raw authored route contract gates separately against dist-authored; other cases stay here.
  grep: /^(?!.*luna-exit\.spec\.ts.*the corridor return appears only on the current open room across every chamber route)/,
  testIgnore: ['full-tier.spec.ts', 'exchange.spec.ts', 'office-budget.spec.ts', 'apartment.spec.ts'],
  // Cold software renders and repeated room visits need a larger CI budget, not weaker predicates.
  timeout: process.env.CI ? 300_000 : 60_000,
  expect: { timeout: process.env.CI ? 90_000 : 10_000 },
  // Shard by individual case so large page/room files cannot monopolise a job. One worker
  // still runs cases sequentially within each runner; fixtures remain independent.
  fullyParallel: true,
  workers: 1,
  // On CI only, a failed test runs once more: a real failure fails twice and still blocks, while a
  // timing blip on the software-rendered runner passes and is reported as flaky, not hidden.
  retries: process.env.CI ? 1 : 0,
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
    {
      name: 'webkit-iphone',
      testMatch: /(?:luna-exit|production-chamber-return)\.spec\.ts/,
      use: { ...devices['iPhone 14'], browserName: 'webkit', baseURL: webkitURL, launchOptions: { args: [] } },
    },
    {
      name: 'reading-no-js',
      testMatch: ['**/readable.spec.ts'],
      use: { javaScriptEnabled: false },
    },
  ],
  webServer: webkitPort === port
    ? previewServer(port, true)
    : [previewServer(port, true), previewServer(webkitPort, false)],
});
