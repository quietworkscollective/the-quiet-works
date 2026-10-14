/**
 * Rebuilds the original hero props from their Blender scripts.
 *
 *   node scripts/blender/props/run.ts                         every prop
 *   node scripts/blender/props/run.ts service-bell stamp-rack  chosen props (by id)
 *   node scripts/blender/props/run.ts --render <dir>           also render stills into <dir> and refresh previews
 *   node scripts/blender/props/run.ts --no-bake               reuse the raw exports already in the work folder
 *
 * For each prop: headless Blender builds the geometry, bakes the atlas and exports a raw glTF binary;
 * `optimise.ts` shrinks it into apps/web/src/assets/original/<id>.glb; the glTF validator must report
 * no errors; the file is measured and its entry in original.json rewritten.
 *
 * Environment: BLENDER (default: the macOS app), PROPS_WORK (default: a folder under the OS temp dir).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readGlb as readCatalogueGlb } from '../../../apps/web/src/assets/glbInfo.ts';
import { readGlb } from '../../../apps/web/src/assets/original/glb.ts';
import { optimise, pngToWebp } from './optimise.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const OUT = join(REPO, 'apps', 'web', 'src', 'assets', 'original');
const MANIFEST = join(OUT, 'original.json');
const BLENDER = process.env['BLENDER'] ?? '/Applications/Blender.app/Contents/MacOS/Blender';
const COPYRIGHT = '© 2026 Asiri Dalugoda. CC BY 4.0';

/** Priority order from the brief. Each script builds one prop or one family of variants. */
const SCRIPTS = [
  'trophy_cup_tall.py',
  'trophy_cup_squat.py',
  'trophy_shield.py',
  'trophy_plinth_small.py',
  'trophy_plinth_empty.py',
  'service_bell.py',
  'column_radiator.py',
  'filing_cabinet.py',
  'cricket_bat.py',
  'cricket_stumps.py',
  'cricket_ball.py',
  'scorebook.py',
  'stamp_rack.py',
  'banker_lamp.py',
  'book_rows.py',
  'desk_globe.py',
  'ledgers.py',
  'box_files.py',
  'rotary_telephone.py',
  'typewriter.py',
];

const TRIANGLE_CAP = { small: 3000, hero: 15000 } as const;

interface Meta {
  id: string;
  title: string;
  tier: 'small' | 'hero';
  moving: string[];
  emissive?: string[];
  [key: string]: unknown;
}

interface Entry {
  id: string;
  title: string;
  file: string;
  source: string;
  licence: string;
  copyright: string;
  tier: 'small' | 'hero';
  triangleCap: number;
  triangles: number;
  textureBytes: number;
  compressedBytes: number;
  /** Decoded GPU memory with mipmaps (RGBA8): what the catalogue's budget() adds up. */
  textureMemoryBytes: number;
  /** Primitives, one draw call each. */
  drawCalls: number;
  sha256: string;
  dimensions: { x: number; y: number; z: number };
  movingNodes: string[];
  emissiveNodes: string[];
  previews: string[];
}

function run(cmd: string, args: string[], opts: { quiet?: boolean } = {}): void {
  const res = spawnSync(cmd, args, { stdio: opts.quiet ? ['ignore', 'pipe', 'inherit'] : 'inherit', cwd: REPO });
  if (res.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(' ')} failed (${res.status})`);
}

function idsIn(script: string): string[] {
  const text = readFileSync(join(HERE, script), 'utf8');
  return [...text.matchAll(/\bid='([a-z0-9-]+)'/g)].map((m) => m[1] as string);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      render: { type: 'string' },
      'no-bake': { type: 'boolean', default: false },
      work: { type: 'string' },
      res: { type: 'string' },
      samples: { type: 'string' },
      'render-samples': { type: 'string' },
    },
  });
  const work = values.work ?? process.env['PROPS_WORK'] ?? join(tmpdir(), 'unheld-props');
  mkdirSync(work, { recursive: true });
  mkdirSync(OUT, { recursive: true });

  const wanted = new Set(positionals);
  const manifest: { props: Entry[] } = existsSync(MANIFEST)
    ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as { props: Entry[] })
    : { props: [] };

  for (const script of SCRIPTS) {
    const path = join(HERE, script);
    if (!existsSync(path)) continue;
    const ids = idsIn(script).filter((id) => wanted.size === 0 || wanted.has(id));
    if (ids.length === 0) continue;
    if (!values['no-bake']) {
      const args = ['-b', '--factory-startup', '--python', path, '--', '--work', work, '--only', ids.join(',')];
      if (values.res) args.push('--res', values.res);
      if (values.samples) args.push('--samples', values.samples);
      console.log(`blender ${script} (${ids.join(', ')})`);
      run(BLENDER, args, { quiet: true });
    }
    for (const id of ids) {
      const meta = JSON.parse(readFileSync(join(work, `${id}.meta.json`), 'utf8')) as Meta;
      const file = join(OUT, `${id}.glb`);
      await optimise(join(work, `${id}.raw.glb`), file, { copyright: COPYRIGHT });
      const check = spawnSync('pnpm', ['exec', 'gltf-transform', 'validate', file], { cwd: REPO, encoding: 'utf8' });
      if (check.status !== 0) {
        console.error(check.stdout, check.stderr);
        throw new Error(`${id}: gltf-transform validate reported errors`);
      }
      const bytes = new Uint8Array(readFileSync(file));
      const stats = readGlb(bytes);
      const catalogue = readCatalogueGlb(bytes);
      const previews: string[] = [];
      if (values.render) {
        mkdirSync(values.render, { recursive: true });
        const args = [
          '-b', '--factory-startup', '--python', join(HERE, 'render.py'), '--',
          '--glb', file, '--meta', join(work, `${id}.meta.json`), '--out', join(values.render, id),
          '--samples', values['render-samples'] ?? '160',
        ];
        run(BLENDER, args, { quiet: true });
        mkdirSync(join(OUT, 'previews'), { recursive: true });
        for (const tag of ['view', 'detail']) {
          await pngToWebp(join(values.render, `${id}-${tag}.png`), join(OUT, 'previews', `${id}-${tag}.webp`));
          previews.push(`previews/${id}-${tag}.webp`);
        }
      }
      const existing = manifest.props.find((p) => p.id === id);
      const entry: Entry = {
        id,
        title: meta.title,
        file: `${id}.glb`,
        source: relative(REPO, path),
        licence: 'CC-BY-4.0',
        copyright: COPYRIGHT,
        tier: meta.tier,
        triangleCap: TRIANGLE_CAP[meta.tier],
        triangles: stats.triangles,
        textureBytes: stats.textureBytes,
        compressedBytes: stats.fileBytes,
        textureMemoryBytes: catalogue.images.reduce((sum, image) => sum + Math.round(image.width * image.height * 4 * (4 / 3)), 0),
        drawCalls: catalogue.drawCalls,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        dimensions: { x: round3(stats.size.x), y: round3(stats.size.y), z: round3(stats.size.z) },
        movingNodes: meta.moving,
        emissiveNodes: stats.emissiveNodeNames,
        previews: previews.length > 0 ? previews : (existing?.previews ?? []),
      };
      manifest.props = [...manifest.props.filter((p) => p.id !== id), entry];
      console.log(`${id}: ${entry.triangles} tris, ${entry.compressedBytes} bytes (${entry.textureBytes} texture), ${entry.dimensions.x} x ${entry.dimensions.y} x ${entry.dimensions.z} m`);
    }
  }

  const order = SCRIPTS.flatMap((s) => (existsSync(join(HERE, s)) ? idsIn(s) : []));
  manifest.props.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}

await main();
