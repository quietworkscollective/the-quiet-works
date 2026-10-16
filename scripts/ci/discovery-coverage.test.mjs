import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

test('required fast coverage selects readable pages, crawler checks and the no-JavaScript project', () => {
  const report = JSON.parse(execFileSync('pnpm', [
    '--filter', '@tqw/web', 'exec', 'playwright', 'test',
    '--config', 'playwright.fast.config.ts', '--list', '--reporter=json',
  ], { encoding: 'utf8', env: { ...process.env, TQW_E2E_ARTIFACT: '0' }, maxBuffer: 4_000_000 }));
  const cases = [];
  const visit = suite => {
    for (const spec of suite.specs ?? []) {
      for (const entry of spec.tests) cases.push({ file: spec.file, title: spec.title, project: entry.projectName });
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites) visit(suite);
  for (const project of ['desktop', 'mobile']) {
    for (const file of ['discoverability.spec.ts', 'discoverability-r2.spec.ts', 'readable-text-startup.spec.ts']) {
      assert.ok(cases.some(entry => entry.project === project && entry.file.endsWith(file)), `${project}: ${file} missing from fast coverage`);
    }
    assert.ok(cases.some(entry => entry.project === project && entry.title === 'seven crawler user agents receive reading content and previews'));
  }
  const reading = cases.filter(entry => entry.project === 'reading-no-js' && entry.title.startsWith('without JavaScript:'));
  assert.equal(reading.length, 12, 'all twelve public routes must run without JavaScript in required coverage');
  assert.equal(cases.filter(entry => entry.project === 'desktop' && entry.title.startsWith('crawler HTML:')).length, 12, 'every built route needs its HTTP guard');
  const software = JSON.parse(execFileSync('pnpm', ['--filter', '@tqw/web', 'exec', 'playwright', 'test', '--grep-invert', '@extended', '--list', '--reporter=json'], {
    encoding: 'utf8', env: { ...process.env, TQW_E2E_ARTIFACT: '0' }, maxBuffer: 4_000_000,
  }));
  const previous = cases.length;
  for (const suite of software.suites) visit(suite);
  for (const project of ['desktop', 'mobile']) {
    assert.ok(cases.slice(previous).some(entry => entry.project === project && entry.file.endsWith('readable.spec.ts') && entry.title.startsWith('JavaScript takeover')), `${project}: rendering-dependent CLS/takeover coverage must remain in software GL and the local GPU gate`);
  }
});

test('authored GPU coverage retains full-tier and Office budgets without production reading tests', () => {
  const report = JSON.parse(execFileSync('pnpm', [
    '--filter', '@tqw/web', 'exec', 'playwright', 'test',
    '--config', 'playwright.artifact.config.ts', '--list', '--reporter=json',
  ], { encoding: 'utf8', env: { ...process.env, TQW_E2E_ARTIFACT: '0' }, maxBuffer: 4_000_000 }));
  assert.deepEqual(report.config.projects.map(project => project.name), ['desktop', 'mobile']);
  assert.ok(report.suites.length > 0);
  assert.deepEqual(new Set(report.suites.map(suite => suite.file.split('/').at(-1))), new Set(['full-tier.spec.ts', 'office-budget.spec.ts']));
});
