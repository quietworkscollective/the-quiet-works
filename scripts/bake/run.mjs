import { splitGeometry } from './split.mjs';
import { measureEncoding } from './measure-encoding.mjs';
import { webpArgs } from './webp.mjs';
import { sourceInputs, assertSourceFresh } from './inputs.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, stat, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const ansiEscape = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g');
const checking = process.argv.includes('--check');
const requested = process.argv.find(s => ['corridor','office'].includes(s));
const spaces = checking ? (requested ? [requested] : ['corridor', 'office']) : [process.argv[2]];
if (spaces.some(s => !['corridor','office'].includes(s))) throw new Error('Usage: pnpm bake corridor|office');
const root = fileURLToPath(new URL('../../', import.meta.url));
const cache = path.join(root, '.bake-cache');
// Freshness uses only authored bytes; checks need neither a browser nor Blender.
await mkdir(cache, { recursive: true });
const inputs = new Map();
for (const space of spaces) {
  const input = await sourceInputs(root, space);
  inputs.set(space, input.hash);
  await writeFile(path.join(cache, `${space}-inputs.json`), JSON.stringify(input, null, 2)+'\n');
  if (checking) {
    const manifest = JSON.parse(await readFile(path.join(root, `apps/web/src/baked/assets/${space}.manifest.json`), 'utf8'));
    assertSourceFresh(space, manifest, input.hash);
    console.log(`${space}: source fingerprint matches ${input.hash} (${input.files.length} files)`);
  }
}
if (checking) process.exit(0);
const { chromium } = require('@playwright/test');
const port = Number(process.env.BAKE_PORT ?? 5186);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('BAKE_PORT must be a valid TCP port');
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
 // Canvas export is only for Blender; rendered pixels never enter freshness checks.
 browser = await chromium.launch({ args: [`--use-angle=${angle}`, '--ignore-gpu-blocklist', '--disable-accelerated-2d-canvas', ...(angle === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : [])] });
  for (const space of spaces) {
    const started = performance.now();
    const sourceHash = inputs.get(space);
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
    result.manifest.sourceHash = sourceHash;
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
