import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('WebKit can reach the production artifact when the main preview uses port 4190', () => {
  const report = JSON.parse(execFileSync(process.execPath, [
    '--experimental-strip-types', '--input-type=module', '--eval',
    "import config from './apps/web/playwright.config.ts'; console.log(JSON.stringify(config));",
  ], { encoding: 'utf8', env: { ...process.env, TQW_E2E_PORT: '4190', TQW_E2E_ARTIFACT: '0' } }));
  const project = report.projects.find(project => project.name === 'webkit-iphone');
  assert.ok(project, 'the iPhone WebKit project must remain selected');
  assert.equal(project.use.browserName, 'webkit');
  assert.equal(project.use.baseURL, 'http://127.0.0.1:5190');
  assert.deepEqual(report.webServer.map(server => server.url), [
    'http://127.0.0.1:4190', 'http://127.0.0.1:5190',
  ]);
});

test('core installs the WebKit browser and its system libraries on cache hits and misses', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/browser-software.yml', import.meta.url), 'utf8');
  const core = workflow.split('  core:\n')[1].split('\n  extended:')[0];
  // Older cache entries contain Chromium alone; they cannot satisfy the new browser project.
  assert.match(core, /key: playwright-.*-webkit\n/);
  assert.match(core, /playwright install --with-deps chromium webkit/);
  assert.match(core, /playwright install-deps chromium webkit/);
});
