import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

// Conservative source scopes: additions and removals participate, generated bakes never do.
const sharedDirectories = [
  'apps/web/src/assets',
  'apps/web/src/audio/music',
  'apps/web/src/bake',
  'scripts/bake',
  'apps/web/src/firstPerson',
  'apps/web/src/look',
  'packages/engine/src',
];
const sharedFiles = [
  'pnpm-lock.yaml',
  'apps/web/bake.html',
  'apps/web/src/baked/contract.ts',
  'apps/web/src/baked/lights.ts',
  'apps/web/src/main.tsx',
  'apps/web/src/App.tsx',
  'apps/web/src/environment.ts',
  'apps/web/src/routes.ts',
  'apps/web/src/pageScroll.ts',
  'apps/web/src/sceneFrame.ts',
  'apps/web/src/timing.ts',
  'apps/web/src/chambers/registry.ts',
  'packages/ui/src/contextualCues.ts',
];
const roomInputs = {
  corridor: ['apps/web/src/corridor'],
  office: ['apps/web/src/chambers/certification-office'],
  'codex-room': [
    'apps/web/src/chambers/annex-codex',
    'scripts/blender/rooms/codex-room',
    'apps/web/src/assets/outline-room.glb.gz',
  ],
  exchange: [
    'apps/web/src/chambers/exchange',
    'scripts/blender/rooms/exchange',
    'apps/web/src/chambers/exchange/assets/exchange.glb',
    'apps/web/src/chambers/exchange/assets/exchange.glb.gz',
  ],
};
const productionInput = name => /\.(?:[cm]?[jt]sx?|py|json|css|glb|gltf|bin|gz|png|jpe?g|webp|svg|avif|woff2?|ttf|otf)$/i.test(name) && !name.startsWith('.') && !/\.(test|spec|integration)\.[^.]+$/.test(name) && !['testUtils.ts', 'testSetup.ts', 'domStub.ts', 'README.md'].includes(name);
async function collect(root, directory) {
  const files = [];
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== '__pycache__') files.push(...await collect(root, file));
    else if (entry.isFile() && productionInput(entry.name)) files.push(file);
  }
  return files;
}
async function collectInput(root, input) {
  const inputPath = path.join(root, input);
  const info = await stat(inputPath);
  if (info.isDirectory()) return collect(root, input);
  if (info.isFile() && productionInput(path.basename(input))) return [input];
  return [];
}

export async function hashInputs(root, files) {
  const hash = createHash('sha256');
  hash.update('tqw-bake-source-v1\0');
  for (const file of [...new Set(files)].sort()) {
    const bytes = await readFile(path.join(root, file));
    // Length framing makes arbitrary binary assets unambiguous; no host paths or metadata.
    hash.update(`${Buffer.byteLength(file)}:${file}:${bytes.length}:`);
    hash.update(bytes);
  }
  return hash.digest('hex');
}

export async function sourceInputs(root, space) {
  if (!(space in roomInputs)) throw new Error(`Unknown bake space: ${space}`);
  const files = [...sharedFiles];
  for (const directory of sharedDirectories) files.push(...await collect(root, directory));
  for (const input of roomInputs[space]) files.push(...await collectInput(root, input));
  const chambers = 'apps/web/src/chambers';
  for (const entry of await readdir(path.join(root, chambers), { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== '__pycache__') files.push(`${chambers}/${entry.name}/door.ts`);
  }
  // Font CSS and the font bytes it imports are pinned by the committed frozen lockfile.
  const main = await readFile(path.join(root, 'apps/web/src/main.tsx'), 'utf8');
  const fontImports = [...main.matchAll(/import ['"](@fontsource\/[^'"]+\.css)['"]/g)];
  if (!fontImports.length) throw new Error('No authored bake fonts found');
  for (const [, imported] of fontImports) {
    const cssFile = `apps/web/node_modules/${imported}`;
    files.push(cssFile);
    const css = await readFile(path.join(root, cssFile), 'utf8');
    for (const [, url] of css.matchAll(/url\(['"]?(\.\/[^)'"\s]+)['"]?\)/g)) {
      files.push(path.posix.join(path.posix.dirname(cssFile), url));
    }
  }
  const sorted = [...new Set(files)].sort();
  return { hash: await hashInputs(root, sorted), files: sorted };
}

export function assertSourceFresh(space, manifest, actual) {
  if (manifest.sourceHash !== actual || manifest.atlases.some(a => a.encoding !== 'srgb-scale')) {
    throw new Error(`Stale ${space} bake; run pnpm bake ${space} (sourceHash: committed=${manifest.sourceHash ?? 'missing'}, current=${actual})`);
  }
}
