import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const started = performance.now();
const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1', TQW_E2E_ANGLE: 'swiftshader', TQW_E2E_ARTIFACT: '1' };
const run = args => {
  const stage = performance.now();
  const result = spawnSync('pnpm', args, { stdio: 'inherit', env });
  console.log(`${args.join(' ')}: ${((performance.now() - stage) / 1000).toFixed(1)}s`);
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
// Build before the CI dry runs: imported download-budget specs read the production manifest.
for (const command of ['lint', 'typecheck', 'build', 'test', 'check:content', 'check:public', 'check:bakes']) run([command]);
run(['exec', 'node', '--test', '--test-concurrency=2', ...readdirSync('scripts/ci').filter(file => file.endsWith('.test.mjs')).map(file => `scripts/ci/${file}`)]);
run(['--filter', '@tqw/web', 'exec', 'node', 'scripts/audit-assets.mjs']);
// The tagged crawler case runs check-crawl.mjs against this strict production preview.
run(['--filter', '@tqw/web', 'exec', 'playwright', 'test', '--config', 'playwright.fast.config.ts']);
console.log(`ci:fast passed in ${((performance.now() - started) / 1000).toFixed(1)}s (SwiftShader, zero retries).`);
