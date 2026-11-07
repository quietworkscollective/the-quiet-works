/** Build the Exchange set in Blender, optimise it, and hold the shipped binary to the script's gates. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { readGlb } from '../../../../apps/web/src/assets/original/glb.ts';
import { isDynamicExchangeNode } from '../../../../apps/web/src/chambers/exchange/nodes.ts';
import { OUTLINE_NODES } from '../../../../apps/web/src/chambers/exchange/scene/hotspots.ts';
import { LETTERED_FACES, readAccessor, readFace, readGlbDocument } from '../../../../apps/web/src/chambers/exchange/scene/lettering.ts';
import { optimise } from '../../props/optimise.ts';

const ROOT = resolve(import.meta.dirname, '../../../..');
const HERE = join(ROOT, 'scripts/blender/rooms/exchange');
const ASSETS = join(ROOT, 'apps/web/src/chambers/exchange/assets');
const OUTPUT = join(ASSETS, 'exchange.glb');
const BLENDER = process.env['BLENDER'] ?? '/Applications/Blender.app/Contents/MacOS/Blender';
const LIMITS = { bytes: 3_000_000, triangles: 250_000, drawCalls: 150 };

const lineNodes = Array.from({ length: 12 }, (_, index) => {
  const number = String(index + 1).padStart(2, '0');
  return [`line_lamp_${number}`, `line_card_${number}`, index === 2 ? 'certification_jack' : `line_jack_${number}`];
}).flat();
const REQUIRED = [
  ...lineNodes, ...OUTLINE_NODES, 'switchboard', 'switchboard_upper', 'exchange_walls', 'exchange_floor', 'maker_mark_plaque', 'maker_credit',
  'enquiry_cord_rest', 'enquiry_cord_guide', 'enquiry_cord_seated', 'enquiry_plug_guide',
  'operator_panel', 'operator_plate_pivot', 'operator_plate_stop', 'operator_conduit', 'operator_lamp', 'operator_lamp_bracket',
  'operator_ticket_old', 'operator_ticket_new', 'operator_test_lead_seated', 'night_service_pivot', 'phone_coiled_cord', 'phone_coiled_cord_laid',
  'ticket_drawer_runners', 'ledge_lamp', 'desk_lamp_emitter', 'apron_strip', 'clerestory_emitter', 'desk_modesty_board',
];
const CUT = /^(field_jacks|gallery|inspect_ladder|inspect_lamp_test|inspect_operator_frame|window_seat|operator_lamp_floor_support)/;
const HINGES = {
  operator_plate_pivot: { translation: [0.50, 0.36, -5.70], child: 'operator_plate' },
  night_service_pivot: { translation: [1.37, 1.02, -8.52], child: 'night_service_switch' },
} as const;

interface BuildRequest {
  /** Where Blender writes the raw export and its metadata. */
  readonly folder: string;
  /** False reuses an earlier export in `folder`. */
  readonly runBlender: boolean;
  /** Passed through to build.py untouched. */
  readonly passThrough: readonly string[];
}

function readRequest(argv: readonly string[]): BuildRequest {
  const flags = parseArgs({
    args: [...argv],
    options: { work: { type: 'string' }, 'no-bake': { type: 'boolean' }, res: { type: 'string' }, samples: { type: 'string' } },
  }).values;
  const passThrough = (['res', 'samples'] as const).flatMap(name => flags[name] === undefined ? [] : [`--${name}`, flags[name]]);
  return {
    folder: resolve(flags.work ?? process.env['EXCHANGE_WORK'] ?? join(tmpdir(), 'unheld-exchange')),
    runBlender: flags['no-bake'] !== true,
    passThrough,
  };
}

/** Runs build.py headless and returns the raw export it leaves behind. */
function exportSet(request: BuildRequest): string {
  mkdirSync(request.folder, { recursive: true });
  const exported = join(request.folder, 'exchange.raw.glb');
  if (request.runBlender) {
    const script = ['--python', join(HERE, 'build.py'), '--', '--work', request.folder, ...request.passThrough];
    const run = spawnSync(BLENDER, ['-b', '--factory-startup', '--python-exit-code', '1', ...script], { cwd: ROOT, stdio: 'inherit' });
    if (run.status !== 0) throw new Error(`Blender build failed (${run.status})`);
  }
  if (!existsSync(exported)) throw new Error(`No export at ${exported}: run Blender, or point --work at a folder that holds one`);
  return exported;
}

/** Optimises the export into the shipped file and its packed twin, then has gltf-transform validate it. */
async function shipSet(exported: string): Promise<Uint8Array> {
  mkdirSync(ASSETS, { recursive: true });
  // Positions stay 32-bit float: quantising them moves each node to its mesh centre, off its authored origin.
  await optimise(exported, OUTPUT, { quality: { color: 88, orm: 90, normal: 94 } });
  const shipped = readFileSync(OUTPUT);
  writeFileSync(`${OUTPUT}.gz`, gzipSync(shipped, { level: 9 }));
  const report = spawnSync('pnpm', ['exec', 'gltf-transform', 'validate', OUTPUT], { cwd: ROOT, encoding: 'utf8' });
  if (report.status !== 0) {
    for (const stream of [report.stdout, report.stderr]) if (stream) process.stderr.write(stream);
    throw new Error(`glTF validation failed (${report.status})`);
  }
  return new Uint8Array(shipped);
}

const request = readRequest(process.argv.slice(2));
const bytes = await shipSet(exportSet(request));
const packed = readFileSync(`${OUTPUT}.gz`);
const stats = readGlb(bytes);
const document = readGlbDocument(bytes);
const { nodes, meshes } = document.json;
const names = new Set(stats.nodeNames);
const fail = (reason: string): never => { throw new Error(`Exchange export: ${reason}`); };

const missing = REQUIRED.filter(name => !names.has(name));
if (missing.length) fail(`missing nodes ${missing.join(', ')}`);
const cut = stats.nodeNames.filter(name => CUT.test(name));
if (cut.length) fail(`cut geometry is back: ${cut.join(', ')}`);

for (const [name, hinge] of Object.entries(HINGES)) {
  const node = nodes.find(entry => entry.name === name);
  const at = node?.translation ?? [];
  if (node?.mesh !== undefined) fail(`${name} must stay an empty parent`);
  if (hinge.translation.some((value, axis) => Math.abs(value - (at[axis] ?? Infinity)) > 1e-4)) fail(`${name} left its hinge: ${at.join(', ')}`);
  if (!node?.children?.some(child => nodes[child]?.name === hinge.child)) fail(`${hinge.child} is not hung from ${name}`);
}

const cordCounts = ['rest', 'guide', 'seated'].map(pose => {
  const node = nodes.find(entry => entry.name === `enquiry_cord_${pose}`);
  return readAccessor(document, meshes[node?.mesh ?? -1]?.primitives[0]?.attributes['POSITION'] ?? -1).length;
});
if (new Set(cordCounts).size !== 1) fail(`the cord poses cannot morph: ${cordCounts.join(', ')} vertices`);

const meta = JSON.parse(readFileSync(join(request.folder, 'exchange.meta.json'), 'utf8')) as { moving: string[] };
const unlisted = meta.moving.filter(name => !isDynamicExchangeNode(name));
if (unlisted.length) fail(`moving nodes outside nodes.ts: ${unlisted.join(', ')}`);

for (const face of LETTERED_FACES) {
  const reading = readFace(document, face);
  if (reading.screenRight <= 0) fail(`${face.node} would read mirrored from ${face.view}`);
  if (reading.facing <= 0) fail(`${face.node} faces away from ${face.view}`);
}

const drawCalls = nodes.reduce((sum, node) => sum + (node.mesh === undefined ? 0 : meshes[node.mesh]?.primitives.length ?? 0), 0);
if (stats.triangles > LIMITS.triangles) fail(`triangle budget exceeded: ${stats.triangles}`);
if (drawCalls > LIMITS.drawCalls) fail(`draw-call budget exceeded: ${drawCalls}`);
if (stats.fileBytes > LIMITS.bytes || packed.byteLength > LIMITS.bytes) fail(`over 3 MB: ${stats.fileBytes} GLB, ${packed.byteLength} packed`);
if (stats.extensionsUsed.some(extension => /DRACO|meshopt|BASIS|KTX/i.test(extension))) fail('a forbidden decoder extension is present');
if (stats.imageTypes.some(type => type !== 'image/webp')) fail('room textures are not all WebP');
console.log(`Exchange: ${stats.fileBytes} bytes GLB, ${packed.byteLength} bytes packed, ${stats.textureBytes} texture bytes, ${stats.triangles} triangles, ${drawCalls} draw calls`);
