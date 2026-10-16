import assert from 'node:assert/strict';
import test from 'node:test';
import { attest } from './attest.mjs';

const sha = 'a'.repeat(40);
const tree = 'b'.repeat(40);
const options = { repo: 'quietworkscollective/the-quiet-works', sha };
const report = () => ({ success: true, renderer: 'metal', retries: 0, steps: [
  ...['lint', 'typecheck', 'test', 'check:content', 'check:public', 'build'].map(stage => ({ args: [stage], seconds: 1, exitCode: 0 })),
  { args: ['playwright', 'test'], seconds: 2, exitCode: 0 },
  ...['playwright.chamber-contract.config.ts', 'playwright.artifact.config.ts', 'playwright.released-authored.config.ts'].map(config => ({ args: ['playwright', 'test', '--config', config], seconds: 2, exitCode: 0 })),
] });
function fixture(overrides = {}) {
  const posted = [];
  let runs = 0;
  const dependencies = {
    git: args => args[0] === 'status' ? '' : args.includes('HEAD') ? sha : tree,
    targetTree: () => tree,
    runGate: () => { runs++; return report(); },
    postStatus: status => posted.push(status),
    ...overrides,
  };
  return { dependencies, posted, get runs() { return runs; } };
}

test('only a passing clean Metal run posts the target commit status with its tree and timings', async () => {
  const f = fixture();
  const result = await attest(options, f.dependencies);
  assert.equal(f.runs, 1);
  assert.equal(f.posted.length, 1);
  assert.equal(result.sha, sha);
  assert.equal(f.posted[0].context, 'local-gpu-suite');
  assert.equal(f.posted[0].state, 'success');
  assert.match(f.posted[0].description, new RegExp(`tree ${tree}; GPU 8.0s; total`));
  assert.ok(f.posted[0].description.length < 140);
});

test('dry run executes the full suite but never posts to GitHub', async () => {
  const f = fixture();
  await attest({ ...options, dryRun: true }, f.dependencies);
  assert.equal(f.runs, 1);
  assert.deepEqual(f.posted, []);
});

test('dirty files and a mismatching public tree refuse before running or posting', async () => {
  for (const overrides of [
    { git: args => args[0] === 'status' ? '?? untracked.txt' : tree },
    { targetTree: () => 'c'.repeat(40) },
  ]) {
    const f = fixture(overrides);
    await assert.rejects(attest(options, f.dependencies));
    assert.equal(f.runs, 0);
    assert.deepEqual(f.posted, []);
  }
});

test('failed or retried-then-failed commands can never post success', async () => {
  for (const runGate of [
    () => { throw new Error('pnpm ci:local exited 1 after a failed retry'); },
    () => ({ ...report(), success: false }),
    () => ({ ...report(), steps: [{ args: ['playwright'], seconds: 1, exitCode: 1 }] }),
    () => ({ ...report(), retries: 1 }),
    () => ({ ...report(), renderer: 'swiftshader' }),
    () => ({ ...report(), steps: report().steps.slice(1) }),
  ]) {
    const f = fixture({ runGate });
    await assert.rejects(attest(options, f.dependencies));
    assert.deepEqual(f.posted, []);
  }
});

test('edits, HEAD changes or a changed target during verification refuse to post', async () => {
  for (const changed of ['dirty', 'head', 'tree', 'target']) {
    let completed = false;
    const f = fixture({
      git: args => args[0] === 'status' ? (completed && changed === 'dirty' ? ' M edited.ts' : '')
        : args.includes('HEAD') ? (completed && changed === 'head' ? 'd'.repeat(40) : sha)
        : (completed && changed === 'tree' ? 'c'.repeat(40) : tree),
      targetTree: () => completed && changed === 'target' ? 'c'.repeat(40) : tree,
      runGate: () => { completed = true; return report(); },
    });
    await assert.rejects(attest(options, f.dependencies));
    assert.deepEqual(f.posted, []);
  }
});

test('invalid repo/commit arguments and a failed GitHub write fail closed', async () => {
  for (const input of [{ ...options, repo: '../escape' }, { ...options, sha: 'main' }]) await assert.rejects(attest(input, fixture().dependencies));
  const f = fixture({ postStatus: () => { throw new Error('GitHub refused the status'); } });
  await assert.rejects(attest(options, f.dependencies), /GitHub refused/);
});
