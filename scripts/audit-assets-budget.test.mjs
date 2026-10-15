import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import {
  INITIAL_DOWNLOAD_BUDGET_BYTES,
  ROOM_ROUTE_BUDGET_BYTES,
  SHARED_MEDIA_BUDGET_BYTES,
  WHOLE_BUILD_BUDGET_BYTES,
  budgetWarnings,
  budgetViolations,
  measureAssetBudgets,
} from '../apps/web/scripts/asset-budgets.mjs';

const recordsManifest = JSON.parse(readFileSync(new URL('../apps/web/src/audio/music/records/manifest.json', import.meta.url), 'utf8'));

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'tqw-asset-budget-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dist = path.join(root, 'dist');
  mkdirSync(path.join(dist, 'assets'), { recursive: true });
  mkdirSync(path.join(dist, '.vite'), { recursive: true });
  const write = (relative, contents) => {
    const target = path.join(dist, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  };

  write('index.html', '<script type="module" src="/assets/main.js"></script>');
  write('assets/main.js', 'import("./CorridorScene-test.js");');
  write('assets/CorridorScene-test.js', 'import("./corridor-test.js"); export const corridor = true;');
  write('assets/corridor-test.js', 'export const corridorRuntime = true;');
  write('assets/corridor-geometry-1-test.js', 'export const deferredGeometry = true;');
  write('assets/office-test.js', 'export const office = true;');
  write('assets/office-scene-test.js', 'export const officeScene = true;');
  write('assets/baked-space-test.js', 'export const bakedSpace = true;');
  write('assets/codex-test.js', 'export const codex = true;');
  write('assets/exchange-test.js', 'export const exchange = true;');
  write('assets/exchange-scene-test.js', 'export const exchangeScene = true;');
  write('assets/exchange-bake-test.js', 'export const exchangeBake = true;');
  write('assets/exchange-model-test.js', 'export const exchangeModel = true;');
  write('assets/office-bake-test.js', 'export const officeBake = true;');
  write('assets/codex-bake-test.js', 'export const codexBake = true;');
  write('assets/office-model-test.js', 'export const officeModel = true;');
  write('assets/office-map.webp', 'office bake map');
  write('assets/codex-map.webp', 'Annex bake map');
  write('assets/exchange-map.webp', 'Exchange bake map');
  write('assets/office-model.glb', 'interaction-time office prop');
  write('assets/cart-tool-green.js', 'office-selected shared catalogue model');
  write('assets/unrelated-original.js', 'unselected global catalogue model');
  write('assets/concrete-albedo.js', 'office-selected surface module');
  write('assets/concrete-albedo.webp', 'office-selected surface bytes');
  write('assets/exchange-model.glb', 'interaction-time Exchange model');

  const manifest = {
    'src/corridor/CorridorScene.tsx': { file: 'assets/CorridorScene-test.js', isDynamicEntry: true, imports: [], dynamicImports: [] },
    'src/chambers/certification-office/index.ts': { file: 'assets/office-test.js', isDynamicEntry: true, imports: [], dynamicImports: ['src/chambers/certification-office/scene/OfficeScene.tsx'] },
    'src/chambers/certification-office/scene/OfficeScene.tsx': { file: 'assets/office-scene-test.js', imports: ['src/baked/BakedSpace.tsx'], dynamicImports: [
      'src/chambers/certification-office/scene/lazyProps.ts',
      'src/assets/models/cart-tool-green.glb?url&inline',
      'src/assets/original/trophy-cup-tall.glb?url&inline',
      'src/assets/surfaces/concrete-albedo.webp?url',
    ] },
    'src/chambers/annex-codex/index.ts': { file: 'assets/codex-test.js', isDynamicEntry: true, imports: ['src/baked/BakedSpace.tsx'], dynamicImports: [] },
    'src/chambers/exchange/index.ts': { file: 'assets/exchange-test.js', isDynamicEntry: true, imports: [], dynamicImports: ['src/chambers/exchange/scene/ExchangeScene.tsx'] },
    'src/chambers/exchange/scene/ExchangeScene.tsx': { file: 'assets/exchange-scene-test.js', imports: ['src/baked/BakedSpace.tsx'], dynamicImports: ['src/chambers/exchange/scene/lazyModel.ts'] },
    'src/baked/BakedSpace.tsx': { file: 'assets/baked-space-test.js', imports: [], dynamicImports: ['src/baked/assets/office.ts', 'src/baked/assets/codex-room.ts', 'src/baked/assets/exchange.ts'] },
    'src/baked/assets/office.ts': { file: 'assets/office-bake-test.js', css: [], assets: ['assets/office-map.webp'], imports: [], dynamicImports: [] },
    'src/baked/assets/codex-room.ts': { file: 'assets/codex-bake-test.js', css: [], assets: ['assets/codex-map.webp'], imports: [], dynamicImports: [] },
    'src/baked/assets/exchange.ts': { file: 'assets/exchange-bake-test.js', css: [], assets: ['assets/exchange-map.webp'], imports: [], dynamicImports: [] },
    'src/chambers/certification-office/scene/lazyProps.ts': { file: 'assets/office-model-test.js', imports: [], dynamicImports: ['src/chambers/certification-office/scene/catalogue/office-model.glb?url&inline'] },
    'src/chambers/certification-office/scene/catalogue/office-model.glb?url&inline': { file: 'assets/office-model.glb' },
    'src/assets/models/cart-tool-green.glb?url&inline': { file: 'assets/cart-tool-green.js' },
    'src/assets/original/trophy-cup-tall.glb?url&inline': { file: 'assets/unrelated-original.js' },
    'src/assets/surfaces/concrete-albedo.webp?url': { file: 'assets/concrete-albedo.js', assets: ['assets/concrete-albedo.webp'] },
    'src/chambers/exchange/scene/lazyModel.ts': { file: 'assets/exchange-model-test.js', imports: [], dynamicImports: ['src/chambers/exchange/assets/exchange-model.glb?url&inline'] },
    'src/chambers/exchange/assets/exchange-model.glb?url&inline': { file: 'assets/exchange-model.glb' },
  };
  for (const record of recordsManifest.records) {
    for (const output of record.outputs) {
      const filename = `assets/${output.path}`;
      write(filename, '');
      manifest[`src/audio/music/records/${output.path}?url`] = { file: filename };
    }
  }
  write('.vite/manifest.json', JSON.stringify(manifest));
  return { dist, write };
}

function assertRedThenGreen(t, { file, oversized, expectedPrefix }) {
  const build = fixture(t);
  build.write(file, oversized);
  const red = budgetViolations(measureAssetBudgets(build.dist));
  assert.ok(red.some(message => message.startsWith(expectedPrefix)), `${expectedPrefix} should fail while oversized`);

  build.write(file, '');
  const green = budgetViolations(measureAssetBudgets(build.dist));
  assert.deepEqual(green, [], `${expectedPrefix} should pass again after restoring the file`);
}

test('measures the first-visit graph and the built room graphs independently', t => {
  const build = fixture(t);
  const result = measureAssetBudgets(build.dist);
  assert.deepEqual(result.errors, []);
  assert.equal(result.roomRoutes.map(route => route.label).join(', '), 'Annex / Codex, Office, Annex / Exchange');
  assert.ok(result.roomRoutes.find(route => route.label === 'Office').files.has('assets/office-map.webp'));
  assert.ok(result.roomRoutes.find(route => route.label === 'Office').files.has('assets/office-model.glb'));
  assert.ok(result.roomRoutes.find(route => route.label === 'Office').files.has('assets/cart-tool-green.js'));
  assert.ok(result.roomRoutes.find(route => route.label === 'Office').files.has('assets/concrete-albedo.webp'));
  assert.ok(!result.roomRoutes.find(route => route.label === 'Office').files.has('assets/unrelated-original.js'));
  assert.ok(result.roomRoutes.find(route => route.label === 'Annex / Codex').files.has('assets/codex-map.webp'));
  assert.ok(result.roomRoutes.find(route => route.label === 'Annex / Exchange').files.has('assets/exchange-map.webp'));
  assert.ok(result.roomRoutes.find(route => route.label === 'Annex / Exchange').files.has('assets/exchange-model.glb'));
  assert.ok(!result.initialFiles.has('assets/office-map.webp'));
  assert.deepEqual(budgetViolations(result), []);
  assert.deepEqual(budgetWarnings(result), []);
});

test('fails then passes the first-visit compressed graph', t => {
  assertRedThenGreen(t, {
    file: 'assets/CorridorScene-test.js',
    oversized: randomBytes(INITIAL_DOWNLOAD_BUDGET_BYTES + 100_000),
    expectedPrefix: 'first-visit download',
  });
});

test('keeps receiver geometry deferred until the corridor dressing has loaded', t => {
  const build = fixture(t);
  const deferred = randomBytes(300_000);
  build.write('assets/corridor-test.js', 'import("./corridor-geometry-1-test.js");');
  build.write('assets/corridor-geometry-1-test.js', deferred);

  const result = measureAssetBudgets(build.dist);
  assert.ok(!result.initialFiles.has('assets/corridor-geometry-1-test.js'));
  assert.ok(result.totalBytes >= deferred.byteLength);
  assert.deepEqual(budgetViolations(result), []);
});

test('counts nested Office model chunks and reports overage as a warning', t => {
  const build = fixture(t);
  build.write('assets/office-model.glb', randomBytes(ROOM_ROUTE_BUDGET_BYTES + 100_000));
  const result = measureAssetBudgets(build.dist);
  const office = result.roomRoutes.find(route => route.label === 'Office');
  assert.ok(office.files.has('assets/office-model.glb'));
  assert.equal(office.gzipBytes, [...office.files].reduce((sum, file) => sum + gzipSync(readFileSync(path.join(build.dist, file))).byteLength, 0));
  assert.ok(office.gzipBytes > ROOM_ROUTE_BUDGET_BYTES);
  assert.ok(budgetWarnings(result).some(message => message.startsWith('Office expanded lazy route')));
  assert.deepEqual(budgetViolations(result), [], 'room overages remain warnings pending a ruling');

  build.write('assets/office-model.glb', 'interaction-time office prop');
  const restored = measureAssetBudgets(build.dist);
  assert.deepEqual(budgetWarnings(restored), []);
});

test('does not expand a room through the already-loaded app document', t => {
  const build = fixture(t);
  build.write('assets/visitor-route.js', 'import("./visitor-model.glb");');
  build.write('assets/visitor-model.glb', randomBytes(ROOM_ROUTE_BUDGET_BYTES + 100_000));
  const manifestPath = path.join(build.dist, '.vite/manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest['src/chambers/certification-office/index.ts'].imports = ['index.html'];
  manifest['index.html'] = {
    file: 'index.html',
    imports: [],
    dynamicImports: ['src/visitor/route.ts'],
  };
  manifest['src/visitor/route.ts'] = {
    file: 'assets/visitor-route.js',
    imports: [],
    dynamicImports: ['src/visitor/model.glb?url'],
  };
  manifest['src/visitor/model.glb?url'] = { file: 'assets/visitor-model.glb' };
  writeFileSync(manifestPath, JSON.stringify(manifest));

  const result = measureAssetBudgets(build.dist);
  const office = result.roomRoutes.find(route => route.label === 'Office');
  assert.deepEqual(result.errors, []);
  assert.ok(!office.files.has('assets/visitor-route.js'));
  assert.ok(!office.files.has('assets/visitor-model.glb'));
  assert.ok(!budgetWarnings(result).some(message => message.startsWith('Office expanded lazy route')));
});

test('reports expanded Codex and Exchange route overages without failing the audit', t => {
  const build = fixture(t);
  build.write('assets/codex-test.js', randomBytes(ROOM_ROUTE_BUDGET_BYTES + 100_000));
  build.write('assets/exchange-model.glb', randomBytes(ROOM_ROUTE_BUDGET_BYTES + 100_000));
  const result = measureAssetBudgets(build.dist);
  const warnings = budgetWarnings(result);
  assert.ok(warnings.some(message => message.startsWith('Annex / Codex expanded lazy route')));
  assert.ok(warnings.some(message => message.startsWith('Annex / Exchange expanded lazy route')));
  assert.deepEqual(budgetViolations(result), [], 'room overages remain warnings pending a ruling');
});

test('fails then passes the separate shared gramophone media cap', t => {
  const firstRecord = recordsManifest.records[0].outputs[0].path;
  assertRedThenGreen(t, {
    file: `assets/${firstRecord}`,
    oversized: randomBytes(SHARED_MEDIA_BUDGET_BYTES + 100_000),
    expectedPrefix: 'shared gramophone records',
  });
});

test('fails then passes the whole-build backstop', t => {
  assertRedThenGreen(t, {
    file: 'unreferenced.bin',
    oversized: Buffer.alloc(WHOLE_BUILD_BUDGET_BYTES + 1, 42),
    expectedPrefix: 'whole build',
  });
});
