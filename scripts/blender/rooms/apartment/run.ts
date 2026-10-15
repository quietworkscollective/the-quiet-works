/** Build, optimise and validate the Apartment stage set from its committed Blender source. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { readGlb } from '../../../../apps/web/src/assets/original/glb.ts';
import { optimise } from '../../props/optimise.ts';

const ROOT = resolve(import.meta.dirname, '../../../..');
const HERE = join(ROOT, 'scripts/blender/rooms/apartment');
const OUTPUT = join(ROOT, 'apps/web/src/chambers/apartment/assets/apartment.glb');
const PACKED_OUTPUT = `${OUTPUT}.gz`;
const BLENDER = process.env['BLENDER'] ?? '/Applications/Blender.app/Contents/MacOS/Blender';
const MAX_BYTES = 3_000_000;
const MAX_TRIANGLES = 250_000;
const MAX_DRAW_CALLS = 150;
const REQUIRED_NODES = [
  'Interact_Phone', 'Interact_Kettle', 'Interact_Faucet', 'Interact_Keys', 'Interact_Chair', 'Interact_Bill',
  'Interact_Cup', 'Interact_Magnet', 'Interact_Window', 'Interact_Cushion', 'Interact_Platform', 'Interact_Underside',
  'Kettle_Switch', 'Kettle_Smoke', 'Faucet_Handle', 'Water_Flow', 'Moving_Keys', 'Moving_Chair', 'Moving_Cup', 'Moving_Magnet',
  'Moving_Window_Sash', 'Moving_Cushion', 'Platform_Gate', 'Saucer_Turntable',
];

const { values } = parseArgs({ options: { work: { type: 'string' } } });
const work = resolve(values.work ?? join(ROOT, '.bake-cache/apartment'));
mkdirSync(work, { recursive: true });
mkdirSync(join(ROOT, 'apps/web/src/chambers/apartment/assets'), { recursive: true });
const raw = join(work, 'apartment.raw.glb');
const build = spawnSync(BLENDER, [
  '-b', '--factory-startup', '--python-exit-code', '1', '--python', join(HERE, 'build.py'), '--', raw,
], { cwd: ROOT, stdio: 'inherit' });
if (build.status !== 0) throw new Error(`Blender build failed (${build.status})`);

await optimise(raw, OUTPUT, { quality: { color: 88, orm: 90, normal: 94 }, quantizePosition: 16 });
const packed = gzipSync(readFileSync(OUTPUT), { level: 9 });
writeFileSync(PACKED_OUTPUT, packed);
const validation = spawnSync('pnpm', ['exec', 'gltf-transform', 'validate', OUTPUT], { cwd: ROOT, encoding: 'utf8' });
if (validation.status !== 0) {
  process.stderr.write(validation.stdout ?? '');
  process.stderr.write(validation.stderr ?? '');
  throw new Error(`glTF validation failed (${validation.status})`);
}

const bytes = new Uint8Array(readFileSync(OUTPUT));
const stats = readGlb(bytes);
const jsonLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(12, true);
const document = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as {
  nodes?: { mesh?: number; name?: string }[];
  meshes?: { primitives?: unknown[] }[];
  extensionsUsed?: string[];
};
const drawCalls = (document.nodes ?? []).reduce((sum, node) => sum + (node.mesh === undefined ? 0 : document.meshes?.[node.mesh]?.primitives?.length ?? 0), 0);
const names = new Set(stats.nodeNames);
const missing = REQUIRED_NODES.filter((name) => !names.has(name));
if (missing.length) throw new Error(`Missing separately named room nodes: ${missing.join(', ')}`);
if (stats.triangles > MAX_TRIANGLES) throw new Error(`Triangle budget exceeded: ${stats.triangles}`);
if (drawCalls > MAX_DRAW_CALLS) throw new Error(`Draw-call budget exceeded: ${drawCalls}`);
if (stats.fileBytes > MAX_BYTES || packed.byteLength > MAX_BYTES) throw new Error(`Room model exceeds 3 MB: ${stats.fileBytes} GLB, ${packed.byteLength} packed`);
if (stats.extensionsUsed.some((extension) => /DRACO|MESHOPT|BASIS|KTX/i.test(extension))) throw new Error('A forbidden glTF decoder extension is present');
if (stats.imageTypes.some((type) => type !== 'image/webp')) throw new Error('Room textures are not all WebP');
console.log(`Apartment model: ${stats.fileBytes} bytes GLB, ${packed.byteLength} bytes packed, ${stats.textureBytes} texture bytes, ${stats.triangles} triangles, ${drawCalls} draw calls`);
