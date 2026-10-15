import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';
import type { ChamberId } from '@tqw/engine';

// Evaluate the same approval switch as the build, without importing room implementations.
const { module: registry } = await runnerImport<{
  isChamberOpenInBuild: (id: ChamberId, development: boolean) => boolean;
}>('./src/chambers/registry.ts', { configFile: false, root: fileURLToPath(new URL('.', import.meta.url)) });
const rooms = [
  ['exchange', '**/exchange.spec.ts'],
  ['apartment', '**/apartment.spec.ts'],
] as const;
export const releasedRoomSpecs = rooms.filter(([id]) => registry.isChamberOpenInBuild(id, false)).map(([, spec]) => spec);
export const sealedRoomSpecs = rooms.filter(([id]) => !registry.isChamberOpenInBuild(id, false)).map(([, spec]) => spec);
