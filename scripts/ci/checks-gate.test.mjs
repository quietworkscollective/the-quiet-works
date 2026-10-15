import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Execute the workflow's actual shell, so its skip/cancellation rules cannot drift from this guard.
const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const gate = workflow.slice(workflow.indexOf('  checks:')).split('        run: |\n')[1]
  .split('\n').map(line => line.replace(/^          /, '')).join('\n');
const run = overrides => spawnSync('bash', ['-ec', '-o', 'pipefail', gate], {
  env: { ...process.env, UNIT_RESULT: 'success', BUILD_RESULT: 'success', BROWSER_REQUIRED: 'true', SMOKE_RESULT: 'success', CORE_RESULT: 'success', ...overrides },
}).status;

test('required checks accepts green coverage and explicitly skipped documentation browsers', () => {
  assert.equal(run({}), 0);
  assert.equal(run({ BROWSER_REQUIRED: 'false', SMOKE_RESULT: 'skipped', CORE_RESULT: 'skipped' }), 0);
});

test('failures, cancellations and unexplained skips cannot produce required success', () => {
  for (const field of ['UNIT_RESULT', 'BUILD_RESULT', 'SMOKE_RESULT', 'CORE_RESULT']) {
    for (const result of ['failure', 'cancelled', 'skipped', '']) assert.notEqual(run({ [field]: result }), 0, `${field}=${result}`);
  }
  for (const field of ['SMOKE_RESULT', 'CORE_RESULT']) {
    for (const result of ['failure', 'cancelled', '']) assert.notEqual(run({ BROWSER_REQUIRED: 'false', [field]: result }), 0);
  }
  assert.notEqual(run({ BROWSER_REQUIRED: '', SMOKE_RESULT: 'skipped', CORE_RESULT: 'skipped' }), 0);
});
