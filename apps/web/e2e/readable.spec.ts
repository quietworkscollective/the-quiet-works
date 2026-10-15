import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const routes = [
  ['/', 'UNHELD'], ['/about', 'About UNHELD'], ['/credits', 'Credits'],
  ['/privacy', 'Privacy'], ['/licences', 'Licences'], ['/agents', 'Agents'],
  ['/certification-office', 'The Certification Office'], ['/apartment', 'The Apartment'],
  ['/tomorrow-engine', 'The Tomorrow Engine'], ['/great-atrium', 'The Great Atrium'],
  ['/the-exchange', 'The Exchange'], ['/outline-room', 'The Outline Room'],
] as const;
const introduction = 'UNHELD is an interactive artwork about the expectations men carry without saying so, and the inner lives that go on underneath them.';
const privacy = 'UNHELD has no accounts, no cookies, no analytics and no advertising. Until you find something, it stores nothing in your browser.';
const rooms = ['The Certification Office', 'The Apartment', 'The Tomorrow Engine', 'The Great Atrium', 'The Exchange', 'The Outline Room'];
const links = ['/', '/about', '/credits', '/privacy', '/licences', '/agents', '/llms.txt', '/sitemap.xml'];
const evidence = process.env.TQW_READABLE_EVIDENCE;

for (const [route, heading] of routes) {
  test(`without JavaScript: ${route}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'reading-no-js');
    await page.goto(route);
    const reading = page.locator('#static-content');
    await expect(reading.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
    await expect(reading.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(reading.getByText(introduction, { exact: true }).first()).toBeVisible();
    await expect(reading.getByText('A space for everything we carry.', { exact: true })).toBeVisible();
    await expect(reading.getByText(privacy, { exact: true }).first()).toBeVisible();
    const doors = reading.getByRole('navigation', { name: 'Doors', exact: true });
    for (const room of rooms) await expect(doors.getByText(new RegExp(`${room}, (open the door|not yet open)$`))).toBeVisible();
    await expect(doors.getByText('The Certification Office, open the door', { exact: true })).toBeVisible();
    for (const room of rooms.slice(1)) await expect(doors.getByText(`${room}, not yet open`, { exact: true })).toBeVisible();
    for (const href of links) await expect(reading.locator(`a[href="${href}"]`).first()).toBeVisible();
    if (evidence && ['/', '/certification-office', '/credits'].includes(route)) {
      await mkdir(evidence, { recursive: true });
      await page.screenshot({ path: path.join(evidence, `no-js-${route.slice(1) || 'home'}.png`), fullPage: route !== '/credits' });
    }
  });

  test(`crawler HTML: ${route}`, async ({ request }, info) => {
    test.skip(info.project.name !== 'desktop');
    const response = await request.get(route);
    expect(response.ok()).toBe(true);
    const html = await response.text();
    const reading = html.match(/<main id="static-content"[^>]*>(.*?)<\/main>/s)?.[1] ?? '';
    expect.soft(reading).toContain(`<h1>${heading}</h1>`);
    for (const copy of [introduction, 'A space for everything we carry.', privacy, ...rooms]) expect.soft(reading).toContain(copy);
    for (const href of links) expect.soft(reading).toContain(`href="${href}"`);
    expect.soft(reading.match(/not yet open/g)).toHaveLength(5);
    const canonical = `https://unheld.space${route}`;
    expect.soft(html).toContain(`href="${canonical}"`);
    for (const tag of ['title', 'description', 'url', 'type', 'site_name', 'image']) expect.soft(html).toContain(`property="og:${tag}"`);
    expect.soft(html).toContain('https://unheld.space/share-unheld-1200x630.png');
    expect.soft(html).toContain('property="og:image:width" content="1200"');
    expect.soft(html).toContain('property="og:image:height" content="630"');
    expect.soft(html).toContain('name="twitter:card" content="summary_large_image"');
    expect.soft(html).toContain('rel="alternate" type="text/plain" href="/llms.txt"');
    expect.soft(html.match(/type="application\/ld\+json"/g)).toHaveLength(1);
    const graph = JSON.parse(html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/s)?.[1] ?? '{}')['@graph'];
    expect.soft(graph).toEqual(expect.arrayContaining([
      expect.objectContaining({ '@type': 'WebSite' }), expect.objectContaining({ '@type': 'VisualArtwork' }),
      expect.objectContaining({ '@type': 'Person', name: 'Siri (Asiri) Dalugoda' }),
    ]));
    if (!['/', '/certification-office'].includes(route)) {
      expect.soft(reading).not.toContain('A brass arm follows the outside edge');
      expect.soft(reading).not.toContain('The room is ready as a set of places and actions.');
    }
  });
}

test('sitemap dates, route titles and share image dimensions', async ({ request, page }, info) => {
  test.skip(info.project.name !== 'desktop');
  const sitemap = await (await request.get('/sitemap.xml')).text();
  const entries = [...sitemap.matchAll(/<url>(.*?)<\/url>/gs)].map(match => match[1]!);
  expect(entries.length).toBeGreaterThanOrEqual(7);
  for (const entry of entries) expect(entry).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const [route] of routes) {
    const html = await (await request.get(route)).text();
    titles.add(html.match(/<title[^>]*>(.*?)<\/title>/s)?.[1] ?? '');
    descriptions.add(html.match(/name="description"[^>]*content="([^"]+)"/)?.[1] ?? '');
  }
  expect(titles.size).toBe(routes.length);
  expect([...descriptions]).toEqual([introduction]);
  await page.goto('/share-unheld-1200x630.png');
  expect(await page.locator('img').evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([1200, 630]);
});

test('JavaScript takeover has no reading-page flash, CLS stays below 0.05, and CSP is quiet', async ({ page }, info) => {
  test.skip(info.project.name === 'reading-no-js');
  const violations: string[] = [];
  page.on('console', message => { if (/Content Security Policy|connect-src|script-src|style-src/i.test(message.text())) violations.push(message.text()); });
  await page.addInitScript(() => {
    const state = { cls: 0 };
    Object.assign(window, { readableMetrics: state });
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (!(entry as PerformanceEntry & { hadRecentInput: boolean }).hadRecentInput) state.cls += (entry as PerformanceEntry & { value: number }).value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/assets\/index-[\w-]+\.js$/, async route => { await held; await route.continue(); });
  try {
    await page.goto('/', { waitUntil: 'commit' });
    await page.locator('#static-content').waitFor({ state: 'attached' });
    await expect(page.locator('#static-content')).toBeHidden();
    if (evidence) {
      await mkdir(evidence, { recursive: true });
      await page.screenshot({ path: path.join(evidence, `${info.project.name}-before-app.png`) });
    }
  } finally { release(); }
  await page.locator('.tqw-hero').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('#static-content')).toBeHidden();
  await page.waitForTimeout(3000);
  const metrics = await page.evaluate(() => (window as unknown as { readableMetrics: { cls: number } }).readableMetrics);
  console.log(`${info.project.name} CLS=${metrics.cls}`);
  expect(metrics.cls).toBeLessThan(0.05);
  expect(violations).toEqual([]);
  if (evidence) {
    await page.screenshot({ path: path.join(evidence, `${info.project.name}-after-app.png`) });
  }
});
