import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const config = 'playwright.chamber-contract.config.ts';
const contract = 'the corridor return appears only on the current open room across every chamber route';
const projects = ['desktop', 'mobile', 'webkit-iphone'];
const list = args => {
  const result = spawnSync('pnpm', ['--filter', '@tqw/web', 'exec', 'playwright', 'test', ...args, '--list', '--reporter=list'], {
    encoding: 'utf8', env: { ...process.env, TQW_E2E_ARTIFACT: '1' },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.split('\n');
};

test('every authored chamber contract runs in software GL and gates locally without removing production coverage', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/browser-software.yml', import.meta.url), 'utf8');
  const core = workflow.split('  core:\n')[1].split('\n  extended:')[0];
  assert.ok(core.includes(`--config ${config}`), 'authored chamber contracts must run in software GL');
  const local = readFileSync(new URL('./local.mjs', import.meta.url), 'utf8');
  assert.ok(local.includes(config), 'ci:local must run the authored chamber contracts');
  const titles = [...readFileSync(new URL('../../apps/web/e2e/luna-exit.spec.ts', import.meta.url), 'utf8').matchAll(/^test\('(.+?)',/gm)].map(match => match[1]);
  assert.ok(titles.includes(contract));
  const authored = list(['--config', config]);
  const production = list(['--grep-invert', '@extended']);
  for (const project of projects) {
    const selected = lines => lines.filter(line => line.includes(`[${project}]`));
    assert.ok(!selected(authored).some(line => line.includes('production-chamber-return.spec.ts')), `${project}: production release checks must never use the authored fixture`);
    assert.equal(selected(authored).filter(line => line.includes('luna-exit.spec.ts')).length, titles.length, `${project}: every authored case exactly once`);
    for (const title of titles) {
      assert.ok(selected(authored).some(line => line.includes('luna-exit.spec.ts') && line.endsWith(title)), `${project}: authored ${title}`);
      if (title !== contract) assert.ok(selected(production).some(line => line.includes('luna-exit.spec.ts') && line.endsWith(title)), `${project}: production ${title}`);
    }
    assert.ok(!selected(production).some(line => line.endsWith(contract)), 'the raw authored route contract must use its authored fixture');
    assert.equal(selected(production).filter(line => line.includes('production-chamber-return.spec.ts')).length, 6, `${project}: production coverage for every route`);
  }
});
