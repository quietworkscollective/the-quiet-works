/**
 * Reproduce only this lane's four GLBs, then inspect the optimized binary assets.
 *
 * node scripts/blender/rooms/office/architecture/run.ts [--preview] [--work <scratch>]
 * BLENDER selects a headless Blender executable; the macOS app is the default.
 * Raw exports and optional PNG previews stay in scratch. No manifest is modified.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { optimise } from '../../../props/optimise.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../../..');
const out = join(repo, 'apps/web/src/chambers/certification-office/scene/heroes');
const { values } = parseArgs({ options: { preview: { type: 'boolean' }, work: { type: 'string' } } });
const work = values.work ?? join(tmpdir(), 'office-architecture');
mkdirSync(work, { recursive: true });
mkdirSync(out, { recursive: true });

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { cwd: repo, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
}

const args = ['-b', '--factory-startup', '--python-exit-code', '1', '--python', join(here, 'build.py'), '--', '--work', work];
if (values.preview) args.push('--preview');
run(process.env['BLENDER'] ?? '/Applications/Blender.app/Contents/MacOS/Blender', args);
for (const name of ['application-board', 'employee-window', 'certificate-sign', 'archive-bay']) {
  await optimise(join(work, `${name}.raw.glb`), join(out, `${name}.glb`));
}
run(process.execPath, ['--test', join(here, 'assets.test.ts')]);
