import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/browser-software.yml', import.meta.url), 'utf8');
function listing(job) {
  const section = workflow.split(`  ${job}:\n`)[1].split(/\n  \w[^\n]*:\n/)[0];
  const commands = [...section.matchAll(/run: (pnpm --filter @tqw\/web exec playwright test[^\n]+)/g)].map(match => match[1]);
  assert.ok(commands.length, `${job} must run browser tests`);
  return commands.map(command => {
    const dryRun = command.replace(/ --shard=[^ ]+| --max-failures=\d+| --reporter=[^ ]+/g, '') + ' --list --reporter=list';
    const result = spawnSync('bash', ['-ec', dryRun], { encoding: 'utf8', env: { ...process.env, PROJECT: 'desktop', TQW_E2E_ARTIFACT: '1' } });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  }).join('\n');
}

test('open Office budgets remain covered in software GL and the local GPU gate', () => {
  assert.match(listing('core') + listing('full-tier'), /office-budget\.spec\.ts/);
});
test('room suites follow release flags and authored extended paths remain visible', () => {
  const required = listing('core');
  const extended = listing('extended');
  const registry = readFileSync(new URL('../../apps/web/src/chambers/registry.ts', import.meta.url), 'utf8');
  for (const room of ['exchange', 'apartment']) {
    const released = new RegExp(`['"]?${room}['"]?: \u007b[^\u007d]+releaseOpen: true`).test(registry);
    const suite = new RegExp(`${room}\\.spec\\.ts`);
    assert.match(released ? required : extended, suite);
    assert.doesNotMatch(released ? extended : required, suite);
  }
  assert.match(extended, /full-tier\.spec\.ts.*opens .* through its corridor door/);
});
