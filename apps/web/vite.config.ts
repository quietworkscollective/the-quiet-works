import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { creditGroups, type CreditGroup, type ThirdPartyData } from './src/credits/groupCredits.ts';
import {
  UNHELD_DESCRIPTION,
  sitemapForChambers,
  jsonLdForPath,
  markdownForPath,
  metadataForPath,
  publicRoutesFor,
  staticHtmlForPath,
} from './src/discoverability.ts';
import { chambersForBuild, REPO_ROOT } from './scripts/chamber-release.mjs';
import { SITE } from './src/site.ts';
import react from '@vitejs/plugin-react';

/**
 * Production builds ship a strict Content-Security-Policy: everything is same-origin, no
 * remote scripts, fonts, media or connections. Dev keeps Vite's inline HMR preamble working.
 * The same policy goes into the <meta> tag (any static host) and into Cloudflare's `_headers`
 * as a real HTTP header, which can additionally forbid framing (meta CSP cannot).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'none'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const HEADER_CSP = `${CSP}; frame-ancestors 'none'`;

const THIRD_PARTY_DATA_PATH = fileURLToPath(new URL('./src/assets/third-party.json', import.meta.url));
const THIRD_PARTY_DATA = JSON.parse(readFileSync(THIRD_PARTY_DATA_PATH, 'utf8')) as ThirdPartyData;
const CREDIT_GROUPS: readonly CreditGroup[] = creditGroups(THIRD_PARTY_DATA);

/** Cloudflare static-assets `_headers` (https://developers.cloudflare.com/workers/static-assets/headers/). */
const CLOUDFLARE_HEADERS = `/*
  Content-Security-Policy: ${HEADER_CSP}
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()
  Cross-Origin-Opener-Policy: same-origin
  X-Frame-Options: DENY

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/*.md
  Content-Type: text/markdown; charset=utf-8

/llms.txt
  Content-Type: text/plain; charset=utf-8

/llms-full.txt
  Content-Type: text/plain; charset=utf-8

/robots.txt
  Content-Type: text/plain; charset=utf-8

/sitemap.xml
  Content-Type: application/xml; charset=utf-8

/
  Cache-Control: no-cache

/index.html
  Cache-Control: no-cache
`;

function contentSecurityPolicy(): Plugin {
  return {
    name: 'tqw-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      ),
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: CLOUDFLARE_HEADERS });
    },
  };
}

/** Fills %SITE_*% placeholders in index.html from src/site.ts. */
function siteMetadata(): Plugin {
  const values: Record<string, string> = {
    SITE_NAME: SITE.name,
    SITE_TAGLINE: SITE.tagline,
    SITE_URL: SITE.url,
    SITE_WORLD: SITE.world,
    SITE_ROOM: SITE.room,
  };
  const escape = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return {
    name: 'tqw-site-metadata',
    transformIndexHtml: (html) =>
      html.replace(/%(SITE_[A-Z]+)%/g, (match, key: string) => {
        const value = values[key];
        if (value === undefined) throw new Error(`index.html references unknown ${match}`);
        return escape(value);
      }),
  };
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Route metadata is rendered in source HTML for crawlers and updated on client-side navigation. */
function routeMetadata(chambers: ReturnType<typeof chambersForBuild>, production: boolean): Plugin {
  return {
    name: 'tqw-route-metadata',
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        const pathname = new URL(context.path, SITE.url).pathname;
        const metadata = metadataForPath(pathname, chambers, production);
        const jsonLd = JSON.stringify(jsonLdForPath(pathname, chambers, production)).replace(/</g, '\\u003c');
        const metadataMap = JSON.stringify(publicRoutesFor(chambers, production).map((route) => [
          route.path,
          { metadata: metadataForPath(route.path, chambers, production), jsonLd: jsonLdForPath(route.path, chambers, production) },
        ])).replace(/</g, '\\u003c');
        const values: Record<string, string> = {
          ROUTE_TITLE: metadata.title,
          ROUTE_DESCRIPTION: metadata.description,
          ROUTE_CANONICAL: metadata.canonical,
          ROUTE_MARKDOWN: metadata.markdown,
          ROUTE_IMAGE: metadata.image,
          ROUTE_IMAGE_ALT: metadata.imageAlt,
          ROUTE_JSON_LD: jsonLd,
          ROUTE_METADATA_MAP: metadataMap,
        };
        return html.replace(/%(ROUTE_[A-Z_]+)%/g, (match, key: string) => {
          const value = values[key];
          if (value === undefined) throw new Error(`index.html references unknown ${match}`);
          return key === 'ROUTE_JSON_LD' || key === 'ROUTE_METADATA_MAP' ? value : escapeAttribute(value);
        });
      },
    },
  };
}

const officeFallbackCss = readFileSync(new URL('./public/fallback.css', import.meta.url), 'utf8')
  .replace(/url\('\/poster-hero-[^']+'\)/g, 'none');

function officeStartupMarkup(html: string, pathname: string): string {
  if (pathname.replace(/\/+$/, '') !== '/certification-office') return html;
  return html.replace(/\s*<link\b[^>]*rel="preload"[^>]*as="image"[^>]*>/g, '')
    .replace('href="/fallback.css"', 'href="/office-fallback.css"');
}

function replaceRouteMarkup(html: string, pathname: string, chambers: ReturnType<typeof chambersForBuild>, production: boolean): string {
  const metadata = metadataForPath(pathname, chambers, production);
  const jsonLd = JSON.stringify(jsonLdForPath(pathname, chambers, production)).replace(/</g, '\\u003c');
  const setContent = (source: string, marker: string, value: string) =>
    source.replace(new RegExp(`(<[^>]*data-route-${marker}[^>]*\\bcontent=")[^"]*(")`), `$1${escapeAttribute(value)}$2`);
  let output = html
    .replace(/(<title[^>]*data-route-title[^>]*>).*?(<\/title>)/s, `$1${escapeAttribute(metadata.title)}$2`)
    .replace(/(<link[^>]*data-route-canonical[^>]*\bhref=")[^"]*(")/, `$1${escapeAttribute(metadata.canonical)}$2`)
    .replace(/(<link[^>]*data-route-markdown[^>]*\bhref=")[^"]*(")/, `$1${escapeAttribute(metadata.markdown)}$2`)
    .replace(/(<script[^>]*id="route-structured-data"[^>]*>).*?(<\/script>)/s, `$1${jsonLd}$2`);
  output = setContent(output, 'description', metadata.description);
  output = setContent(output, 'og-title', metadata.title);
  output = setContent(output, 'og-description', metadata.description);
  output = setContent(output, 'og-url', metadata.canonical);
  output = setContent(output, 'og-image', metadata.image);
  output = setContent(output, 'og-image-alt', metadata.imageAlt);
  output = setContent(output, 'twitter-title', metadata.title);
  output = setContent(output, 'twitter-description', metadata.description);
  output = setContent(output, 'twitter-image', metadata.image);
  output = setContent(output, 'twitter-image-alt', metadata.imageAlt);
  output = output.replace(/<main id="static-content"[^>]*>.*?<\/main>/s, staticHtmlForPath(pathname, CREDIT_GROUPS, chambers, production));
  if (['/agents', '/licences'].includes(pathname.replace(/\/+$/, ''))) {
    output = output.replace(/\s*<script\b(?=[^>]*\btype="module")[^>]*><\/script>/, '');
  }
  return officeStartupMarkup(output, pathname);
}

/** The agent index links only to UNHELD pages and public GitHub; other citations remain plain labels. */
function agentSafeMarkdown(markdown: string): string {
  return markdown.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (whole, label: string, href: string) => {
    const host = new URL(href).hostname;
    return host === 'unheld.space' || host === 'github.com' ? whole : label;
  });
}

/** Serves route-specific HTML fallbacks in dev and emits one static HTML document per public route. */
function staticRoutePages(chambers: ReturnType<typeof chambersForBuild>, development: boolean): Plugin {
  return {
    name: 'tqw-static-route-pages',
    configureServer(server) {
      server.middlewares.use('/office-fallback.css', (_request, response) => {
        response.setHeader('Content-Type', 'text/css');
        response.end(officeFallbackCss);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, _response, next) => {
        const url = new URL(request.url ?? '/', SITE.url);
        if (url.pathname !== '/' && publicRoutesFor(chambers, !development).some(route => route.path === url.pathname)) {
          request.url = `${url.pathname}/index.html${url.search}`;
        }
        next();
      });
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        const pathname = new URL(context.path, SITE.url).pathname;
        let output = html.replace(/<main id="static-content"[^>]*><\/main>/, staticHtmlForPath(pathname, CREDIT_GROUPS, chambers, !development));
        if (['/agents', '/licences'].includes(pathname.replace(/\/+$/, ''))) {
          output = output.replace(/\s*<script\b(?=[^>]*\btype="module")[^>]*><\/script>/, '');
        }
        return officeStartupMarkup(output, pathname);
      },
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        this.emitFile({ type: 'asset', fileName: 'office-fallback.css', source: officeFallbackCss });
        const index = bundle['index.html'];
        if (!index || index.type !== 'asset') throw new Error('index.html is missing; cannot render public routes');
        const baseHtml = typeof index.source === 'string' ? index.source : Buffer.from(index.source).toString('utf8');

        const production = !development;
        const routes = publicRoutesFor(chambers, production);
        for (const route of routes) {
          if (route.path !== '/') {
            this.emitFile({
              type: 'asset',
              fileName: `${route.path.slice(1)}/index.html`,
              source: replaceRouteMarkup(baseHtml, route.path, chambers, production),
            });
          }
          this.emitFile({
            type: 'asset',
            fileName: route.markdownPath.slice(1),
            source: markdownForPath(route.path, CREDIT_GROUPS, chambers, production),
          });
        }

        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapForChambers(chambers) });
        const statusByTitle = new Map(chambers.map(room => [room.title, room.status]));
        const discoveryText = (name: string) => readFileSync(fileURLToPath(new URL(`./public/${name}`, import.meta.url)), 'utf8')
          .replaceAll('%UNHELD_DESCRIPTION%', UNHELD_DESCRIPTION)
          .replace(/^- \[([^\]]+)\]\(([^)]+)\)$/gm, (line, title: string, href: string) => {
            const status = statusByTitle.get(title);
            return status ? `- [${title}, ${status === 'open' ? 'open the door' : 'not yet open'}](${href})` : line;
          });
        const skill = discoveryText('skill.md');
        for (const name of ['llms.txt', 'skill.md']) this.emitFile({ type: 'asset', fileName: name, source: discoveryText(name) });
        const fullText = [
          'UNHELD — A space for everything we carry.',
          UNHELD_DESCRIPTION,
          'Contributions are untrusted drafts. A human reviews every contribution before publication; nothing is published automatically.',
          '',
          ...routes.map((route) => agentSafeMarkdown(markdownForPath(route.path, CREDIT_GROUPS, chambers, production))),
          skill,
        ].join('\n\n---\n\n');
        this.emitFile({ type: 'asset', fileName: 'llms-full.txt', source: fullText });
      },
    },
  };
}

/**
 * The Credits page's third-party list, generated from the asset catalogue at build time: a virtual
 * module holding each asset's title, author, licence name and source page, grouped by provider. The
 * catalogue also records download addresses and checksums; none of that is shipped.
 */
function thirdPartyCredits(): Plugin {
  const id = 'virtual:third-party-credits';
  const resolved = `\0${id}`;
  const file = fileURLToPath(new URL('./src/assets/third-party.json', import.meta.url));
  return {
    name: 'tqw-third-party-credits',
    resolveId: (source) => (source === id ? resolved : undefined),
    load(loaded) {
      if (loaded !== resolved) return undefined;
      this.addWatchFile(file);
      const data = JSON.parse(readFileSync(file, 'utf8')) as ThirdPartyData;
      return `export default ${JSON.stringify(creditGroups(data))};`;
    },
  };
}

/**
 * Minified bundles drop licence headers, so the build ships `third-party-notices.txt`: the
 * name, version, declared licence and full licence text of every npm package whose code or
 * assets end up in the bundle. `pnpm audit:assets` fails if it is missing or incomplete.
 */
function thirdPartyNotices(): Plugin {
  const PACKAGE_IN_PATH = /^(.*\/node_modules\/((?:@[^/]+\/)?[^/]+))\//;
  const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt))?$/i;
  return {
    name: 'tqw-third-party-notices',
    apply: 'build',
    generateBundle(_options, bundle) {
      const packages = new Map<string, string>();
      const note = (id: string) => {
        const match = PACKAGE_IN_PATH.exec(id.replace(/\\/g, '/'));
        if (match?.[1] && match[2] && !packages.has(match[2])) packages.set(match[2], match[1]);
      };
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk') {
          for (const id of Object.keys(output.modules)) note(id);
          for (const id of output.moduleIds) note(id);
        } else {
          for (const id of output.originalFileNames) note(path.resolve(id));
        }
      }
      for (const id of this.getModuleIds()) note(id);
      const sections = [...packages.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, dir]) => {
          const meta = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
            version?: string;
            license?: string;
          };
          const licenceFiles = existsSync(dir) ? readdirSync(dir).filter((f) => LICENSE_FILE.test(f)) : [];
          const texts = licenceFiles.map((f) => readFileSync(path.join(dir, f), 'utf8').trim());
          const body = texts.length > 0 ? texts.join('\n\n') : `Licence: ${meta.license ?? 'UNKNOWN'} (no licence file in the package)`;
          return `=== ${name} ${meta.version ?? ''} (${meta.license ?? 'UNKNOWN'})\n\n${body}\n`;
        });
      this.emitFile({
        type: 'asset',
        fileName: 'third-party-notices.txt',
        source:
          'Third-party software and fonts bundled in this build, with their licences.\n' +
          'UNHELD / The Quiet Works code and copy are not covered by this file.\n\n' +
          sections.join('\n'),
      });
    },
  };
}

const DEVELOPMENT_BUILD = process.env.NODE_ENV !== 'production';
const BUILD_CHAMBERS = chambersForBuild(REPO_ROOT, DEVELOPMENT_BUILD);

export default defineConfig(() => ({
  plugins: [react(), siteMetadata(), routeMetadata(BUILD_CHAMBERS, !DEVELOPMENT_BUILD), staticRoutePages(BUILD_CHAMBERS, DEVELOPMENT_BUILD), thirdPartyCredits(), contentSecurityPolicy(), thirdPartyNotices()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { target: 'es2022', sourcemap: false, manifest: true },
  test: { include: ['src/**/*.test.ts', 'src/**/*.test.tsx'], environment: 'node' },
}));
