import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { extendedSummary } from './e2e-summary.mjs';

test('lists failed, timed-out and interrupted project cases across nested suites', () => {
  const cases = ['failed', 'timedOut', 'interrupted'].map((status, line) => ({
    title: `case ${status}`, file: 'e2e/corridor.spec.ts', line: line + 1,
    tests: [{ projectName: 'mobile', status: 'unexpected', results: [{ status, errors: [{ message: `reason ${status}` }] }] }],
  }));
  const text = extendedSummary({ stats: { unexpected: 3 }, suites: [{ title: 'file', suites: [{ title: 'camera', specs: cases }] }] });
  for (const status of ['failed', 'timedOut', 'interrupted']) {
    assert.ok(text.includes(`case ${status}`));
    assert.ok(text.includes(`reason ${status}`));
  }
  assert.match(text, /failed: 3/);
});

test('includes setup errors and escapes test-authored markup without treating it as code', () => {
  const text = extendedSummary({ errors: [{ message: '\u001b[31m<script>bad</script>\u001b[0m' }] });
  assert.ok(text.includes('\\<script\\>bad\\</script\\>'));
  assert.ok(!text.includes('\u001b'));
  assert.ok(!text.includes('No failing tests'));
});

test('a missing report explains missing evidence without claiming a passing extended job', () => {
  const result = spawnSync(process.execPath, ['scripts/ci/e2e-summary.mjs', 'missing-extended-report.json'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /No readable test report was produced/);
  assert.ok(!result.stdout.includes('No failing tests'));
});
