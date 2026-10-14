import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { creditGroups, type ThirdPartyData } from './src/credits/groupCredits.ts';
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

export default defineConfig({
  plugins: [react(), siteMetadata(), thirdPartyCredits(), contentSecurityPolicy(), thirdPartyNotices()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
  test: { include: ['src/**/*.test.ts', 'src/**/*.test.tsx'], environment: 'node' },
});
