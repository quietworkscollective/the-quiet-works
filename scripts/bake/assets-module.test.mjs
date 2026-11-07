import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assetsModuleSource } from './assets-module.mjs';

test('generated bake module defers lazy receiver chunks behind a loader', () => {
  const source = assetsModuleSource({
    space: 'corridor',
    geometryFiles: [
      { file: 'corridor-geometry-0.json', lazy: false },
      { file: 'corridor-geometry-1.json', lazy: true },
    ],
    atlasFiles: ['corridor-0.webp'],
  });

  assert.match(source, /import geometry0 from '\.\/corridor-geometry-0\.json';/);
  assert.doesNotMatch(source, /import geometry\d+ from '\.\/corridor-geometry-1\.json';/);
  assert.match(source, /import\('\.\/corridor-geometry-1\.json'\)/);
  assert.match(source, /loadLazyGeometry/);
});

test('a room can inline its own atlas into its lazy route', () => {
  const source = assetsModuleSource({
    space: 'tomorrow-engine',
    geometryFiles: [{ file: 'tomorrow-engine-geometry-0.json', lazy: false }],
    atlasFiles: ['tomorrow-engine-0.webp'],
    inlineAtlases: true,
  });
  assert.match(source, /import image0 from '\.\/tomorrow-engine-0\.webp\?url&inline';/);
});
