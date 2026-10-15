import assert from 'node:assert/strict';
import test from 'node:test';
import { browserRequired } from './browser-required.mjs';

const file = 'packages/engine/src/siteCopy.ts';
const before = "export const COPY = { title: 'Old', count: 2 } as const;";
const changed = after => browserRequired([file], version => version === 'base' ? before : after);

test('only documentation and data-string edits skip browsers', () => {
  assert.equal(browserRequired(['docs/guide.txt', 'README.md'], () => ''), false);
  assert.equal(changed(before.replace('Old', 'New')), false);
  assert.equal(changed(before + '\n// Editorial note'), false);
});

test('code, numbers, keys, mixed changes and unknown paths keep browser coverage', () => {
  for (const after of [before.replace('2', '3'), before.replace('title', 'name'), before + '\nthrow new Error();', "export const COPY = { title: `${run()}` };"]) {
    assert.equal(changed(after), true, after);
  }
  assert.equal(browserRequired(['README.md', 'apps/web/src/App.tsx'], () => ''), true);
  assert.equal(browserRequired(['apps/web/src/corridor/world/props/copy.ts'], () => ''), true);
  assert.equal(browserRequired([], () => ''), true);
  assert.equal(browserRequired([file], () => { throw new Error('missing'); }), true);
  assert.equal(changed('export const COPY = {'), true);
  assert.equal(browserRequired([file], version => version === 'base' ? "export const X = { 'old': 'A' };" : "export const X = { 'new': 'A' };"), true);
  for (const source of ["export type State = 'old';", "export const X = { id: 'old' };", "import X from 'old';"]) {
    assert.equal(browserRequired([file], version => version === 'base' ? source : source.replace('old', 'new')), true, source);
  }
});
