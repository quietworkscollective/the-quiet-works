import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const clean = value => String(value ?? '').replace(/\x1b\[[0-9;]*m/g, '').replace(/\r?\n/g, ' ').replace(/[\\`*_{}[\]<>()#+.!|]/g, '\\$&');

export function extendedSummary(report) {
  const failures = [];
  function visit(suites, parents = []) {
    for (const suite of suites ?? []) {
      const titles = [...parents, suite.title].filter(Boolean);
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          if (!['unexpected', 'flaky'].includes(test.status) && !(test.results ?? []).some(result => ['failed', 'timedOut', 'interrupted'].includes(result.status))) continue;
          const errors = (test.results ?? []).flatMap(result => result.errors ?? []).map(error => clean(error.message));
          failures.push(`- ${clean(test.projectName)} — ${clean(spec.file ?? suite.file)}:${spec.line ?? suite.line ?? '?'} — ${clean([...titles, spec.title].join(' › '))}${errors.length ? `: ${errors.join('; ')}` : ''}`);
        }
      }
      visit(suite.suites, titles);
    }
  }
  visit(report.suites);
  const stats = report.stats ?? {};
  const setup = (report.errors ?? []).map(error => `- ${clean(error.message)}`);
  return ['## Software GL browser diagnostics', '', 'This informational job runs on pull requests and nightly. Required checks depend only on deterministic coverage; local-gpu-suite attests the clean tree on Metal.', '', `Passed: ${stats.expected ?? 0}; failed: ${stats.unexpected ?? 0}; flaky: ${stats.flaky ?? 0}; skipped: ${stats.skipped ?? 0}.`, '', ...failures, ...setup, ...(!failures.length && !setup.length ? ['No failing tests were reported.'] : []), ''].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(extendedSummary(JSON.parse(await readFile(process.argv[2], 'utf8'))));
  } catch (error) {
    process.stdout.write(`## Software GL browser diagnostics\n\nNo readable test report was produced. Check the job's install/build/test steps.\n\n${clean(error.message)}\n`);
  }
}
