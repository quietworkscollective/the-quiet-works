import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RECORDS_MANIFEST_PATH = path.join(PACKAGE_DIR, 'src', 'audio', 'music', 'records', 'manifest.json');
const RECORDS_MANIFEST = JSON.parse(readFileSync(RECORDS_MANIFEST_PATH, 'utf8'));

/** Megabytes are decimal megabytes, 1 MB = 1,000,000 bytes. */
export const INITIAL_DOWNLOAD_BUDGET_BYTES = 3_000_000;
export const ROOM_ROUTE_BUDGET_BYTES = 3_000_000;
export const SHARED_MEDIA_BUDGET_BYTES = RECORDS_MANIFEST.budgetBytes;
export const WHOLE_BUILD_BUDGET_BYTES = 36_000_000;

const STATIC_IMPORT = /\bimport\s*(?:\{[^}]*\}|\*\s+as\s+[\w$]+|[\w$]+)\s*from\s*["']([^"']+)["']/g;
const SIDE_EFFECT_IMPORT = /\bimport\s*["']([^"']+)["']/g;
const RE_EXPORT = /\bexport\s*(?:\{[^}]*\}|\*)\s*from\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*(?:"([^"]+)"|'([^']+)'|`([^`$]+)`)[^)]*\)/g;
const HTML_TAG = /<(script|link|img|video|source)\b([^>]*)>/gi;
const HTML_ATTRIBUTE = /\b([\w-]+)\s*=\s*(["'])(.*?)\2/gi;
const CSS_URL = /url\(\s*(?:"([^"]+)"|'([^']+)'|([^)'"\s]+))\s*\)/gi;
const CSS_IMPORT = /@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)')\s*\)?/gi;
const JS_ASSET_REFERENCE = /(?:^|["'`])\/?assets\/([A-Za-z0-9._-]+\.(?:css|webp|avif|png|jpe?g|svg|woff2?))(?=["'`?#])/g;
const IMAGE_OR_FONT = /\.(?:webp|avif|png|jpe?g|svg|woff2?)$/i;
const STARTUP_SURFACE_MODULE = /(?:^|\/)(?:plaster-worn|terrazzo|oak-panelling|painted-timber|enamel-steel|brass)-(?:albedo|normal|orm)-[^/]+\.js$/;
const DEFERRED_CORRIDOR_GEOMETRY = /(?:^|\/)corridor-geometry-\d+-[^/]+\.js$/;
const CHAMBER_ROOT = /^src\/chambers\/([^/]+)\/index\.(?:tsx?|jsx?)$/;
// These shared catalogue assets are selected explicitly by OfficeScene when it mounts. The
// global catalogue's other lazy loaders appear in the same Vite dynamic-import list but are not
// requested by this route. The scene-owned GLBs are followed through its own source directory.
const ROOM_ASSET_IMPORTS = new Map([
  ['certification-office', [
    /^src\/assets\/models\/(?:chair-painted-wood|cart-tool-green|kettle-vintage|lamp-anglepoise)\.glb\?url&inline$/,
    /^src\/assets\/surfaces\/(?:concrete|linoleum|enamel-steel|brass)-(?:albedo|normal|orm)\.webp\?url$/,
  ]],
]);

/**
 * Measures the first-visit request graph, each chamber's expanded route graph including nested
 * dynamic imports fetched after mount, shared gramophone media, and the whole-build backstop.
 * Graph entries come from Vite's build manifest.
 */
export function measureAssetBudgets(distDir) {
  const htmlPath = path.join(distDir, 'index.html');
  if (!statFile(htmlPath)) throw new Error('built index.html is missing');
  const buildManifestPath = path.join(distDir, '.vite', 'manifest.json');
  if (!statFile(buildManifestPath)) throw new Error('Vite build manifest is missing; enable build.manifest');
  const buildManifest = JSON.parse(readFileSync(buildManifestPath, 'utf8'));
  const allFiles = new Set(walkFiles(distDir));
  const initialFiles = new Set(['index.html']);
  const pending = [];
  const visited = new Set();
  const missing = new Set();

  const enqueueUrl = (rawUrl, fromFile) => {
    const rel = localPath(rawUrl, fromFile);
    if (rel === null) return;
    if (!allFiles.has(rel)) {
      missing.add(`${fromFile} references missing local asset ${rawUrl}`);
      return;
    }
    pending.push(rel);
  };

  const html = readFileSync(htmlPath, 'utf8');
  const responsivePreloads = new Map();
  for (const match of html.matchAll(HTML_TAG)) {
    const tag = match[1].toLowerCase();
    const attributes = new Map([...match[2].matchAll(HTML_ATTRIBUTE)].map(attribute => [attribute[1].toLowerCase(), attribute[3]]));
    const relation = (attributes.get('rel') ?? '').toLowerCase().split(/\s+/);
    const url = tag === 'link'
      ? ['preload', 'modulepreload', 'stylesheet'].some(value => relation.includes(value)) ? attributes.get('href') : undefined
      : tag === 'script'
        ? attributes.get('src')
        : attributes.get('src') ?? (tag === 'video' ? attributes.get('poster') : undefined);
    if (!url) continue;

    const orientation = attributes.get('media')?.match(/orientation\s*:\s*(portrait|landscape)/i)?.[1]?.toLowerCase();
    if (tag === 'link' && relation.includes('preload') && attributes.get('as') === 'image' && orientation) {
      const options = responsivePreloads.get(attributes.get('as')) ?? [];
      options.push(url);
      responsivePreloads.set(attributes.get('as'), options);
    } else enqueueUrl(url, 'index.html');
  }
  for (const options of responsivePreloads.values()) {
    const largest = options
      .map(url => ({ url, rel: localPath(url, 'index.html') }))
      .filter(candidate => candidate.rel && allFiles.has(candidate.rel))
      .sort((a, b) => gzipSync(readFileSync(path.join(distDir, b.rel))).byteLength - gzipSync(readFileSync(path.join(distDir, a.rel))).byteLength)[0];
    if (largest) enqueueUrl(largest.url, 'index.html');
    else for (const url of options) enqueueUrl(url, 'index.html');
  }

  let sawCorridorScene = false;
  while (pending.length > 0) {
    const rel = pending.pop();
    if (visited.has(rel)) continue;
    visited.add(rel);
    initialFiles.add(rel);

    const extension = path.extname(rel).toLowerCase();
    if (extension === '.js' || extension === '.mjs') {
      const source = readFileSync(path.join(distDir, rel), 'utf8');
      for (const match of source.matchAll(STATIC_IMPORT)) enqueueUrl(match[1], rel);
      for (const match of source.matchAll(SIDE_EFFECT_IMPORT)) enqueueUrl(match[1], rel);
      for (const match of source.matchAll(RE_EXPORT)) enqueueUrl(match[1], rel);
      for (const match of source.matchAll(JS_ASSET_REFERENCE)) {
        const asset = `assets/${match[1]}`;
        if (asset.endsWith('.css') && /^assets\/CorridorScene-[^/]+\.css$/.test(asset)) enqueueUrl(`/${asset}`, rel);
        else if (IMAGE_OR_FONT.test(asset)) enqueueUrl(`/${asset}`, rel);
      }
      for (const match of source.matchAll(DYNAMIC_IMPORT)) {
        const specifier = match[1] ?? match[2] ?? match[3];
        if (!specifier) continue;
        const target = localPath(specifier, rel);
        if (!target) continue;
        const corridorRuntime = /\/(?:CorridorScene|corridor|driver)-[^/]+\.js$/.test(`/${target}`)
          && !DEFERRED_CORRIDOR_GEOMETRY.test(target);
        if (corridorRuntime || STARTUP_SURFACE_MODULE.test(target)) {
          sawCorridorScene ||= /\/CorridorScene-[^/]+\.js$/.test(`/${target}`);
          enqueueUrl(specifier, rel);
        }
      }
    } else if (extension === '.css') {
      const source = readFileSync(path.join(distDir, rel), 'utf8');
      const fontUrls = new Set();
      for (const face of source.matchAll(/@font-face\s*\{[^}]*\}/gi)) {
        const urls = [...face[0].matchAll(CSS_URL)].map(match => match[1] ?? match[2] ?? match[3]);
        const hasWoff2 = urls.some(url => url.endsWith('.woff2'));
        for (const url of urls) if (!(hasWoff2 && url.endsWith('.woff'))) fontUrls.add(url);
      }
      for (const match of source.matchAll(CSS_URL)) {
        const url = match[1] ?? match[2] ?? match[3];
        const inFontFace = source.slice(0, match.index).lastIndexOf('@font-face') > source.slice(0, match.index).lastIndexOf('}');
        if (inFontFace && !fontUrls.has(url)) continue;
        enqueueUrl(url, rel);
      }
      for (const match of source.matchAll(CSS_IMPORT)) enqueueUrl(match[1] ?? match[2], rel);
    }
  }

  if (!sawCorridorScene) missing.add('built static graph has no eager CorridorScene chunk');

  const buildEntries = Object.entries(buildManifest);
  const recordOutputNames = new Set(RECORDS_MANIFEST.records.flatMap(record => record.outputs.map(output => output.path)));
  const sharedMediaFiles = new Set();
  for (const [key, entry] of buildEntries) {
    const sourceName = path.posix.basename(key.split('?', 1)[0]);
    if (!recordOutputNames.has(sourceName)) continue;
    addFile(entry.file, `gramophone record ${sourceName}`, allFiles, sharedMediaFiles, missing);
  }
  if (sharedMediaFiles.size !== recordOutputNames.size) {
    missing.add(`build manifest exposes ${sharedMediaFiles.size} gramophone record files; expected ${recordOutputNames.size}`);
  }

  const roots = buildEntries
    .filter(([key, entry]) => CHAMBER_ROOT.test(key) && entry.isDynamicEntry)
    .map(([key]) => key)
    .sort();
  if (roots.length === 0) missing.add('build manifest has no dynamic chamber entry');
  const roomRoutes = roots.map(root => {
    const graphFiles = new Set();
    const chamberDirectory = CHAMBER_ROOT.exec(root)?.[1] ?? root;
    addManifestGraph(buildManifest, root, allFiles, graphFiles, missing, new Set(), chamberDirectory);
    // Initial assets and shared records have already been downloaded or have their own budget.
    const routeFiles = new Set([...graphFiles].filter(file => !initialFiles.has(file) && !sharedMediaFiles.has(file) && !file.endsWith('.map')));
    const gzipBytes = [...routeFiles].reduce((sum, file) => sum + gzipSync(readFileSync(path.join(distDir, file))).byteLength, 0);
    return { key: root, label: routeLabel(chamberDirectory), files: routeFiles, gzipBytes };
  });

  let initialGzipBytes = 0;
  let initialRawBytes = 0;
  for (const rel of initialFiles) {
    const contents = readFileSync(path.join(distDir, rel));
    initialRawBytes += contents.byteLength;
    initialGzipBytes += gzipSync(contents).byteLength;
  }

  let totalBytes = 0;
  let totalGzipBytes = 0;
  for (const rel of allFiles) {
    if (rel.endsWith('.map')) continue;
    const contents = readFileSync(path.join(distDir, rel));
    totalBytes += contents.byteLength;
    totalGzipBytes += gzipSync(contents).byteLength;
  }
  const sharedMediaBytes = [...sharedMediaFiles].reduce((sum, file) => sum + statSync(path.join(distDir, file)).size, 0);

  return {
    initialFiles,
    initialRawBytes,
    initialGzipBytes,
    roomRoutes,
    sharedMediaFiles,
    sharedMediaBytes,
    totalBytes,
    totalGzipBytes,
    errors: [...missing],
  };
}

export function budgetViolations({ initialGzipBytes, sharedMediaBytes, totalBytes, errors = [] }) {
  const violations = [...errors];
  if (initialGzipBytes > INITIAL_DOWNLOAD_BUDGET_BYTES) {
    violations.push(`first-visit download is ${formatBytes(initialGzipBytes)} gzip; limit ${formatBytes(INITIAL_DOWNLOAD_BUDGET_BYTES)}`);
  }
  if (sharedMediaBytes > SHARED_MEDIA_BUDGET_BYTES) {
    violations.push(`shared gramophone records are ${formatBytes(sharedMediaBytes)} raw; limit ${formatBytes(SHARED_MEDIA_BUDGET_BYTES)}`);
  }
  if (totalBytes > WHOLE_BUILD_BUDGET_BYTES) {
    violations.push(`whole build is ${formatBytes(totalBytes)} raw excluding source maps; backstop ${formatBytes(WHOLE_BUILD_BUDGET_BYTES)}`);
  }
  return violations;
}

export function budgetWarnings({ roomRoutes = [] }) {
  return roomRoutes
    .filter(route => route.gzipBytes > ROOM_ROUTE_BUDGET_BYTES)
    .map(route => `${route.label} expanded lazy route is ${formatBytes(route.gzipBytes)} gzip; target ${formatBytes(ROOM_ROUTE_BUDGET_BYTES)}`);
}

function routeLabel(directory) {
  if (directory === 'certification-office') return 'Office';
  if (directory === 'exchange') return 'Annex / Exchange';
  if (directory.startsWith('annex-')) {
    const room = directory.slice('annex-'.length).replace(/(^|-)([a-z])/g, (_, separator, letter) => `${separator === '-' ? ' ' : ''}${letter.toUpperCase()}`);
    return `Annex / ${room}`;
  }
  return directory.replace(/(^|-)([a-z])/g, (_, separator, letter) => `${separator === '-' ? ' ' : ''}${letter.toUpperCase()}`);
}

function addManifestGraph(manifest, key, allFiles, files, missing, visiting, chamberDirectory) {
  if (visiting.has(key)) return;
  const entry = manifest[key];
  if (!entry) {
    missing.add(`build manifest is missing graph entry ${key}`);
    return;
  }
  visiting.add(key);
  addFile(entry.file, `manifest entry ${key}`, allFiles, files, missing);
  for (const filename of [...(entry.css ?? []), ...(entry.assets ?? [])]) {
    addFile(filename, `manifest entry ${key}`, allFiles, files, missing);
  }
  // Vite repeats index.html in chamber entries' import lists. The document is already part of
  // the first-visit graph; following its manifest entry here would pull the app-wide route graph
  // into every room's expanded download.
  for (const imported of entry.imports ?? []) {
    if (imported !== 'index.html') addManifestGraph(manifest, imported, allFiles, files, missing, visiting, chamberDirectory);
  }
  // Room-owned dynamic descendants are fetched as the chamber mounts and settles. Include those
  // recursively, plus only the matching bake branch from shared BakedSpace; ignore other room
  // entries and their bake modules.
  const bakeName = bakeNameForChamber(chamberDirectory);
  for (const imported of entry.dynamicImports ?? []) {
    const bakedModule = /^src\/baked\/assets\/(corridor|office|codex-room|exchange)\.ts$/.exec(imported);
    if (bakedModule && bakedModule[1] !== bakeName) continue;
    const roomOwnedModule = !bakedModule && isRoomOwnedModule(imported, chamberDirectory);
    const selectedSharedAsset = ROOM_ASSET_IMPORTS.get(chamberDirectory)?.some(pattern => pattern.test(imported)) ?? false;
    if (bakedModule?.[1] === bakeName || roomOwnedModule || selectedSharedAsset) {
      addManifestGraph(manifest, imported, allFiles, files, missing, visiting, chamberDirectory);
    }
  }
  visiting.delete(key);
}

function isForeignChamberModule(key, chamberDirectory) {
  const chamber = /^src\/chambers\/([^/]+)\//.exec(key);
  return chamber !== null && chamber[1] !== chamberDirectory;
}

function isRoomOwnedModule(key, chamberDirectory) {
  return key.startsWith(`src/chambers/${chamberDirectory}/`) && !isForeignChamberModule(key, chamberDirectory);
}

function bakeNameForChamber(directory) {
  if (directory === 'certification-office') return 'office';
  if (directory === 'annex-codex') return 'codex-room';
  return directory.startsWith('annex-') ? directory.slice('annex-'.length) : directory;
}

function addFile(filename, source, allFiles, files, missing) {
  if (!filename) {
    missing.add(`${source} has no emitted file`);
    return;
  }
  const normalized = path.posix.normalize(filename);
  if (!allFiles.has(normalized)) {
    missing.add(`${source} references missing build file ${filename}`);
    return;
  }
  files.add(normalized);
}

function localPath(rawUrl, fromFile) {
  if (!rawUrl || rawUrl.startsWith('#') || rawUrl.startsWith('//') || /^(?:[a-z][a-z\d+.-]*:|data:|blob:)/i.test(rawUrl)) return null;
  const pathname = rawUrl.split(/[?#]/, 1)[0];
  if (!pathname) return null;
  const rel = pathname.startsWith('/')
    ? path.posix.normalize(pathname.slice(1))
    : path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), pathname));
  return rel === '.' || rel === '..' || rel.startsWith('../') || path.posix.isAbsolute(rel) ? null : rel;
}

function statFile(file) {
  try { return statSync(file).isFile(); } catch { return false; }
}

function walkFiles(root, prefix = '') {
  return readdirSync(path.join(root, prefix), { withFileTypes: true }).flatMap(entry => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walkFiles(root, rel) : [rel];
  });
}

function formatBytes(bytes) {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(2)} MB` : `${(bytes / 1_000).toFixed(1)} kB`;
}
