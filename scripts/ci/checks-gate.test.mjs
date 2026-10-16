import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const gate = workflow.slice(workflow.indexOf('  checks:')).split('        run: |\n')[1]
  .split('\n').map(line => line.replace(/^          /, '')).join('\n');
const run = overrides => spawnSync('bash', ['-ec', '-o', 'pipefail', gate], {
  env: { ...process.env, DETERMINISTIC_RESULT: 'success', ...overrides },
}).status;

test('required checks accepts deterministic success independently of software-GL outcomes', () => {
  for (const result of ['success', 'failure', 'cancelled', 'skipped', '']) assert.equal(run({ CORE_RESULT: result, SMOKE_RESULT: result }), 0);
});

test('failed, cancelled, skipped or missing deterministic coverage cannot produce required success', () => {
  for (const result of ['failure', 'cancelled', 'skipped', '']) assert.notEqual(run({ DETERMINISTIC_RESULT: result }), 0, result);
});
