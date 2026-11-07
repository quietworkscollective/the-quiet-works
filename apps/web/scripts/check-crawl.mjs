import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { runnerImport } from 'vite';

const { module: { ABOUT, CHAMBERS, PRIVACY } } = await runnerImport(new URL('../../../packages/engine/src/index.ts', import.meta.url).pathname, { configFile: false, root: new URL('..', import.meta.url).pathname });
const base = process.env.TQW_CRAWL_URL ?? 'http://127.0.0.1:4190';
const agents = ['OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'PerplexityBot', 'Googlebot', 'Bingbot'];
const routes = ['/', '/certification-office', '/tomorrow-engine', '/the-exchange'];
function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)=["']([^"']*)["']/g)].map(match => [match[1], match[2]]));
}
for (const agent of agents) {
  for (const route of routes) {
    const url = new URL(route, base);
    const html = await new Promise((resolve, reject) => {
      const request = (url.protocol === 'https:' ? https : http).get(url, { headers: { 'User-Agent': agent } }, response => {
        if (response.statusCode !== 200) { response.resume(); reject(new Error(`${agent} ${route}: HTTP ${response.statusCode}`)); return; }
        response.setEncoding('utf8');
        let body = '';
        response.on('data', chunk => { body += chunk; });
        response.on('end', () => resolve(body));
        response.on('error', reject);
      });
      request.setTimeout(15_000, () => request.destroy(new Error('Crawler request timed out')));
      request.on('error', reject);
    });
    const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '';
    const reading = body.match(/<main\b[^>]*id="static-content"[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? '';
    const text = reading.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.match(reading, /<h1>/, `${agent} ${route}: semantic heading missing from body`);
    for (const copy of [ABOUT.body[0], PRIVACY.body[0], ...CHAMBERS.map(room => room.title)]) assert.ok(text.includes(copy), `${agent} ${route}: body missing ${copy}`);
    for (const href of ['/about', '/privacy', '/llms.txt', '/sitemap.xml']) assert.ok(reading.includes(`href="${href}"`), `${agent} ${route}: missing link ${href}`);
    const meta = new Map([...html.matchAll(/<meta\b[^>]*>/gi)].map(match => { const attrs = attributes(match[0]); return [attrs.property ?? attrs.name, attrs.content]; }));
    for (const name of ['title', 'description', 'url', 'type', 'site_name', 'image']) assert.ok(meta.get(`og:${name}`), `${agent} ${route}: missing og:${name}`);
    // Each route describes itself: the landing names the work and its maker, a room names the room.
    assert.equal(meta.get('og:description'), meta.get('description'), `${agent} ${route}: og:description differs from description`);
    const room = CHAMBERS.find(entry => `/${entry.slug}` === route);
    assert.ok(meta.get('description').includes(room ? room.title : 'Siri (Asiri) Dalugoda'), `${agent} ${route}: description is not specific to the route`);
    assert.equal(meta.get('robots'), 'index, follow', `${agent} ${route}: an open route must be indexable`);
    assert.equal(meta.get('og:url'), `https://unheld.space${route}`);
    assert.equal(meta.get('og:image'), 'https://unheld.space/share-unheld-1200x630.jpg');
    assert.equal(meta.get('twitter:card'), 'summary_large_image');
    console.log(`PASS ${agent} ${route}: readable body and link preview`);
  }
}
console.log(`check:crawl passed: ${agents.length} user agents × ${routes.length} routes.`);
