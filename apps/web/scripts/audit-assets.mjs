#!/usr/bin/env node
/**
 * Shipped-asset audit for the web build. Run after a build: `pnpm audit:assets`.
 *
 * Walks apps/web/dist and fails (exit code 1) when:
 *  - a file has an unclassified type (it is neither code, a source map nor listed media);
 *  - a media file (fonts, images, audio, 3D, binaries) matches no entry in
 *    assets.manifest.json, or matches more than one (AGENTS.md #8: all asset reuse must
 *    be licensed and attributed);
 *  - a manifest entry is malformed, uses an unreviewed licence, or its licence file is
 *    missing, outside the repository, or does not name the licence it claims;
 *  - a code file references a remote http(s), ws(s) or ftp URL that is not on the
 *    explicit allowlist below (AGENTS.md #4 and the strict CSP: nothing is fetched from
 *    another origin);
 *  - the first-visit graph exceeds 3 MB compressed, gramophone records exceed their dedicated
 *    raw-byte cap, or the whole build exceeds its 36 MB backstop (docs/DESIGN.md §8).
 *  - expanded room routes above 3 MB compressed are reported as warnings pending the lead's ruling.
 *
 * Plain Node ESM with no dependencies. `--verbose` also lists every allowlisted URL found
 * and every distinct host referenced from source maps.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
  INITIAL_DOWNLOAD_BUDGET_BYTES,
  ROOM_ROUTE_BUDGET_BYTES,
  SHARED_MEDIA_BUDGET_BYTES,
  WHOLE_BUILD_BUDGET_BYTES,
  budgetWarnings,
  budgetViolations,
  measureAssetBudgets,
} from './asset-budgets.mjs';

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(PACKAGE_DIR, '..', '..');
const DIST_DIR = path.join(PACKAGE_DIR, 'dist');
const MANIFEST_PATH = path.join(PACKAGE_DIR, 'scripts', 'assets.manifest.json');
const VERBOSE = process.argv.includes('--verbose');

/** Text files the audit scans for remote URLs. `_headers` and `_redirects` are Cloudflare static-asset files. */
const CODE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.htm', '.json', '.webmanifest', '.txt', '.xml', '.md']);
const CODE_FILE_NAMES = new Set(['_headers', '_redirects']);
const SOURCE_MAP_EXTENSION = '.map';

// Third-party licence notices emitted by the build (vite.config.ts thirdPartyNotices()).
// Minified bundles drop licence headers, so MIT/OFL notices must ship in this file. Licence
// texts contain URLs (e.g. the OFL's own address); like source maps they are reported, not
// enforced, because the file is never executed and nothing in it is fetched.
const NOTICES_FILE = 'third-party-notices.txt';
const REQUIRED_NOTICE_PACKAGES = ['react', 'react-dom', 'scheduler', 'three', '@react-three/fiber'];

/** Everything below needs a manifest entry (licence and attribution) before it may ship. */
const MEDIA_EXTENSIONS = new Set([
  '.woff', '.woff2', '.ttf', '.otf',
  '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg',
  '.mp3', '.ogg', '.opus', '.wav', '.m4a', '.webm',
  '.glb', '.gltf', '.ktx2', '.bin',
]);

/**
 * Licences reviewed for shipped assets, each with text its licence file must contain.
 * Adding a licence id here is a reviewed change: confirm it permits redistribution in a
 * static site and that its attribution terms are met by the manifest entry.
 */
/** A third-party file committed to this repository, by provider: `third-party:Poly Haven`. */
const THIRD_PARTY_SOURCE = /^third-party:[A-Za-z0-9][\w .-]*$/;

const LICENCE_EXPECTATIONS = {
  'OFL-1.1': [/SIL Open Font License/i, /Version 1\.1/i],
  MIT: [/Permission is hereby granted, free of charge/i],
  'Apache-2.0': [/Apache License/i, /Version 2\.0/i],
  'CC0-1.0': [/CC0 1\.0 Universal/i],
  'CC-BY-4.0': [/Attribution 4\.0 International/i],
  // Recordings their performers dedicated to the public domain; the text on file quotes the dedication.
  'LicenseRef-Public-Domain': [/released into the public domain/i],
};

/**
 * Remote URLs allowed to appear in shipped code. Matching is exact, so a dependency
 * update that introduces a new URL fails the audit until the URL is reviewed and added
 * here with a reason. Every entry below was found in a real build; none is fetched at
 * runtime (the page's CSP is `default-src 'self'`).
 */
const URL_ALLOWLIST = [
  {
    url: 'https://github.com/quietworkscollective/the-quiet-works/blob/main/docs/commons/AGENT_DOSSIER.md',
    reason: 'Contribution guidance link in Details; navigation only, never fetched.',
  },
  {
    url: 'https://dalugoda.com/',
    reason: 'author link; navigation only, never fetched',
  },
  {
    url: 'https://unheld.space/',
    reason: 'Canonical site URL: <link rel="canonical"> and og:url in index.html, and the SITE constant in the app bundle. Metadata and display text, never fetched.',
  },
  { url: 'https://unheld.space/llms.txt', reason: 'Link to the static language-model index from route metadata; not fetched by the site.' },
  { url: 'https://unheld.space/llms-full.txt', reason: 'Link to the combined static Markdown text index; navigation only, never fetched by the site.' },
  { url: 'https://unheld.space/skill.md', reason: 'Public agent onboarding context linked from the Agents page and Markdown pages; navigation only.' },
  { url: 'https://unheld.space/?mode=text', reason: 'Link to the visitor-facing text mode from Markdown pages and agent onboarding; navigation only.' },
  { url: 'https://unheld.space/sitemap.xml', reason: 'Public sitemap address in robots.txt; metadata only, not fetched by the site.' },
  { url: 'https://unheld.space/share-unheld-1200x630.png', reason: 'Static 1200 × 630 card derived from the shipped hero poster; not fetched by app code.' },
  { url: 'https://unheld.space/third-party-notices.txt', reason: 'Bundled software licences linked from the Licences reading page; navigation only.' },
  { url: 'https://unheld.space/#website', reason: 'Schema.org JSON-LD identifier for the website; metadata only, not fetched by the site.' },
  { url: 'https://unheld.space/#the-quiet-works', reason: 'Schema.org JSON-LD identifier for the artwork; metadata only, not fetched by the site.' },
  { url: 'https://schema.org', reason: 'JSON-LD vocabulary identifier; metadata only, not fetched by the site.' },
  { url: 'http://www.sitemaps.org/schemas/sitemap/0.9', reason: 'XML namespace identifier in the sitemap; metadata only, never fetched by the site.' },
  { url: 'https://github.com/quietworkscollective/the-quiet-works/issues/new?template=room-proposal.yml', reason: 'Public GitHub room-proposal route linked from the Agents page and agent skill.' },
  { url: 'https://github.com/quietworkscollective/the-quiet-works/blob/main/.github/PULL_REQUEST_TEMPLATE/commons-contribution.md', reason: 'Public GitHub manifest template linked from the Agents page and agent skill.' },
  {
    url: 'http://www.w3.org/2000/svg',
    reason: 'SVG namespace identifier passed to createElementNS by React DOM. An identifier, never fetched.',
  },
  {
    url: 'http://www.w3.org/1999/xhtml',
    reason: 'XHTML namespace identifier passed to createElementNS (React Three Fiber). An identifier, never fetched.',
  },
  {
    url: 'http://www.w3.org/1998/Math/MathML',
    reason: 'MathML namespace identifier passed to createElementNS by React DOM. An identifier, never fetched.',
  },
  {
    url: 'http://www.w3.org/1999/xlink',
    reason: 'XLink namespace identifier used by React DOM for xlink:* attributes. An identifier, never fetched.',
  },
  {
    url: 'http://www.w3.org/XML/1998/namespace',
    reason: 'XML namespace identifier used by React DOM for xml:* attributes. An identifier, never fetched.',
  },
  {
    url: 'https://react.dev/errors/',
    reason: 'React production error-decoder base. Concatenated into the message text of a thrown Error for developers; the page never requests it.',
  },
  {
    url: 'https://jcgt.org/published/0007/04/01/',
    reason: 'Paper citation inside a GLSL comment in a three.js shader chunk (GGX visible-normal sampling). Text inside a string, never fetched.',
  },
  {
    url: 'https://docs.pmnd.rs/react-three-fiber/api/objects#using-3rd-party-objects-declaratively',
    reason: 'Documentation link in a React Three Fiber console error message. Message text, never fetched.',
  },
  {
    url: 'https://github.com/react-spring/react-use-measure/#resize-observer-polyfills',
    reason: 'Documentation link in a react-use-measure console warning. Message text, never fetched.',
  },
  // @react-three/fiber bundles its own package.json as a data object (it reads the
  // version for the reconciler). These are that object's author, maintainer, bugs,
  // homepage, repository and funding strings: metadata, never fetched.
  { url: 'https://github.com/drcmda', reason: 'Author field of @react-three/fiber package.json bundled as data. Never fetched.' },
  { url: 'https://github.com/joshuaellis', reason: 'Maintainer field of @react-three/fiber package.json bundled as data. Never fetched.' },
  { url: 'https://github.com/codyjasonbennett', reason: 'Maintainer field of @react-three/fiber package.json bundled as data. Never fetched.' },
  { url: 'https://github.com/krispya', reason: 'Maintainer field of @react-three/fiber package.json bundled as data. Never fetched.' },
  { url: 'https://github.com/pmndrs/react-three-fiber/issues', reason: 'bugs.url of @react-three/fiber package.json bundled as data. Never fetched.' },
  { url: 'https://github.com/pmndrs/react-three-fiber#readme', reason: 'homepage of @react-three/fiber package.json bundled as data. Never fetched.' },
  { url: 'https://github.com/pmndrs/react-three-fiber.git', reason: 'repository.url of @react-three/fiber package.json bundled as data. Never fetched.' },
  { url: 'https://opencollective.com/react-three-fiber', reason: 'collective.url of @react-three/fiber package.json bundled as data. Never fetched.' },
];

// Source maps (.map) embed the full text of every bundled dependency, README links and
// all. Their URLs are reported, not enforced: a browser requests a map only when
// developer tools are open, and the page itself never reads it.

// The Credits page links every third-party asset to the page it came from. The addresses come from the
// asset catalogue itself (apps/web/src/assets/third-party.json, reduced to the page's list at build time
// by thirdPartyCredits in vite.config.ts), so the allowlist cannot drift from it: each source page is
// allowed, with the asset it belongs to as the reason, and nothing else from the catalogue is. Navigation
// only, never fetched.
const THIRD_PARTY_CATALOGUE = path.join(PACKAGE_DIR, 'src', 'assets', 'third-party.json');
if (existsSync(THIRD_PARTY_CATALOGUE)) {
  const catalogue = JSON.parse(readFileSync(THIRD_PARTY_CATALOGUE, 'utf8'));
  for (const asset of catalogue.assets ?? []) {
    URL_ALLOWLIST.push({
      url: asset.source,
      reason: `Source page of the third-party asset "${asset.id}" (${asset.title}), linked from the Credits page. Navigation only, never fetched.`,
    });
  }
}

// Canonicals remain public reading pages even while sealed rooms are omitted from the sitemap.
const ROUTE_HTML = [path.join(DIST_DIR, 'index.html'), ...readdirSync(DIST_DIR, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => path.join(DIST_DIR, entry.name, 'index.html'))];
for (const file of ROUTE_HTML.filter(existsSync)) {
  const location = readFileSync(file, 'utf8').match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1];
  if (!location) continue;
  const canonical = new URL(location);
  if (canonical.origin !== 'https://unheld.space') throw new Error('Unexpected canonical origin');
  const markdown = canonical.pathname === '/' ? '/index.md' : `${canonical.pathname}.md`;
  for (const url of [location, `${location}#webpage`, new URL(markdown, canonical).toString()]) URL_ALLOWLIST.push({ url, reason: 'Built public reading route; navigation only.' });
}

const ALLOWED_URLS = new Map(URL_ALLOWLIST.map(({ url, reason }) => [url, reason]));
for (const { url, reason } of URL_ALLOWLIST) {
  if (typeof reason !== 'string' || reason.trim() === '') throw new Error(`URL allowlist entry ${url} needs a reason`);
}

const REMOTE_URL = /(?:https?|wss?|ftp):\/\/[^\s"'`<>\\)\]}]+/gi;
/** Scheme-relative references (`//host/path`) that would be fetched, in HTML attributes and CSS. */
const SCHEME_RELATIVE = [
  /\b(?:src|href|action|poster|data|srcset)\s*=\s*["']\s*(\/\/[^\s"']+)/gi,
  /url\(\s*["']?\s*(\/\/[^\s)"']+)/gi,
  /@import\s+["'](\/\/[^"']+)/gi,
];

const violations = [];
const warnings = [];

function posix(file) {
  return path.relative(DIST_DIR, file).split(path.sep).join('/');
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    })
    .sort();
}

function formatBytes(bytes) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
  return `${(bytes / 1_000).toFixed(1)} kB`;
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

// ---------------------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------------------

function loadManifest() {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (error) {
    violations.push(`manifest: cannot read ${path.relative(REPO_ROOT, MANIFEST_PATH)}: ${error.message}`);
    return [];
  }
  if (!parsed || !Array.isArray(parsed.entries)) {
    violations.push('manifest: "entries" must be an array');
    return [];
  }
  const entries = [];
  parsed.entries.forEach((raw, index) => {
    const label = `manifest entry ${index} (${raw?.name ?? 'unnamed'})`;
    const missing = ['name', 'pattern', 'source', 'licence', 'licenceFile', 'attribution'].filter(
      (field) => typeof raw?.[field] !== 'string' || raw[field].trim() === '',
    );
    if (missing.length > 0) {
      violations.push(`${label}: missing ${missing.join(', ')}`);
      return;
    }
    let pattern;
    try {
      pattern = new RegExp(raw.pattern);
    } catch (error) {
      violations.push(`${label}: pattern is not a valid regular expression: ${error.message}`);
      return;
    }
    const entry = { ...raw, regex: pattern, used: 0 };
    verifyLicence(entry, label);
    entries.push(entry);
  });
  return entries;
}

function verifyLicence(entry, label) {
  const expectations = LICENCE_EXPECTATIONS[entry.licence];
  if (!expectations) {
    violations.push(`${label}: licence "${entry.licence}" is not in the reviewed list (${Object.keys(LICENCE_EXPECTATIONS).join(', ')})`);
    return;
  }

  // Third-party files kept in this repository name their provider (`third-party:ambientCG`): their
  // licence text lives in the repository like an in-repo asset's, but they are not the project's work.
  const isInRepo = entry.source === 'in-repo' || THIRD_PARTY_SOURCE.test(entry.source);
  const segments = entry.licenceFile.split(/[\\/]/);
  if (isInRepo && segments.includes('node_modules')) {
    violations.push(`${label}: an in-repo asset's licence file must not live in node_modules (${entry.licenceFile})`);
    return;
  }
  if (!isInRepo && !entry.licenceFile.startsWith(`node_modules/${entry.source}/`)) {
    violations.push(`${label}: licence file must be inside node_modules/${entry.source}/ (got ${entry.licenceFile})`);
    return;
  }

  const licencePath = path.resolve(PACKAGE_DIR, entry.licenceFile);
  if (!isInside(REPO_ROOT, licencePath)) {
    violations.push(`${label}: licence file ${entry.licenceFile} is outside the repository`);
    return;
  }
  if (!existsSync(licencePath) || !statSync(licencePath).isFile()) {
    violations.push(`${label}: licence file not found: ${entry.licenceFile}`);
    return;
  }
  const text = readFileSync(licencePath, 'utf8');
  for (const expected of expectations) {
    if (!expected.test(text)) {
      violations.push(`${label}: ${entry.licenceFile} does not contain text matching ${expected} (expected for ${entry.licence})`);
    }
  }

  if (!isInRepo) {
    const packageJsonPath = path.resolve(PACKAGE_DIR, 'node_modules', entry.source, 'package.json');
    if (!existsSync(packageJsonPath)) {
      violations.push(`${label}: package ${entry.source} is not installed (no package.json)`);
      return;
    }
    const declared = JSON.parse(readFileSync(packageJsonPath, 'utf8')).license;
    if (declared === undefined) {
      warnings.push(`${label}: ${entry.source} declares no "license" field in package.json`);
    } else if (declared !== entry.licence) {
      violations.push(`${label}: manifest says ${entry.licence} but ${entry.source} package.json declares ${JSON.stringify(declared)}`);
    }
  }
}

// ---------------------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------------------

function locate(text, index) {
  const before = text.slice(0, index);
  const line = before.split('\n').length;
  return { line, column: index - before.lastIndexOf('\n') };
}

function trimUrl(url) {
  return url.replace(/[.,;:!?]+$/, '');
}

/** Returns every remote reference in `text` as { url, line, column }. */
function findReferences(text, extension) {
  const found = [];
  for (const match of text.matchAll(REMOTE_URL)) {
    found.push({ url: trimUrl(match[0]), index: match.index, ...locate(text, match.index) });
  }
  if (extension === '.html' || extension === '.htm' || extension === '.css') {
    for (const pattern of SCHEME_RELATIVE) {
      for (const match of text.matchAll(pattern)) {
        const url = trimUrl(match[1]);
        const index = match.index + match[0].indexOf(url);
        found.push({ url, index, ...locate(text, index) });
      }
    }
  }
  return found;
}

function summarise(references) {
  const grouped = new Map();
  for (const reference of references) {
    const existing = grouped.get(reference.url);
    if (existing) existing.count += 1;
    else grouped.set(reference.url, { ...reference, count: 1 });
  }
  return [...grouped.values()];
}

// ---------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------

/** Every bundled npm package, and every npm source in the media manifest, has a notice section. */
function checkNotices(entries) {
  const noticesPath = path.join(DIST_DIR, NOTICES_FILE);
  if (!existsSync(noticesPath)) {
    violations.push(`${NOTICES_FILE} is missing from dist/: bundled third-party licence notices must ship with the build`);
    return;
  }
  const text = readFileSync(noticesPath, 'utf8');
  const sections = new Set([...text.matchAll(/^=== (\S+) /gm)].map((match) => match[1]));
  // A third-party file committed to this repository (`third-party:<provider>`) is not an npm package: its licence text
  // is in LICENSES/ and its credit in the manifest and the asset library's own notice, not in this file.
  const isPackage = (source) => source && source !== 'in-repo' && !THIRD_PARTY_SOURCE.test(source);
  const required = new Set([...REQUIRED_NOTICE_PACKAGES, ...entries.filter((e) => isPackage(e.source) && e.used > 0).map((e) => e.source)]);
  for (const name of required) {
    if (!sections.has(name)) violations.push(`${NOTICES_FILE} has no notice section for ${name}`);
  }
  for (const block of text.split(/^=== /m).slice(1)) {
    const name = block.split(' ')[0];
    if (!/licen[cs]e|permission is hereby granted|copyright/i.test(block.split('\n').slice(1).join('\n'))) {
      violations.push(`${NOTICES_FILE} section ${name} carries no licence text`);
    }
  }
  console.log(`\nThird-party notices\n  ${NOTICES_FILE}: ${sections.size} package section(s)`);
}

function main() {
  if (!existsSync(DIST_DIR) || !statSync(DIST_DIR).isDirectory()) {
    console.error(`audit:assets: ${DIST_DIR} does not exist. Build first (pnpm audit:assets builds before auditing).`);
    process.exitCode = 1;
    return;
  }

  const entries = loadManifest();
  const files = walk(DIST_DIR).map((file) => ({ file, rel: posix(file), size: statSync(file).size }));
  if (files.length === 0) violations.push('dist/ is empty');

  const mediaRows = [];
  const allowedSeen = new Map();
  const mapUrls = new Map();
  let mapFileCount = 0;
  let totalBytes = 0;
  let totalGzipBytes = 0;
  let codeUrlOccurrences = 0;

  for (const { file, rel, size } of files) {
    const base = path.basename(file);
    const extension = path.extname(file).toLowerCase();

    if (rel === NOTICES_FILE) {
      totalBytes += size;
      totalGzipBytes += gzipSync(readFileSync(file)).length;
      continue;
    }

    if (extension === SOURCE_MAP_EXTENSION) {
      mapFileCount += 1;
      for (const reference of findReferences(readFileSync(file, 'utf8'), extension)) {
        mapUrls.set(reference.url, (mapUrls.get(reference.url) ?? 0) + 1);
      }
      continue;
    }

    totalBytes += size;
    totalGzipBytes += gzipSync(readFileSync(file)).length;

    if (MEDIA_EXTENSIONS.has(extension)) {
      const matches = entries.filter((entry) => entry.regex.test(base));
      if (matches.length === 0) {
        violations.push(`media file ${rel} has no entry in assets.manifest.json (add its source, licence and attribution after review)`);
        mediaRows.push([rel, formatBytes(size), 'NOT IN MANIFEST', '-']);
      } else if (matches.length > 1) {
        violations.push(`media file ${rel} matches more than one manifest entry: ${matches.map((entry) => entry.name).join(', ')}`);
        mediaRows.push([rel, formatBytes(size), 'AMBIGUOUS', matches.map((entry) => entry.name).join(' / ')]);
      } else {
        const [entry] = matches;
        entry.used += 1;
        mediaRows.push([rel, formatBytes(size), entry.licence, entry.source]);
      }
      continue;
    }

    if (!CODE_EXTENSIONS.has(extension) && !CODE_FILE_NAMES.has(base)) {
      violations.push(`file ${rel} has an unclassified type "${extension || base}" (code, source map and media types are known; classify it in audit-assets.mjs after review)`);
      continue;
    }

    const text = readFileSync(file, 'utf8');
    for (const reference of summarise(findReferences(text, extension))) {
      codeUrlOccurrences += reference.count;
      if (ALLOWED_URLS.has(reference.url)) {
        allowedSeen.set(reference.url, [...(allowedSeen.get(reference.url) ?? []), `${rel} (${reference.count})`]);
      } else {
        const excerpt = text.slice(Math.max(0, reference.index - 40), reference.index + reference.url.length + 20).replace(/\s+/g, ' ');
        violations.push(`remote reference in ${rel}:${reference.line}:${reference.column}: ${reference.url} (not on the allowlist) near ${JSON.stringify(excerpt)}`);
      }
    }
  }

  for (const entry of entries) {
    if (entry.used === 0) warnings.push(`manifest entry "${entry.name}" matches no shipped file (stale, or the font is no longer imported)`);
  }
  let budgets;
  try {
    budgets = measureAssetBudgets(DIST_DIR);
    violations.push(...budgetViolations(budgets));
    warnings.push(...budgetWarnings(budgets));
  } catch (error) {
    violations.push(`download budget graph could not be measured: ${error.message}`);
  }

  report({ entries, mediaRows, allowedSeen, mapUrls, mapFileCount, totalBytes, totalGzipBytes, budgets, codeUrlOccurrences, fileCount: files.length });
}

function printTable(rows, header) {
  const all = [header, ...rows];
  const widths = header.map((_, column) => Math.max(...all.map((row) => String(row[column]).length)));
  for (const [index, row] of all.entries()) {
    console.log(`  ${row.map((cell, column) => String(cell).padEnd(widths[column])).join('  ').trimEnd()}`);
    if (index === 0) console.log(`  ${widths.map((width) => '-'.repeat(width)).join('  ')}`);
  }
}

function report({ entries, mediaRows, allowedSeen, mapUrls, mapFileCount, totalBytes, totalGzipBytes, budgets, codeUrlOccurrences, fileCount }) {
  console.log(`audit:assets  ${path.relative(REPO_ROOT, DIST_DIR)}  (${fileCount} files)`);

  console.log(`\nMedia files (${mediaRows.length})`);
  if (mediaRows.length === 0) console.log('  none');
  else printTable(mediaRows, ['FILE', 'SIZE', 'LICENCE', 'SOURCE']);

  checkNotices(entries);

  const attributions = entries.filter((entry) => entry.used > 0);
  if (attributions.length > 0) {
    console.log('\nAttributions');
    for (const entry of attributions) console.log(`  ${entry.attribution}`);
  }

  console.log('\nRemote references');
  console.log(`  code: ${codeUrlOccurrences} occurrence(s), ${allowedSeen.size} distinct URL(s) on the allowlist, ${violations.filter((v) => v.startsWith('remote reference')).length} not allowed`);
  if (VERBOSE) {
    for (const [url, where] of allowedSeen) console.log(`    allowed ${url}  [${where.join(', ')}]  ${ALLOWED_URLS.get(url)}`);
  }
  const mapHosts = new Map();
  for (const url of mapUrls.keys()) {
    const host = url.replace(/^[a-z]+:\/\//i, '').split('/')[0];
    mapHosts.set(host, (mapHosts.get(host) ?? 0) + 1);
  }
  console.log(`  source maps: ${mapUrls.size} distinct URL(s) across ${mapFileCount} map file(s), ${mapHosts.size} host(s); reported, not enforced`);
  if (VERBOSE) {
    for (const [host, count] of [...mapHosts].sort((a, b) => b[1] - a[1])) console.log(`    ${host}  ${count}`);
  }

  console.log('\nDownload budgets (source maps excluded)');
  if (budgets) {
    console.log(`  first visit landing/corridor: ${formatBytes(budgets.initialGzipBytes)} gzip across ${budgets.initialFiles.size} files; limit ${formatBytes(INITIAL_DOWNLOAD_BUDGET_BYTES)}`);
    for (const route of budgets.roomRoutes) {
      console.log(`  ${route.label} expanded lazy route: ${formatBytes(route.gzipBytes)} gzip across ${route.files.size} new files; target ${formatBytes(ROOM_ROUTE_BUDGET_BYTES)}`);
    }
    console.log(`  shared gramophone records: ${formatBytes(budgets.sharedMediaBytes)} raw across ${budgets.sharedMediaFiles.size} files; limit ${formatBytes(SHARED_MEDIA_BUDGET_BYTES)}`);
    console.log(`  whole build backstop: ${formatBytes(budgets.totalBytes)} raw; limit ${formatBytes(WHOLE_BUILD_BUDGET_BYTES)}`);
  }
  console.log(`  all shipped files: ${formatBytes(totalBytes)} raw, ${formatBytes(totalGzipBytes)} gzipped`);

  if (warnings.length > 0) {
    console.log(`\nWarnings (${warnings.length})`);
    for (const warning of warnings) console.log(`  warn: ${warning}`);
  }

  if (violations.length > 0) {
    console.log(`\nViolations (${violations.length})`);
    for (const violation of violations) console.log(`  FAIL: ${violation}`);
    console.log('\naudit:assets FAILED');
    process.exitCode = 1;
  } else {
    console.log('\naudit:assets passed');
  }
}

main();
