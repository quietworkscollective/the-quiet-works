import { defineConfig } from '@playwright/test';
import authored from './playwright.artifact.config.ts';
import { sealedRoomSpecs } from './playwright-room-selection.ts';

export default defineConfig(authored, {
  testMatch: ['**/full-tier.spec.ts', ...sealedRoomSpecs],
  // Full-tier contributes only its diagnostic cases; sealed-room suites run in full.
  grep: new RegExp(['@extended', ...sealedRoomSpecs.map(spec => spec.replace('**/', '').replaceAll('.', '\\.'))].join('|')),
});
