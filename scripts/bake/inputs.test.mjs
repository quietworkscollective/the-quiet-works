import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { hashInputs, assertSourceFresh } from './inputs.mjs';

test('source fingerprints survive host roots and file ordering, but reject changed authored bytes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bake-inputs-'));
  const files = ['world/wall.ts', 'world/canvas.ts', 'assets/model.glb', 'assets/image.webp', 'fonts/sign.woff2'];
  try {
    for (const host of ['mac', 'linux']) {
      for (const file of files) {
        await mkdir(path.dirname(path.join(root, host, file)), { recursive: true });
        await writeFile(path.join(root, host, file), Buffer.from([0, 255, 10, 13, 42]));
      }
    }
    const before = await hashInputs(path.join(root, 'mac'), files);
    assert.equal(await hashInputs(path.join(root, 'linux'), [...files].reverse()), before);
    const manifest = { sourceHash: before, atlases: [{ encoding: 'srgb-scale' }] };
    assert.doesNotThrow(() => assertSourceFresh('corridor', manifest, before));
    for (const file of files) {
      await writeFile(path.join(root, 'linux', file), Buffer.from([0, 255, 10, 13, 43]));
      const changed = await hashInputs(path.join(root, 'linux'), files);
      assert.notEqual(changed, before, file);
      assert.throws(() => assertSourceFresh('corridor', manifest, changed), /Stale corridor bake/);
      await writeFile(path.join(root, 'linux', file), Buffer.from([0, 255, 10, 13, 42]));
    }
    assert.notEqual(await hashInputs(path.join(root, 'mac'), files.slice(1)), before);
    assert.equal(await hashInputs(path.join(root, 'linux'), files), before);
    assert.throws(() => assertSourceFresh('corridor', { atlases: [] }, before), /committed=missing/);
    assert.throws(() => assertSourceFresh('corridor', { sourceHash: before, atlases: [{}] }, before), /Stale/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('room source lists exclude generated files and detect added modules', async () => {
  const { sourceInputs } = await import('./inputs.mjs');
  const root = await mkdtemp(path.join(tmpdir(), 'bake-source-list-'));
  const files = [
    'pnpm-lock.yaml', 'apps/web/src/main.tsx', 'apps/web/src/App.tsx',
    'apps/web/bake.html',
    'apps/web/src/environment.ts', 'apps/web/src/routes.ts', 'apps/web/src/pageScroll.ts',
    'apps/web/src/sceneFrame.ts', 'apps/web/src/timing.ts', 'apps/web/src/chambers/registry.ts',
    'apps/web/src/chambers/certification-office/door.ts', 'packages/ui/src/contextualCues.ts',
    'apps/web/src/baked/contract.ts', 'apps/web/src/baked/lights.ts',
    'apps/web/src/assets/model.glb', 'apps/web/src/audio/music/space.ts',
    'apps/web/src/bake/export.ts', 'apps/web/src/firstPerson/three.ts',
    'apps/web/src/look/index.ts', 'packages/engine/src/index.ts',
    'scripts/bake/bake.py', 'apps/web/src/corridor/world/wall.ts',
    'apps/web/src/chambers/annex-codex/room.tsx',
    'apps/web/src/chambers/annex-codex/door.ts',
    'scripts/blender/rooms/codex-room/build.py',
    'apps/web/src/assets/outline-room.glb.gz',
    'apps/web/src/chambers/exchange/door.ts',
    'apps/web/src/chambers/exchange/scene/ExchangeScene.tsx',
    'scripts/blender/rooms/exchange/build.py',
    'apps/web/src/chambers/exchange/assets/exchange.glb',
    'apps/web/src/chambers/exchange/assets/exchange.glb.gz',
    'apps/web/node_modules/@fontsource/test/latin.css',
    'apps/web/node_modules/@fontsource/test/files/sign.woff2',
  ];
  const put = async (file, value = 'authored') => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), value);
  };
  try {
    for (const file of files) await put(file);
    await put('apps/web/bake.html');
    await put('apps/web/src/main.tsx', "import '@fontsource/test/latin.css';");
    await put('apps/web/node_modules/@fontsource/test/latin.css', "src: url('./files/sign.woff2');");
    const before = await sourceInputs(root, 'corridor');
    const office = await sourceInputs(root, 'office');
    const codex = await sourceInputs(root, 'codex-room');
    const exchange = await sourceInputs(root, 'exchange');
    for (const [space, input] of [['corridor', before], ['office', office], ['codex-room', codex], ['exchange', exchange]]) {
      assert.ok(input.files.includes('apps/web/bake.html'), `${space} includes the bake entry in its freshness inputs`);
    }
    for (const file of [
      'apps/web/src/chambers/annex-codex/room.tsx',
      'scripts/blender/rooms/codex-room/build.py',
      'apps/web/src/assets/outline-room.glb.gz',
    ]) assert.ok(codex.files.includes(file), file);
    for (const file of [
      'apps/web/src/chambers/exchange/scene/ExchangeScene.tsx',
      'scripts/blender/rooms/exchange/build.py',
      'apps/web/src/chambers/exchange/assets/exchange.glb',
      'apps/web/src/chambers/exchange/assets/exchange.glb.gz',
    ]) assert.ok(exchange.files.includes(file), file);
    await put('scripts/blender/rooms/exchange/build.py', 'changed authored source');
    const exchangeChanged = await sourceInputs(root, 'exchange');
    assert.notEqual(exchangeChanged.hash, exchange.hash);
    for (const [space, original] of [['corridor', before], ['office', office], ['codex-room', codex]])
      assert.equal((await sourceInputs(root, space)).hash, original.hash, `${space} should not include the Exchange Blender source`);
    await put('scripts/blender/rooms/exchange/build.py');
    assert.deepEqual(await sourceInputs(root, 'exchange'), exchange);
    for (const file of ['scripts/bake/__pycache__/cached.pyc', 'scripts/bake/__pycache__/generated.py', 'scripts/bake/compiled.pyc', 'apps/web/src/corridor/.DS_Store', 'apps/web/src/corridor/world/wall.test.ts']) await put(file);
    assert.deepEqual(await sourceInputs(root, 'corridor'), before);
    await put('apps/web/src/corridor/world/new-wall.ts');
    const added = await sourceInputs(root, 'corridor');
    assert.notEqual(added.hash, before.hash);
    assert.ok(added.files.includes('apps/web/src/corridor/world/new-wall.ts'));
    assert.ok(added.files.includes('apps/web/node_modules/@fontsource/test/files/sign.woff2'));
    await rm(path.join(root, 'apps/web/src/corridor/world/new-wall.ts'));
    assert.deepEqual(await sourceInputs(root, 'corridor'), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
