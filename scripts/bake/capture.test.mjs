import test from 'node:test';
import assert from 'node:assert/strict';
import { BAKE_CAPTURE_TIME, prepareBakeCapture } from './capture.mjs';

test('corridor bake and freshness captures set a fixed clock before applying the world pose', async () => {
  const calls = [];
  const page = {
    clock: { setFixedTime: async (time) => calls.push(['time', time.getTime()]) },
    evaluate: async (callback) => calls.push(['render', callback.toString()]),
  };

  await prepareBakeCapture(page, 'corridor');

  assert.equal(BAKE_CAPTURE_TIME.toISOString(), '2026-10-14T12:00:00.000Z');
  assert.deepEqual(calls.map(([kind]) => kind), ['time', 'render']);
});

test('Office freshness uses the fixed clock without requiring a corridor hook', async () => {
  const calls = [];
  const page = {
    clock: { setFixedTime: async (time) => calls.push(time.getTime()) },
    evaluate: async () => calls.push('render'),
  };

  await prepareBakeCapture(page, 'office');

  assert.deepEqual(calls, [BAKE_CAPTURE_TIME.getTime()]);
});
