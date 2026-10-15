/** Lossless download packaging. Canonical GLBs remain the reproducible modelling outputs. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const scene = join(root, 'apps/web/src/chambers/certification-office/scene');
for (const directory of ['catalogue', 'heroes']) {
  const manifestPath = join(scene, directory, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const entry of manifest) {
    const name = entry.sourceId ?? entry.id.replace('office-hero-', '');
    const bytes = gzipSync(readFileSync(join(scene, directory, `${name}.glb`)), { level: 9 });
    writeFileSync(join(scene, directory, `${name}.glb.gz`), bytes);
    entry.compressedBytes = bytes.length;
    entry.sha256 = createHash('sha256').update(bytes).digest('hex');
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${directory}: ${manifest.reduce((sum, entry) => sum + entry.compressedBytes, 0)} packed bytes`);
}
