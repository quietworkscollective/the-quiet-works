import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHAMBERS, TEXT_MODE_CORRIDOR, TEXT_MODE_SCENE } from '@tqw/engine';
import {
  PUBLIC_ROUTES,
  sitemapForChambers,
  jsonLdForPath,
  markdownForPath,
  metadataForPath,
  staticHtmlForPath,
} from './discoverability.ts';

describe('public route discoverability', () => {
  it('has a crawlable route for every public page and chamber', () => {
    const paths = new Set(PUBLIC_ROUTES.map((route) => route.path));
    for (const path of ['/', '/about', '/credits', '/privacy', '/licences', '/agents']) expect(paths.has(path)).toBe(true);
    for (const chamber of CHAMBERS) expect(paths.has(`/${chamber.slug}`)).toBe(true);
    expect(paths.size).toBe(6 + CHAMBERS.length);
    expect(PUBLIC_ROUTES.every((route) => route.markdownPath.startsWith('/'))).toBe(true);
  });

  it('keeps site pages and open room entries in the sitemap exactly once', () => {
    const sitemap = sitemapForChambers(CHAMBERS);
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(new Set(locations).size).toBe(locations.length);
    expect(new Set(locations)).toEqual(new Set(PUBLIC_ROUTES.filter(route => !route.key.startsWith('chamber:') || CHAMBERS.some(room => route.key === `chamber:${room.id}` && room.status === 'open')).map(route => metadataForPath(route.path).canonical)));
  });

  it('sets Cloudflare MIME types for Markdown and discovery files', () => {
    const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
    const headers = config.match(/const CLOUDFLARE_HEADERS = `([\s\S]*?)`;/)?.[1] ?? '';
    expect(headers).toContain('/*.md\n  Content-Type: text/markdown; charset=utf-8');
    expect(headers).toContain('/llms.txt\n  Content-Type: text/plain; charset=utf-8');
    expect(headers).toContain('/llms-full.txt\n  Content-Type: text/plain; charset=utf-8');
    expect(headers).toContain('/robots.txt\n  Content-Type: text/plain; charset=utf-8');
    expect(headers).toContain('/sitemap.xml\n  Content-Type: application/xml; charset=utf-8');
  });

  it('serves folder routes at their no-trailing-slash canonical URLs', () => {
    const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
    expect(wrangler).toMatch(/"html_handling"\s*:\s*"drop-trailing-slash"/);
  });

  it('returns canonical route metadata and a valid JSON-LD graph', () => {
    for (const route of PUBLIC_ROUTES) {
      const metadata = metadataForPath(route.path);
      expect(metadata.title).toBe(route.title);
      expect(metadata.description).toBe(route.description);
      expect(metadata.canonical).toBe(`https://unheld.space${route.path === '/' ? '/' : route.path}`);
      expect(metadata.image).toBe('https://unheld.space/share-unheld-1200x630.png');

      const document = jsonLdForPath(route.path);
      expect(document['@context']).toBe('https://schema.org');
      expect(document['@graph']).toEqual(expect.arrayContaining([
        expect.objectContaining({ '@type': 'WebSite', url: 'https://unheld.space/' }),
        expect.objectContaining({ '@type': 'VisualArtwork', name: 'The Quiet Works' }),
        expect.objectContaining({ '@type': 'Person', name: 'Siri (Asiri) Dalugoda', url: 'https://dalugoda.com/' }),
        expect.objectContaining({ '@type': 'WebPage', url: metadata.canonical, name: route.title }),
      ]));
      expect(JSON.parse(JSON.stringify(document))).toEqual(document);
    }
  });

  it('serves the same text-mode descriptions in fallback HTML and Markdown', () => {
    const corridor = staticHtmlForPath('/');
    const corridorMarkdown = markdownForPath('/');
    for (const paragraph of TEXT_MODE_CORRIDOR) {
      expect(corridor.replace(/&#x27;/g, "'")).toContain(paragraph);
      expect(corridorMarkdown).toContain(paragraph);
    }

    const office = staticHtmlForPath('/certification-office');
    const officeMarkdown = markdownForPath('/certification-office');
    for (const paragraph of TEXT_MODE_SCENE) {
      expect(office.replace(/&#x27;/g, "'")).toContain(paragraph);
      expect(officeMarkdown).toContain(paragraph);
    }

    for (const chamber of CHAMBERS) {
      expect(staticHtmlForPath(`/${chamber.slug}`)).toContain(chamber.title);
      expect(staticHtmlForPath(`/${chamber.slug}`)).toContain(chamber.doorDescription);
      expect(markdownForPath(`/${chamber.slug}`)).toContain(chamber.doorDescription);
    }

    for (const route of PUBLIC_ROUTES) {
      expect(staticHtmlForPath(route.path)).toContain('id="static-content"');
      expect(markdownForPath(route.path)).toContain(route.title);
    }
  });

  it('keeps Credits grouped and links the full licence texts in fallback HTML', () => {
    const credits = staticHtmlForPath('/credits');
    expect(credits).toMatch(/<h2>Authorship<\/h2>/);
    expect(credits).toMatch(/<h2>Licences<\/h2>/);
    expect(credits).toMatch(/<h2>Typefaces:<\/h2>/);
    expect(credits).toMatch(/<h2>Software:<\/h2>/);
    expect(credits).toMatch(/<h2>Third-party assets<\/h2>/);
    expect(credits).toContain('<a href="/third-party-notices.txt">The full licence texts for everything bundled</a>');
  });

  it('keeps agent-facing copy passive and limits its links to UNHELD and public GitHub', () => {
    const skill = readFileSync(new URL('../public/skill.md', import.meta.url), 'utf8');
    const llms = readFileSync(new URL('../public/llms.txt', import.meta.url), 'utf8');
    const agents = staticHtmlForPath('/agents');
    const copy = `${skill}\n${llms}\n${agents}`;
    expect(copy).not.toMatch(/^\s*(?:run|execute|install)\b/im);
    expect(copy).not.toMatch(/\b(?:send|share|provide|enter)\s+(?:your\s+)?(?:credential|password|token|key)\b/i);

    const destinations = [...copy.matchAll(/https?:\/\/[^\s)\]"'<>]+/g)].map((match) => new URL((match[0] as string).replace(/[.,;]+$/, '')));
    expect(destinations.length).toBeGreaterThan(0);
    expect(destinations.every((url) => url.hostname === 'unheld.space' || url.hostname === 'github.com')).toBe(true);
  });
});
