import { defineConfig } from '@playwright/test';
import production from './playwright.config.ts';
import authored from './playwright.artifact.config.ts';

const baseURL = `http://127.0.0.1:${Number(process.env.TQW_AUTHORED_PORT ?? 5398)}`;

// Preserve the entire unchanged chamber-contract file, including closed-door Menu assertions.
export default defineConfig(authored, {
  testMatch: ['**/luna-exit.spec.ts'],
  grep: /.*/,
  projects: (production.projects ?? []).filter(project => project.name !== 'reading-no-js').map(project => ({
    ...project,
    testMatch: ['**/luna-exit.spec.ts'],
    use: { ...project.use, baseURL },
  })),
});
