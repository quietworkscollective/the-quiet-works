import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const execute = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.slice(0, 3).join(' ')} failed (${result.status})`);
  return result.stdout?.trim() ?? '';
};
const git = args => execute('git', args);
const assertClean = readGit => assert.equal(readGit(['status', '--porcelain', '--untracked-files=all']), '', 'GPU attestation requires a clean tree, including untracked files');

export async function attest({ repo, sha, dryRun = false }, dependencies = {}) {
  assert.match(repo, /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/, 'Expected owner/repository');
  assert.match(sha, /^[a-f0-9]{40}$/, 'Expected a full commit SHA');
  const readGit = dependencies.git ?? git;
  assertClean(readGit);
  const head = readGit(['rev-parse', 'HEAD']);
  const tree = readGit(['rev-parse', 'HEAD^{tree}']);
  const targetTree = dependencies.targetTree ?? (target => dryRun
    ? readGit(['rev-parse', '--verify', `${target}^{tree}`])
    : execute('gh', ['api', `repos/${repo}/git/commits/${target}`, '--jq', '.tree.sha']));
  assert.equal(await targetTree(sha), tree, 'Target commit tree differs from the local tree');
  const directory = mkdtempSync(path.join(tmpdir(), 'unheld-gpu-'));
  const reportPath = path.join(directory, 'report.json');
  const started = performance.now();
  try {
    const runGate = dependencies.runGate ?? (file => {
      execute('pnpm', ['ci:local'], { stdio: 'inherit', env: { ...process.env, CI: '1', PYTHONDONTWRITEBYTECODE: '1', TQW_CI_ATTEST: '1', TQW_CI_REPORT_PATH: file } });
      return JSON.parse(readFileSync(file, 'utf8'));
    });
    const report = await runGate(reportPath);
    assert.equal(report.success, true, 'The GPU suite did not succeed');
    assert.equal(report.renderer, 'metal', 'Attestation requires the Metal GPU gate');
    assert.ok(report.steps?.length > 0 && report.steps.every(step => step.exitCode === 0), 'A GPU gate stage failed');
    assert.equal(report.retries, 0, 'GPU attestation must run without retries');
    for (const stage of ['lint', 'typecheck', 'test', 'check:content', 'check:public', 'build', 'playwright.chamber-contract.config.ts', 'playwright.artifact.config.ts', 'playwright.released-authored.config.ts']) {
      assert.ok(report.steps.some(step => step.args.includes(stage)), `Missing GPU gate stage: ${stage}`);
    }
    assert.ok(report.steps.some(step => step.args.includes('playwright') && !step.args.includes('--config')), 'Missing production GPU browser stage');
    assertClean(readGit);
    assert.equal(readGit(['rev-parse', 'HEAD']), head, 'HEAD changed during GPU verification');
    assert.equal(readGit(['rev-parse', 'HEAD^{tree}']), tree, 'Tree changed during GPU verification');
    assert.equal(await targetTree(sha), tree, 'Target tree changed during GPU verification');
    const elapsed = ((performance.now() - started) / 1000).toFixed(1);
    const gpuSeconds = report.steps.filter(step => step.args.includes('playwright')).reduce((sum, step) => sum + step.seconds, 0).toFixed(1);
    const status = { state: 'success', context: 'local-gpu-suite', description: `tree ${tree}; GPU ${gpuSeconds}s; total ${elapsed}s` };
    if (!dryRun) {
      const post = dependencies.postStatus ?? (body => execute('gh', ['api', '--method', 'POST', `repos/${repo}/statuses/${sha}`, '--input', '-'], { input: JSON.stringify(body) }));
      await post(status);
    }
    return { repo, sha, tree, dryRun, status, report };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2).filter(arg => arg !== '--');
    const dryRun = args.includes('--dry-run');
    const positional = args.filter(arg => arg !== '--dry-run');
    assert.ok(positional.length <= 2 && positional.every(arg => !arg.startsWith('-')), 'Usage: pnpm ci:attest [owner/repository] [commit-sha] [--dry-run]');
    const result = await attest({ repo: positional[0] ?? 'quietworkscollective/the-quiet-works', sha: positional[1] ?? git(['rev-parse', 'HEAD']), dryRun });
    console.log(JSON.stringify(result, null, 2));
    console.log(dryRun ? 'Dry run: GPU suite passed; no GitHub status posted.' : 'Posted local-gpu-suite success.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
