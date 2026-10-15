import { defineConfig } from '@playwright/test';
import production from './playwright.config.ts';

export default defineConfig(production, {
  testMatch: ['**/office.spec.ts', '**/spine.spec.ts', '**/annex-release.spec.ts'],
  grep: /the fifth stamp overloads|opens on the UNHELD brand|the six doors are listed|focusing a door turns|Annex release gate in production/,
  maxFailures: 1,
});
