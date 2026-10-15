import { defineConfig } from '@playwright/test';
import production from './playwright.config.ts';

export default defineConfig(production, {
  testMatch: ['**/readable.spec.ts', '**/readable-text-startup.spec.ts'],
});
