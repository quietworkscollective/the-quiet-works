import { readFileSync, writeFileSync } from 'node:fs';
import { runnerImport } from 'vite';

const { module: { ABOUT } } = await runnerImport(new URL('../../../packages/engine/src/siteCopy.ts', import.meta.url).pathname, { configFile: false, root: new URL('..', import.meta.url).pathname });
const file = new URL('../../../README.md', import.meta.url);
const original = readFileSync(file, 'utf8');
const updated = original.replace(/(<!-- unheld-description:start -->\n)[\s\S]*?(\n<!-- unheld-description:end -->)/, `$1${ABOUT.body[0]}$2`);
if (process.argv.includes('--check')) {
  if (original !== updated || !original.includes(ABOUT.body[0])) throw new Error('README description is stale; run pnpm sync:description');
} else writeFileSync(file, updated);
