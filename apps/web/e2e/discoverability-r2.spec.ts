import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ABOUT } from '@tqw/engine';

import { chambersForBuild, REPO_ROOT } from '../scripts/chamber-release.mjs';

const description = ABOUT.body[0]!;
test('sitemap follows production release flags', { tag: '@fast' }, async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  for (const room of chambersForBuild(REPO_ROOT, false)) {
    expect(xml.includes(`<loc>https://unheld.space/${room.slug}</loc>`), room.id).toBe(room.status === 'open');
  }
  expect(xml.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g)?.length).toBe(xml.match(/<loc>/g)?.length);
});
// Each route carries its own meta description; the approved description stays the work's own
// description: on /about, in the work's structured data, and in the agent and README surfaces.
test('the approved description describes the work on every public discovery surface', { tag: '@fast' }, async ({ request }) => {
  expect(await (await request.get('/about')).text()).toMatch(new RegExp(`name="description"[^>]*content="${description}"`));
  for (const route of ['/', '/certification-office']) {
    const html = await (await request.get(route)).text();
    const graph = JSON.parse(html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/s)![1]!)['@graph'];
    expect(graph.filter((node: Record<string, unknown>) => node.description === description), route).toHaveLength(1);
  }
  for (const route of ['/llms.txt', '/llms-full.txt', '/skill.md']) expect(await (await request.get(route)).text()).toContain(description);
  expect(readFileSync(new URL('../../../README.md', import.meta.url), 'utf8')).toContain(description);
});

test('seven crawler user agents receive reading content and previews', { tag: '@fast' }, async ({ baseURL }) => {
  const { stdout } = await promisify(execFile)(process.execPath, ['scripts/check-crawl.mjs'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, TQW_CRAWL_URL: baseURL },
  });
  expect(stdout.match(/^PASS /gm)).toHaveLength(28);
});
