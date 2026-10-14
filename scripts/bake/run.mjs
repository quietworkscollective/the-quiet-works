import { splitGeometry } from './split.mjs';
import { measureEncoding } from './measure-encoding.mjs';
import { webpArgs } from './webp.mjs';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, stat, cp, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const ansiEscape = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g');
const checking = process.argv.includes('--check');
const requested = process.argv.find(s => ['corridor','office'].includes(s));
const spaces = checking ? (requested ? [requested] : ['corridor', 'office']) : [process.argv[2]];
if (spaces.some(s => !['corridor','office'].includes(s))) throw new Error('Usage: pnpm bake corridor|office');
const root = fileURLToPath(new URL('../../', import.meta.url));
const cache = path.join(root, '.bake-cache');
async function collectFiles(directory, include) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(file, include));
    else if (entry.isFile() && include(file)) files.push(file);
  }
  return files;
}
async function sourceInputsHash(space) {
  // Canvas pixels vary by host, so fingerprints use authored source files and static assets.
  const roomRoot = space === 'corridor' ? 'apps/web/src/corridor/world' : 'apps/web/src/chambers/certification-office/scene';
  const authoredAsset = file => /\.(css|woff2?|ttf|otf|png|jpe?g|webp|svg|avif)$/i.test(file);
  // Keep generated manifests and lightmaps out of their own input digest.
  const bakedAssets = `${path.join(root, 'apps/web/src/baked/assets')}${path.sep}`;
  const roots = [
    { directory: path.join(root, roomRoot), include: () => true },
    { directory: path.join(root, 'packages/engine/src'), include: () => true },
    { directory: path.join(root, 'apps/web/src'), include: file => authoredAsset(file) && !file.startsWith(bakedAssets) },
    { directory: path.join(root, 'apps/web/public'), include: authoredAsset },
  ].filter(source => existsSync(source.directory));
  const manifests = ['package.json', 'pnpm-lock.yaml', 'apps/web/package.json', 'packages/engine/package.json', 'packages/ui/package.json', 'apps/web/src/main.tsx']
    .map(file => path.join(root, file)).filter(existsSync);
  const files = [...new Set([...manifests, ...(await Promise.all(roots.map(source => collectFiles(source.directory, source.include)))).flat()])]
    .sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  if (files.length === 0) throw new Error(`No source inputs found for ${space} bake`);
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(path.relative(root, file).split(path.sep).join('/'));
    hash.update('\0');
    hash.update(await readFile(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}
const port = Number(process.env.BAKE_PORT ?? 5186);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('BAKE_PORT must be a valid TCP port');
await mkdir(cache, { recursive: true });
const server = spawn('pnpm', ['--filter','@tqw/web','dev','--config','../../scripts/bake/vite.config.ts','--port',String(port),'--strictPort'], { cwd: root, detached: true, stdio: ['ignore','pipe','pipe'] });
let serverLog = '';
server.stdout.on('data', d => { serverLog += d; }); server.stderr.on('data', d => { serverLog += d; });
let browser;
try {
await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Dev server did not start: '+serverLog)), 15000);
  server.on('exit', code => { clearTimeout(timeout); reject(new Error('Dev server exited: '+code+' '+serverLog)); });
  server.stdout.on('data', () => { if (serverLog.replace(ansiEscape, '').includes('Local:')) { clearTimeout(timeout); resolve(); } });
});
 const angle = process.env.BAKE_BROWSER_ANGLE ?? (process.platform === 'darwin' ? 'metal' : 'swiftshader');
 if (!['metal','swiftshader'].includes(angle)) throw new Error('BAKE_BROWSER_ANGLE must be metal or swiftshader');
 // The material fingerprints include canvas artwork; keep its raster path independent of ANGLE.
 browser = await chromium.launch({ args: [`--use-angle=${angle}`, '--ignore-gpu-blocklist', '--disable-accelerated-2d-canvas', ...(angle === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : [])] });
  for (const space of spaces) {
    const started = performance.now();
    const sourceHash = await sourceInputsHash(space);
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', timezoneId: 'Etc/UTC' });
    // The corridor clock hands read local time each frame; use a stable pose across build hosts.
    await page.clock.setFixedTime(new Date('2026-10-14T12:00:00.000Z'));
    page.on('pageerror', e => console.error(e.message));
    for (let attempt = 0; ; attempt++) {
    try { await page.goto(`http://127.0.0.1:${port}/bake.html?space=${space}`); break; }
      catch (error) { if (attempt > 100 || server.exitCode !== null) throw new Error(`${error}\n${serverLog}`); await new Promise(r => setTimeout(r, 100)); }
    }
    await page.waitForFunction(() => !!window.__bake, null, { timeout: 180000 });
    if (space === 'corridor' && !checking) {
      for (const kind of ['point','spot']) {
        const measured = await page.evaluate(k => window.__bake.calibrate(k), kind);
        await writeFile(path.join(cache, `calibration-three-${kind}.json`), JSON.stringify(measured, null, 2));
        const calibrationFile = path.join(cache,`calibration-blender-${kind}.json`);
        const calibration = spawnSync(process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender', ['-b','--factory-startup','--python-exit-code','1','--python','scripts/bake/calibrate.py','--',calibrationFile,kind,String(measured.blenderPower)], { cwd:root, stdio:'inherit' });
        if (calibration.status !== 0) throw new Error('Blender calibration failed');
        const other = JSON.parse(await readFile(calibrationFile,'utf8'));
        const difference = Math.abs(measured.irradiance - other.irradiance) / other.irradiance;
        if (difference > measured.tolerance) throw new Error(`Light calibration exceeds tolerance: ${difference}`);
        console.log(`Calibration ${kind}: three ${measured.irradiance}, Blender ${other.irradiance}, difference ${(difference*100).toFixed(3)}%`);
      }
    }
    const result = await page.evaluate(hash => window.__bake.export(hash), sourceHash);
    if (checking) {
      await writeFile(path.join(cache, `${space}-checked.json`), JSON.stringify(result.manifest, null, 2));
      const manifest = JSON.parse(await readFile(path.join(root,`apps/web/src/baked/assets/${space}.manifest.json`), 'utf8'));
      if (manifest.hash !== result.manifest.hash || manifest.materialHash !== result.manifest.materialHash || manifest.baselineHash !== result.manifest.baselineHash || manifest.atlases.some(a=>a.encoding!=='srgb-scale')) throw new Error(`Stale ${space} bake; run pnpm bake ${space}`);
      console.log(`${space}: static fingerprint matches ${manifest.hash}`);
      await page.close(); continue;
    }
    const dir = path.join(cache, space); await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'source.glb'), Buffer.from(result.glb, 'base64'));
    await writeFile(path.join(dir, 'source.json'), JSON.stringify(result.manifest, null, 2));
    await page.close();
    const blender = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender';
    const bake = spawnSync(blender, ['-b','--factory-startup','--python-exit-code','1','--python','scripts/bake/bake.py','--',dir], { cwd:root, stdio: 'inherit' });
    if (bake.status !== 0) throw new Error(`Blender failed: ${bake.status}`);
    const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
    let bytes = 0;
    const codec = [];
    for (const atlas of manifest.atlases) {
      const encoded = spawnSync('cwebp', webpArgs(path.join(dir, atlas.file.replace('.webp','.png')),path.join(dir,atlas.file)), { cwd:root, stdio: 'inherit' });
      if (encoded.status !== 0) throw new Error('cwebp encoding failed');
      const error = await measureEncoding(browser,path.join(dir,atlas.file.replace('.webp','.png')),path.join(dir,atlas.file),atlas.scale);
      if (error.maxSteps > 2) throw new Error('WebP changed more than two encoded steps');
      codec.push({file:atlas.file,...error});
      atlas.bytes = (await stat(path.join(dir, atlas.file))).size; bytes += atlas.bytes;
    }
    await writeFile(path.join(dir,'codec.json'),JSON.stringify(codec,null,2));
    if (bytes > (space === 'corridor' ? 400000 : 800000)) throw new Error(`${space} lightmaps exceed budget: ${bytes}`);
    const out = path.join(root,'apps/web/src/baked/assets');
    const quantized = spawnSync('pnpm', ['exec','gltf-transform','quantize',path.join(dir,'baked.glb'),path.join(dir,'quantized.glb'),'--quantize-position','16','--quantize-normal','12','--quantize-texcoord','16','--quantize-color','8'], { cwd:root, stdio:'inherit' });
    if (quantized.status !== 0) throw new Error('Geometry encoding failed');
    const geometryFiles = await splitGeometry(path.join(dir,'quantized.glb'), out, space);
    for (const atlas of manifest.atlases) await cp(path.join(dir,atlas.file),path.join(out,atlas.file));
    await writeFile(path.join(out,`${space}.manifest.json`),JSON.stringify(manifest,null,2)+'\n');
    await writeFile(path.join(out,`${space}.ts`),`${geometryFiles.map((f,i)=>`import geometry${i} from './${f}';`).join('\n')}\nimport manifest from './${space}.manifest.json';\n${manifest.atlases.map((a,i)=>`import image${i} from './${a.file}';`).join('\n')}\nimport type { BakeAssets } from '../runtime.ts';\nexport default { geometry: [${geometryFiles.map((_,i)=>`geometry${i}`).join(', ')}], manifest, images: [${manifest.atlases.map((_,i)=>`image${i}`).join(', ')}] } as BakeAssets;\n`);
    console.log(`${space}: ${bytes} lightmap bytes; ${((performance.now()-started)/1000).toFixed(1)}s; hash ${manifest.hash}`);
  }
} finally { await browser?.close(); try { process.kill(-server.pid, 'SIGTERM'); } catch { /* Already exited. */ } }
