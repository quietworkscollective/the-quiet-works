import { defineConfig } from '@playwright/test';
import authored from './playwright.artifact.config.ts';
import { releasedRoomSpecs } from './playwright-room-selection.ts';

export default defineConfig({ ...authored, projects: (authored.projects ?? []).filter(project => project.name !== 'reading-no-js') }, {
  testMatch: releasedRoomSpecs.length ? releasedRoomSpecs : ['**/no-released-room-suite.spec.ts'],
});
