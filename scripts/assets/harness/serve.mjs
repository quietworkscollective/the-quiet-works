// A static server for the built harness that sends the app's real Content-Security-Policy as an
// HTTP header. The policy is read from the app's own production build (apps/web/dist/_headers,
// emitted by apps/web/vite.config.ts), not copied here, so the proof follows the policy as shipped.
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../lib/util.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.map': 'application/json',
};

export const HARNESS_DIST = path.join(REPO_ROOT, '.asset-cache', 'harness-dist');
export const APP_HEADERS = path.join(REPO_ROOT, 'apps', 'web', 'dist', '_headers');

/** The Content-Security-Policy value from the app's built `_headers` file. */
export function realCsp() {
  const text = readFileSync(APP_HEADERS, 'utf8');
  const match = /^\s*Content-Security-Policy:\s*(.+)$/m.exec(text);
  if (!match) throw new Error(`${APP_HEADERS} has no Content-Security-Policy line; build the app first (pnpm build)`);
  return match[1].trim();
}

export function startServer({ port, directory = HARNESS_DIST, csp = realCsp() }) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    let file = path.join(directory, decodeURIComponent(url.pathname));
    if (!file.startsWith(directory)) {
      response.writeHead(403).end();
      return;
    }
    try {
      if (statSync(file).isDirectory()) file = path.join(file, 'index.html');
      const body = readFileSync(file);
      response.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
        'Content-Security-Policy': csp,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
