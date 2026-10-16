import { spawnSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { readdirSync, writeFileSync } from 'node:fs';

if (process.platform !== 'darwin') throw new Error('ci:local requires macOS for the Metal renderer');
const started = performance.now();
const workers = process.env.TQW_LOCAL_WORKERS ?? String(Math.min(4, availableParallelism()));
const steps = [];
const record = success => {
  if (process.env.TQW_CI_REPORT_PATH) writeFileSync(process.env.TQW_CI_REPORT_PATH, JSON.stringify({ success, renderer: 'metal', retries: process.env.TQW_CI_ATTEST === '1' ? 0 : (process.env.CI ? 1 : 0), steps }, null, 2));
};
const run = (args, env = {}) => {
  const stage = performance.now();
  if (process.env.TQW_CI_ATTEST === '1' && args.includes('playwright')) args = [...args, '--retries=0'];
  const result = spawnSync('pnpm', args, { stdio: 'inherit', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', ...env } });
  console.log(`${args.join(' ')}: ${((performance.now() - stage) / 1000).toFixed(1)}s`);
  steps.push({ args, seconds: (performance.now() - stage) / 1000, exitCode: result.status ?? 1 });
  if (result.error || result.status !== 0) {
    record(false);
    if (result.error) throw result.error;
    process.exit(result.status ?? 1);
  }
};
for (const command of ['lint', 'typecheck', 'test', 'check:content', 'check:public', 'build']) run([command]);
run(['exec', 'node', '--test', '--test-concurrency=2', ...readdirSync('scripts/ci').filter(file => file.endsWith('.test.mjs')).map(file => `scripts/ci/${file}`)]);
run(['--filter', '@tqw/web', 'exec', 'node', 'scripts/audit-assets.mjs']);
run(['build:e2e-fixture']);
const env = { TQW_E2E_ANGLE: 'metal', TQW_E2E_ARTIFACT: '1', TQW_E2E_PORT: process.env.TQW_E2E_PORT ?? '5397' };
run(['--filter', '@tqw/web', 'exec', 'playwright', 'test', '--grep-invert', '@extended', `--workers=${workers}`], env);
run(['--filter', '@tqw/web', 'exec', 'playwright', 'test', '--config', 'playwright.chamber-contract.config.ts', `--workers=${workers}`], env);
run(['--filter', '@tqw/web', 'exec', 'playwright', 'test', '--config', 'playwright.artifact.config.ts', `--workers=${workers}`], env);
run(['--filter', '@tqw/web', 'exec', 'playwright', 'test', '--config', 'playwright.released-authored.config.ts', '--grep-invert', '@extended', '--pass-with-no-tests', `--workers=${workers}`], env);
console.log(`ci:local passed in ${((performance.now() - started) / 1000).toFixed(1)}s (${workers} Metal workers).`);

record(true);
