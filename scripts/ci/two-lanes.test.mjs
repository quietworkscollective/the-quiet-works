import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = file => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
test('only deterministic coverage can satisfy the required checks status', () => {
  const workflow = read('.github/workflows/ci.yml');
  const checks = workflow.slice(workflow.indexOf('  checks:\n'));
  assert.match(checks, /needs: \[deterministic\]/);
  assert.doesNotMatch(checks, /needs\.(?:core|smoke|build|extended)/);
  assert.match(workflow, /run: pnpm ci:fast/);
  const fast = read('apps/web/playwright.fast.config.ts');
  assert.match(fast, /grep: \/@fast\//);
  assert.match(fast, /retries: 0/);
  assert.match(fast, /swiftshader/);
  assert.match(fast, /screenshots: false/);
  assert.doesNotMatch(fast, /use-angle=metal/);
});

test('all software-GL suites remain visible on pull requests and nightly, outside required checks', () => {
  const workflow = read('.github/workflows/browser-software.yml');
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /cron:/);
  for (const selection of ['--grep-invert @extended', '--grep @extended', 'playwright.artifact.config.ts', 'playwright.chamber-contract.config.ts', 'playwright.released-authored.config.ts', 'playwright.extended-authored.config.ts']) {
    assert.ok(workflow.includes(selection), `software diagnostics retain ${selection}`);
  }
  assert.match(workflow, /TQW_E2E_ANGLE: swiftshader/);
  assert.match(workflow, /continue-on-error: true/);
});

test('the deterministic command retains every source gate and the crawler check', () => {
  const runner = read('scripts/ci/fast.mjs');
  for (const command of ['lint', 'typecheck', 'build', 'test', 'check:content', 'check:public', 'check:bakes']) assert.ok(runner.includes(`'${command}'`), command);
  assert.ok(runner.includes('scripts/ci/'));
  assert.ok(runner.includes('audit-assets.mjs'));
  assert.ok(runner.includes('playwright.fast.config.ts'));
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.ok(scripts.test.includes('pnpm -r test --maxWorkers=2'));
  assert.ok(scripts.test.includes('--test-concurrency=2'));
  assert.ok(runner.includes('--test-concurrency=2'));
  assert.match(read('apps/web/e2e/discoverability-r2.spec.ts'), /seven crawler user agents receive reading content and previews', \{ tag: '@fast' \}/);
});
