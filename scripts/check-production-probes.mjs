import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps/web/dist');
const identifiers = ['stageProbe', '__tqw', '__outlineStageProbe', '__bake', 'get("quality")', 'get("bake")', 'get("holes")'];
const extensions = new Set(['.js', '.mjs', '.html', '.css', '.json', '.map']);

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(absolute));
    else if (entry.isFile() && extensions.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

const files = await filesUnder(dist);
if (files.length === 0) throw new Error(`No production bundle files found in ${dist}`);

const hits = [];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  for (const identifier of identifiers) {
    if (source.includes(identifier)) hits.push(`${path.relative(root, file)}: ${identifier}`);
  }
  // Three uses this one public marker for its optional devtools hook; other window.__* globals
  // belong to this app's screenshot, bake, or measurement tooling and must stay out of production.
  const globals = new Set(source.match(/\bwindow\.__(?!(?:THREE__))[$A-Za-z_][$\w]*/g) ?? []);
  for (const identifier of globals) hits.push(`${path.relative(root, file)}: ${identifier}`);
}

if (hits.length) throw new Error(`Production bundle contains development probe identifiers:\n${hits.join('\n')}`);
console.log(`Production probe scan: zero identifiers across ${files.length} bundle files.`);
