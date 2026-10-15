import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
import production from './playwright.config.ts';

// This bundle retains DEV room access/probes for full-tier; it is never the shipping bundle.
const port = Number(process.env.TQW_AUTHORED_PORT ?? 5398);
const baseURL = `http://127.0.0.1:${port}`;
if (!process.argv.includes('--list') && !existsSync(new URL('./dist-authored/index.html', import.meta.url))) {
  throw new Error('Missing authored artifact; run pnpm build:e2e-fixture first');
}

export default defineConfig({ ...production, projects: (production.projects ?? []).filter(project => project.name === 'desktop' || project.name === 'mobile'), webServer: [] }, {
  testIgnore: [],
  testMatch: ['**/full-tier.spec.ts', '**/office-budget.spec.ts'],
  use: { baseURL },
  webServer: {
    command: `pnpm exec vite preview --outDir dist-authored --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
