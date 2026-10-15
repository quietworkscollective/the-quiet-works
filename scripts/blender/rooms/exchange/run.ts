/** Build, bake, validate, and optimise the Exchange room from its committed Blender source. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { readGlb } from '../../../../apps/web/src/assets/original/glb.ts';
import { optimise } from '../../props/optimise.ts';

const ROOT = resolve(import.meta.dirname, '../../../..');
const HERE = join(ROOT, 'scripts/blender/rooms/exchange');
const OUTPUT = join(ROOT, 'apps/web/src/chambers/exchange/assets/exchange.glb');
const PACKED_OUTPUT = `${OUTPUT}.gz`;
const BLENDER = process.env['BLENDER'] ?? '/Applications/Blender.app/Contents/MacOS/Blender';
const MAX_BYTES = 3_000_000;
const MAX_TRIANGLES = 250_000;
const MAX_DRAW_CALLS = 150;

const { values } = parseArgs({
  options: {
    work: { type: 'string' },
    'no-bake': { type: 'boolean', default: false },
    res: { type: 'string' },
    samples: { type: 'string' },
  },
});

const work = resolve(values.work ?? process.env['EXCHANGE_WORK'] ?? join(tmpdir(), 'unheld-exchange'));
mkdirSync(work, { recursive: true });
const raw = join(work, 'exchange.raw.glb');
if (!values['no-bake']) {
  const args = ['-b', '--factory-startup', '--python-exit-code', '1', '--python', join(HERE, 'build.py'), '--', '--work', work];
  if (values.res) args.push('--res', values.res);
  if (values.samples) args.push('--samples', values.samples);
  const result = spawnSync(BLENDER, args, { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Blender build failed (${result.status})`);
}
if (!existsSync(raw)) throw new Error(`Missing ${raw}; build the room or pass --work to its existing exports`);

mkdirSync(join(ROOT, 'apps/web/src/chambers/exchange/assets'), { recursive: true });
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
const document = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(12, true)))) as {
  nodes?: { mesh?: number; name?: string }[];
  meshes?: { primitives?: unknown[] }[];
  materials?: { name?: string; emissiveFactor?: number[] }[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
};
const drawCalls = (document.nodes ?? []).reduce((sum, node) => sum + (node.mesh === undefined ? 0 : document.meshes?.[node.mesh]?.primitives?.length ?? 0), 0);
const names = new Set(stats.nodeNames);
const required = [
  'inspect_handset', 'inspect_rulebook', 'inspect_wiring_diagram', 'inspect_ladder',
  'inspect_lamp_test', 'inspect_tea_flask', 'inspect_cardigan', 'inspect_shift_roster',
  'inspect_operator_frame', 'inspect_wanted_bell', 'operator_lamp', 'phone_handset',
  'desk_lamp_emitter', 'clerestory_emitter',
  ...Array.from({ length: 12 }, (_, index) => `line_jack_${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 12 }, (_, index) => `line_lamp_${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 12 }, (_, index) => `line_card_${String(index + 1).padStart(2, '0')}`),
];
const missing = required.filter(name => !names.has(name));
if (missing.length) throw new Error(`Missing named interactive nodes: ${missing.join(', ')}`);
for (const name of ['warm desk lamp glass', 'clerestory glass']) {
  const emission = document.materials?.find(material => material.name === name)?.emissiveFactor;
  if (!emission || Math.max(...emission) >= 0.2) throw new Error(`Lamp emission is missing or exceeds the clipping guard: ${name}`);
}
if (stats.triangles > MAX_TRIANGLES) throw new Error(`Triangle budget exceeded: ${stats.triangles}`);
if (drawCalls > MAX_DRAW_CALLS) throw new Error(`Draw-call budget exceeded: ${drawCalls}`);
if (stats.fileBytes > MAX_BYTES) throw new Error(`Room model exceeds 3 MB: ${stats.fileBytes}`);
if (packed.byteLength > MAX_BYTES) throw new Error(`Packaged room model exceeds 3 MB: ${packed.byteLength}`);
if (stats.extensionsUsed.some(extension => /DRACO|meshopt|BASIS|KTX/i.test(extension))) throw new Error('A forbidden glTF decoder extension is present');
if (stats.imageTypes.some(type => type !== 'image/webp')) throw new Error('Room textures are not all WebP');
console.log(`Exchange: ${stats.fileBytes} bytes GLB, ${packed.byteLength} bytes packed, ${stats.textureBytes} texture bytes, ${stats.triangles} triangles, ${drawCalls} draw calls`);
