import { expect, test } from '@playwright/test';
import { openMenu } from './helpers.ts';

const PUBLIC_ROUTES = [
  '/',
  '/about/',
  '/credits/',
  '/privacy/',
  '/agents/',
  '/certification-office/',
  '/apartment/',
  '/tomorrow-engine/',
  '/great-atrium/',
  '/the-exchange/',
  '/outline-room/',
];

test('every public route has server HTML, canonical metadata and structured data', async ({ request }) => {
  for (const route of PUBLIC_ROUTES) {
    const response = await request.get(route);
    expect(response.ok(), route).toBe(true);
    const html = await response.text();
    expect(html, route).toContain('id="static-content"');
    const canonical = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1];
    expect(canonical, route).toBe(`https://unheld.space${route === '/' ? '/' : route.replace(/\/$/, '')}`);
    expect(html, route).toContain('property="og:image"');
    expect(html, route).toContain('name="twitter:card"');
    expect(html, route).toContain('application/ld+json');
    expect(html, route).toContain('https://unheld.space/poster-hero-1440x900.webp');
    expect(html.match(/<meta[^>]*property="og:url"[^>]*content="([^"]+)"/)?.[1], route).toBe(canonical);

    const jsonLd = html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/s)?.[1];
    expect(jsonLd, route).toBeTruthy();
    expect(JSON.parse(jsonLd as string)['@graph'].map((item: { '@type': string }) => item['@type']))
      .toEqual(expect.arrayContaining(['WebSite', 'VisualArtwork', 'Person', 'WebPage']));
    const graph = JSON.parse(jsonLd as string)['@graph'] as Array<Record<string, unknown>>;
    expect(graph.find((item) => item['@type'] === 'Person')).toMatchObject({ name: 'Siri (Asiri) Dalugoda', url: 'https://dalugoda.com/' });
    expect((graph.find((item) => item['@type'] === 'WebPage') as { url: string }).url).toBe(canonical);
  }
});

test('Agents is a standalone static page with only public submission links', async ({ request }) => {
  const response = await request.get('/agents/');
  const html = await response.text();
  expect(html).toContain('UNHELD is a space for people and agents');
  expect(html).toContain('Read the public agent skill');
  expect(html).not.toMatch(/<script\b[^>]*\btype="module"/);
  const body = html.match(/<main id="static-content"[^>]*>(.*?)<\/main>/s)?.[1] ?? '';
  const links = [...body.matchAll(/\bhref="(https?:[^"]+)"/g)].map((match) => new URL(match[1] as string));
  expect(links.every((url) => url.hostname === 'github.com' || url.hostname === 'unheld.space')).toBe(true);
});

test('robot and language-model discovery files have usable content types and links', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.headers()['content-type']).toContain('text/plain');
  expect(await robots.text()).toContain('Allow: /');
  expect(await robots.text()).toContain('https://unheld.space/sitemap.xml');

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.headers()['content-type']).toMatch(/(?:application|text)\/xml/);
  const xml = await sitemap.text();
  for (const route of PUBLIC_ROUTES) expect(xml).toContain(`https://unheld.space${route === '/' ? '/' : route.replace(/\/$/, '')}`);
  const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  expect(new Set(locations).size).toBe(PUBLIC_ROUTES.length);
  expect(new Set(locations)).toEqual(new Set(PUBLIC_ROUTES.map((route) => `https://unheld.space${route === '/' ? '/' : route.replace(/\/$/, '')}`)));

  for (const path of ['/llms.txt', '/llms-full.txt']) {
    const response = await request.get(path);
    expect(response.headers()['content-type']).toContain('text/plain');
    expect(await response.text()).toContain('UNHELD');
  }

  for (const path of ['/index.md', '/about.md', '/credits.md', '/privacy.md', '/agents.md', '/certification-office.md', '/the-exchange.md', '/outline-room.md', '/skill.md']) {
    const response = await request.get(path);
    expect(response.headers()['content-type']).toContain('text/markdown');
    expect(await response.text()).toContain('UNHELD');
  }

  const fullText = await (await request.get('/llms-full.txt')).text();
  const destinations = [...fullText.matchAll(/https?:\/\/[^\s)\]]+/g)].map((match) => new URL((match[0] as string).replace(/[.,;]+$/, '')));
  expect(destinations.every((url) => url.hostname === 'unheld.space' || url.hostname === 'github.com')).toBe(true);
});

test('the route metadata changes when the single-page app navigates', async ({ page }) => {
  await page.goto('/');
  await (await openMenu(page)).getByRole('link', { name: 'About' }).click();
  await expect(page).toHaveURL('/about');
  await expect(page).toHaveTitle(/About UNHELD/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://unheld.space/about');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'About UNHELD');
  await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute('content', 'About UNHELD');
  const jsonLd = JSON.parse(await page.locator('#route-structured-data').textContent() as string);
  expect(jsonLd['@graph'].find((item: { '@type': string }) => item['@type'] === 'WebPage').url).toBe('https://unheld.space/about');
});

test('text-only chamber fallbacks preserve the room descriptions', async ({ page, request, browser }) => {
  const office = await (await request.get('/certification-office/')).text();
  const officeFallback = office.match(/<main id="static-content"[^>]*>(.*?)<\/main>/s)?.[1] ?? '';
  expect(officeFallback).toContain('One lamp makes a pool of light on an industrial desk.');
  expect(officeFallback).toContain("Across the floor, a clerk's window is still lit");
  await page.goto('/certification-office?mode=text');
  await expect(page.getByText('One lamp makes a pool of light on an industrial desk.')).toBeVisible();
  await expect(page.getByText("Across the floor, a clerk's window is still lit, with no one behind it. On the desk, a form sits under a brass press that holds a wooden-handled rubber stamp, beside a teal machine with an amber display.", { exact: true })).toBeVisible();

  const exchange = await (await request.get('/the-exchange/')).text();
  const exchangeFallback = exchange.match(/<main id="static-content"[^>]*>(.*?)<\/main>/s)?.[1] ?? '';
  expect(exchangeFallback).toContain('The room is ready as a set of places and actions.');
  const outline = await (await request.get('/outline-room/')).text();
  const outlineFallback = outline.match(/<main id="static-content"[^>]*>(.*?)<\/main>/s)?.[1] ?? '';
  expect(outlineFallback).toContain('A brass arm follows the outside edge of a selected object.');

  // Unreleased rooms retain their crawlable descriptions without enabling their interactive routes.
  for (const path of ['/the-exchange', '/outline-room']) {
    await page.goto(`${path}?mode=text`);
    await expect(page.getByRole('dialog', { name: "This address isn't in the directory" })).toBeVisible();
    await expect(page.locator('.tqw-exchange, .tqw-outline-room')).toHaveCount(0);
  }
  const reading = await browser.newPage({ javaScriptEnabled: false, viewport: page.viewportSize() });
  try {
    await reading.goto(new URL('/the-exchange/', page.url()).href);
    await expect(reading.getByText('The room is ready as a set of places and actions.', { exact: true })).toBeVisible();
    await reading.goto(new URL('/outline-room/', page.url()).href);
    await expect(reading.getByText('A brass arm follows the outside edge of a selected object. It leaves the inside undescribed.', { exact: true })).toBeVisible();
    await expect(reading.getByText('The tins are fictional workshop specimens. Nothing here describes a visitor.', { exact: true })).toBeVisible();
  } finally {
    await reading.close();
  }
});
