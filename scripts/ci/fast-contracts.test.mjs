import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const ts = require('typescript');
const forbidden = /data-(?:frames|pose|pitch|world|ready)|requestAnimationFrame|waitForTimeout|\.tqw-(?:corridor-)?canvas|locator\([^;\n]*canvas[^;\n]*\.(?:waitFor|toBeVisible|toBeAttached|toHaveAttribute|getAttribute|evaluate|screenshot)\(|querySelector[^;\n]*canvas/;
function inspect(node, functions, seen = new Set()) {
  assert.doesNotMatch(node.getText(), forbidden, '@fast must not wait on rendering, camera state or frame timing');
  const walk = current => {
    if (ts.isCallExpression(current) && ts.isIdentifier(current.expression)) {
      const name = current.expression.text;
      assert.ok(!['roomReady', 'worldReady', 'frames', 'settledPose', 'pose', 'expectPoseSoon', 'waitForWorld', 'officePrepared'].includes(name), `@fast calls rendering helper ${name}`);
      if (!seen.has(name) && functions.has(name)) {
        seen.add(name);
        inspect(functions.get(name), functions, seen);
      }
    }
    ts.forEachChild(current, walk);
  };
  walk(node);
}
const parse = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

test('the actual fast selection and its helpers never wait for GL, poses, bake readiness or frames', () => {
  const report = JSON.parse(execFileSync('pnpm', ['--filter', '@tqw/web', 'exec', 'playwright', 'test', '--config', 'playwright.fast.config.ts', '--list', '--reporter=json'], { encoding: 'utf8', maxBuffer: 8_000_000 }));
  assert.ok(report.suites.length);
  const files = new Map();
  const functions = new Map();
  const load = file => {
    if (files.has(file)) return files.get(file);
    const source = parse(file, readFileSync(new URL(`../../apps/web/${file}`, import.meta.url), 'utf8'));
    const walk = node => {
      if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) functions.set(node.name.text, node.initializer);
      ts.forEachChild(node, walk);
    };
    walk(source);
    files.set(file, source);
    return source;
  };
  load('e2e/helpers.ts');
  const visit = suite => {
    for (const spec of suite.specs ?? []) {
      assert.ok(spec.tags?.some(tag => tag === 'fast' || tag === '@fast'), `Untagged case selected: ${spec.title}`);
      const source = load(`e2e/${spec.file}`);
      let found = false;
      const walk = node => {
        if (ts.isCallExpression(node) && node.expression.getText() === 'test' && source.getLineAndCharacterOfPosition(node.getStart()).line + 1 === spec.line) {
          found = true;
          inspect(node.arguments.at(-1), functions);
        }
        if (ts.isCallExpression(node) && /^test\.before(?:Each|All)$/.test(node.expression.getText())) inspect(node.arguments.at(-1), functions);
        ts.forEachChild(node, walk);
      };
      walk(source);
      assert.ok(found, `Cannot inspect fast case ${spec.file}:${spec.line}`);
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites) visit(suite);
});

test('the property guard catches a frame wait hidden in a helper', () => {
  const source = parse('sample.ts', 'async function ready(){ await page.locator("canvas").getAttribute("data-ready"); } async function check(){ await ready(); }');
  assert.throws(() => inspect(source.statements[1], new Map([['ready', source.statements[0]]])), /@fast/);
});
