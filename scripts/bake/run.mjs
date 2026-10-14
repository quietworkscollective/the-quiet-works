import { splitGeometry } from './split.mjs';
import { assetsModuleSource } from './assets-module.mjs';
import { prepareBakeCapture } from './capture.mjs';
import { BAKE_GEOMETRY_BITS, quantizeBakeArgs } from './geometry-encoding.mjs';
import { measureEncoding } from './measure-encoding.mjs';
import { webpArgs } from './webp.mjs';
import { sourceInputs, assertSourceFresh } from './inputs.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, stat, cp } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const ansiEscape = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g');
const checking = process.argv.includes('--check');
const availableSpaces = ['corridor', 'office', 'codex-room', 'exchange'];
const requested = process.argv.find(value => availableSpaces.includes(value));
const spaces = checking ? (requested ? [requested] : availableSpaces) : [process.argv[2]];
if (spaces.some(space => !availableSpaces.includes(space))) throw new Error(`Usage: pnpm bake ${availableSpaces.join('|')}`);

const root = fileURLToPath(new URL('../../', import.meta.url));
const cache = path.join(root, '.bake-cache');

// The room's source model is reproducibly built before its source bytes are fingerprinted.
if (!checking && spaces[0] === 'codex-room') {
  const dir = path.join(cache, 'codex-room');
  await mkdir(dir, { recursive: true });
  const source = path.join(dir, 'outline-room-source.glb');
  const blender = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender';
  const built = spawnSync(blender, ['-b', '--factory-startup', '--python-exit-code', '1', '--python', 'scripts/blender/rooms/codex-room/build.py', '--', source], { cwd: root, stdio: 'inherit' });
  if (built.status !== 0) throw new Error(`Outline Room Blender source failed: ${built.status}`);
  const quantizedSource = path.join(dir, 'outline-room-quantized.glb');
  const roomQuantize = ['--quantize-position', '14', '--quantize-normal', '10', '--quantize-texcoord', '14', '--quantize-color', '8'];
  const quantized = spawnSync('pnpm', ['exec', 'gltf-transform', 'quantize', source, quantizedSource, ...roomQuantize], { cwd: root, stdio: 'inherit' });
  if (quantized.status !== 0) throw new Error('Outline Room source quantization failed');
  const webpSource = path.join(dir, 'outline-room-webp.glb');
  const webp = spawnSync('pnpm', ['exec', 'gltf-transform', 'webp', quantizedSource, webpSource, '--quality', '82', '--near-lossless'], { cwd: root, stdio: 'inherit' });
  if (webp.status !== 0) throw new Error('Outline Room WebP conversion failed');
  const compressed = gzipSync(await readFile(webpSource), { level: 9 });
  const model = path.join(root, 'apps/web/src/assets/outline-room.glb.gz');
  await writeFile(model, compressed);
  console.log(`Outline Room model: ${(compressed.byteLength / 1024 / 1024).toFixed(2)} MiB gzip (${(await stat(webpSource)).size} bytes WebP-quantized GLB)`);
}

// Authored source bytes are checked independently of the deterministic scene capture.
await mkdir(cache, { recursive: true });
const inputs = new Map();
for (const space of spaces) {
  const input = await sourceInputs(root, space);
  inputs.set(space, input.hash);
  await writeFile(path.join(cache, `${space}-inputs.json`), `${JSON.stringify(input, null, 2)}\n`);
  if (checking) {
    const manifest = JSON.parse(await readFile(path.join(root, `apps/web/src/baked/assets/${space}.manifest.json`), 'utf8'));
    assertSourceFresh(space, manifest, input.hash);
    console.log(`${space}: source fingerprint matches ${input.hash} (${input.files.length} files)`);
  }
}

// Portable freshness checks need only authored bytes; do not start a browser or Blender in CI.
if (checking) process.exit(0);

const { chromium } = require('@playwright/test');
const port = Number(process.env.BAKE_PORT ?? 5186);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('BAKE_PORT must be a valid TCP port');
const server = spawn('pnpm', ['--filter', '@tqw/web', 'dev', '--config', '../../scripts/bake/vite.config.ts', '--port', String(port), '--strictPort'], { cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', data => { serverLog += data; });
server.stderr.on('data', data => { serverLog += data; });
let browser;
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Dev server did not start: ${serverLog}`)), 15_000);
    server.on('exit', code => { clearTimeout(timeout); reject(new Error(`Dev server exited: ${code} ${serverLog}`)); });
    server.stdout.on('data', () => {
      if (serverLog.replace(ansiEscape, '').includes('Local:')) { clearTimeout(timeout); resolve(); }
    });
  });

  const angle = process.env.BAKE_BROWSER_ANGLE ?? (process.platform === 'darwin' ? 'metal' : 'swiftshader');
  if (!['metal', 'swiftshader'].includes(angle)) throw new Error('BAKE_BROWSER_ANGLE must be metal or swiftshader');
  // Canvas export is only for Blender; rendered pixels never enter bake freshness checks.
  browser = await chromium.launch({ args: [`--use-angle=${angle}`, '--ignore-gpu-blocklist', '--disable-accelerated-2d-canvas', ...(angle === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : [])] });

  for (const space of spaces) {
    const started = performance.now();
    const sourceHash = inputs.get(space);
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', timezoneId: 'Etc/UTC' });
    await page.clock.setFixedTime(new Date('2026-10-14T12:00:00.000Z'));
    page.on('pageerror', error => console.error(error.message));
    for (let attempt = 0; ; attempt++) {
      try {
        await page.goto(`http://127.0.0.1:${port}/bake.html?space=${space}`);
        break;
      } catch (error) {
        if (attempt > 100 || server.exitCode !== null) throw new Error(`${error}\n${serverLog}`);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    await page.waitForFunction(() => !!window.__bake, null, { timeout: 180_000 });

    if (space === 'corridor' && !checking) {
      for (const kind of ['point', 'spot']) {
        const measured = await page.evaluate(lightKind => window.__bake.calibrate(lightKind), kind);
        await writeFile(path.join(cache, `calibration-three-${kind}.json`), JSON.stringify(measured, null, 2));
        const calibrationFile = path.join(cache, `calibration-blender-${kind}.json`);
        const calibration = spawnSync(process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender', ['-b', '--factory-startup', '--python-exit-code', '1', '--python', 'scripts/bake/calibrate.py', '--', calibrationFile, kind, String(measured.blenderPower)], { cwd: root, stdio: 'inherit' });
        if (calibration.status !== 0) throw new Error('Blender calibration failed');
        const other = JSON.parse(await readFile(calibrationFile, 'utf8'));
        const difference = Math.abs(measured.irradiance - other.irradiance) / other.irradiance;
        if (difference > measured.tolerance) throw new Error(`Light calibration exceeds tolerance: ${difference}`);
        console.log(`Calibration ${kind}: three ${measured.irradiance}, Blender ${other.irradiance}, difference ${(difference * 100).toFixed(3)}%`);
      }
    }

    await prepareBakeCapture(page, space);
    const result = await page.evaluate(hash => window.__bake.export(hash), sourceHash);
    result.manifest.sourceHash = sourceHash;
    const manifestPath = path.join(root, `apps/web/src/baked/assets/${space}.manifest.json`);
    if (checking) {
      await writeFile(path.join(cache, `${space}-checked.json`), `${JSON.stringify(result.manifest, null, 2)}\n`);
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      const staticMismatch = manifest.hash !== result.manifest.hash
        || manifest.materialHash !== result.manifest.materialHash
        || manifest.baselineHash !== result.manifest.baselineHash
        || manifest.atlases.some(atlas => atlas.encoding !== 'srgb-scale');
      if (staticMismatch) throw new Error(`Stale ${space} static bake; run pnpm bake ${space}`);
      console.log(`${space}: static fingerprint matches ${manifest.hash}`);
      await page.close();
      continue;
    }

    const dir = path.join(cache, space);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'source.glb'), Buffer.from(result.glb, 'base64'));
    await writeFile(path.join(dir, 'source.json'), `${JSON.stringify(result.manifest, null, 2)}\n`);
    await page.close();

    const blender = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender';
    const bake = spawnSync(blender, ['-b', '--factory-startup', '--python-exit-code', '1', '--python', 'scripts/bake/bake.py', '--', dir], { cwd: root, stdio: 'inherit' });
    if (bake.status !== 0) throw new Error(`Blender failed: ${bake.status}`);
    const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
    let bytes = 0;
    const codec = [];
    for (const atlas of manifest.atlases) {
      const encoded = spawnSync('cwebp', webpArgs(path.join(dir, atlas.file.replace('.webp', '.png')), path.join(dir, atlas.file)), { cwd: root, stdio: 'inherit' });
      if (encoded.status !== 0) throw new Error('cwebp encoding failed');
      const error = await measureEncoding(browser, path.join(dir, atlas.file.replace('.webp', '.png')), path.join(dir, atlas.file), atlas.scale);
      if (error.maxSteps > 2) throw new Error('WebP changed more than two encoded steps');
      codec.push({ file: atlas.file, ...error });
      atlas.bytes = (await stat(path.join(dir, atlas.file))).size;
      bytes += atlas.bytes;
    }
    await writeFile(path.join(dir, 'codec.json'), `${JSON.stringify(codec, null, 2)}\n`);
    const lightmapBudget = space === 'corridor' ? 400_000 : space === 'codex-room' ? 550_000 : space === 'exchange' ? 1_000_000 : 800_000;
    if (bytes > lightmapBudget) throw new Error(`${space} lightmaps exceed budget: ${bytes} > ${lightmapBudget}`);

    const out = path.join(root, 'apps/web/src/baked/assets');
    const roomBits = space === 'codex-room'
      ? { position: 14, normal: 10, texcoord: 14, color: 8 }
      : space === 'office'
        ? { position: 16, normal: 12, texcoord: 16, color: 8 }
        : BAKE_GEOMETRY_BITS;
    const quantized = spawnSync('pnpm', ['exec', 'gltf-transform', ...quantizeBakeArgs(path.join(dir, 'baked.glb'), path.join(dir, 'quantized.glb'), roomBits)], { cwd: root, stdio: 'inherit' });
    if (quantized.status !== 0) throw new Error('Geometry encoding failed');
    const geometryFiles = await splitGeometry(path.join(dir, 'quantized.glb'), out, space);
    for (const atlas of manifest.atlases) await cp(path.join(dir, atlas.file), path.join(out, atlas.file));
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(path.join(out, `${space}.ts`), assetsModuleSource({ space, geometryFiles, atlasFiles: manifest.atlases.map(atlas => atlas.file) }));
    console.log(`${space}: ${bytes} lightmap bytes; ${((performance.now() - started) / 1000).toFixed(1)}s; hash ${manifest.hash}`);
  }
} finally {
  await browser?.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch { /* Already exited. */ }
}
