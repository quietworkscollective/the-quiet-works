/**
 * From repository root:
 * node scripts/blender/rooms/office/mechanics/run.ts --work <private-output-directory> --preview
 * node --test scripts/blender/rooms/office/mechanics/verify.test.mjs
 *
 * Requires the locked pnpm dependencies and headless Blender. Raw GLBs, textures, .blend files
 * and previews stay in --work; only the three optimised GLBs are written into this worktree.
 */
import { execFileSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimise } from '../../../props/optimise.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../../..');
const args = process.argv.slice(2);
const workArg = args.indexOf('--work');
if (workArg < 0 || !args[workArg + 1]) throw new Error('Supply --work <private-output-directory>');
const work = resolve(args[workArg + 1]);
mkdirSync(work, { recursive: true });
const log = openSync(join(work, 'blender.log'), 'w');
try {
  console.log('Building machine, press and desk in headless Blender.');
  execFileSync(process.env.BLENDER_BIN || '/Applications/Blender.app/Contents/MacOS/Blender',
    ['-b', '--factory-startup', '--python-exit-code', '1', '--python', join(here, 'build.py'), '--', '--work', work],
    { cwd: repo, stdio: ['ignore', log, log] });
} finally {
  closeSync(log);
}
const output = join(repo, 'apps/web/src/chambers/certification-office/scene/heroes');
mkdirSync(output, { recursive: true });
for (const name of ['machine', 'press', 'desk']) {
  await optimise(join(work, name + '.raw.glb'), join(output, name + '.glb'));
  // Keep the GLB metadata technical: no exporter attribution or copyright strings.
  const path = join(output, name + '.glb');
  const glb = readFileSync(path);
  const jsonSize = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonSize).toString());
  json.asset = { version: '2.0' };
  const serialized = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(serialized.length / 4) * 4, 0x20);
  serialized.copy(padded);
  const header = Buffer.from(glb.subarray(0, 20));
  header.writeUInt32LE(20 + padded.length + glb.length - 20 - jsonSize, 8);
  header.writeUInt32LE(padded.length, 12);
  writeFileSync(path, Buffer.concat([header, padded, glb.subarray(20 + jsonSize)]));
  console.log('Optimised ' + name + '.glb');
}
execFileSync(process.execPath, ['--test', join(here, 'verify.test.mjs')], { cwd: repo, stdio: 'inherit' });
if (args.includes('--preview')) {
  const reviewLog = openSync(join(work, 'review.log'), 'w');
  try {
    execFileSync(process.env.BLENDER_BIN || '/Applications/Blender.app/Contents/MacOS/Blender',
      ['-b', '--factory-startup', '--python-exit-code', '1', '--python', join(here, 'build.py'), '--', '--work', work, '--review'],
      { cwd: repo, stdio: ['ignore', reviewLog, reviewLog] });
  } finally {
    closeSync(reviewLog);
  }
}
