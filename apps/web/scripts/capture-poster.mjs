#!/usr/bin/env node
/**
 * Captures the hero's poster stills from the real build (ADR 0003): a still of the corridor's hero
 * view, drawn by the live scene at `?quality=high`, so the hero never starts on black while the 3D
 * scene loads. Two variants (landscape 1440 x 900, portrait 412 x 915), each WebP under 60 KB,
 * written to `public/` where the app and its manifest expect them.
 *
 * usage (from apps/web, after `pnpm build`):
 *   node scripts/capture-poster.mjs [--url http://127.0.0.1:4173] [--out public] [--budget 180000]
 *
 * With no --url it serves `dist/` itself on a free port, so the capture is of the build, not of the
 * dev server. Re-run it whenever the corridor's art changes (the poster must match the live view,
 * which it dissolves into) and commit the two files. Reduced motion is emulated, so the scene holds
 * its authored hero pose rather than a moment of the slow drift: the capture is the same every time.
 * Uses only Node and the installed Playwright; no new dependency.
 */
import { createReadStream, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(PACKAGE_DIR, 'dist');

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const OUT = path.resolve(PACKAGE_DIR, option('out', 'public'));
const BUDGET = Number(option('budget', '60000'));

const VARIANTS = [
  { file: 'poster-hero-1440x900.webp', viewport: { width: 1440, height: 900 } },
  { file: 'poster-hero-412x915.webp', viewport: { width: 412, height: 915 } },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

/** Serves dist/ and nothing else; unknown paths get index.html, as the real host does. */
function serveDist() {
  if (!existsSync(path.join(DIST, 'index.html'))) throw new Error('dist/ is missing: run `pnpm build` first (or pass --url).');
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    let file = path.join(DIST, pathname);
    if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) file = path.join(DIST, 'index.html');
    response.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
    createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

/** Encodes a PNG as the highest-quality WebP that fits the budget, in the browser (no encoder dependency). */
async function encode(page, png) {
  return page.evaluate(
    async ({ base64, budget }) => {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = `data:image/png;base64,${base64}`;
      });
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      const blobAt = (quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
      let low = 0.4;
      let high = 0.95;
      let best = null;
      for (let step = 0; step < 8; step += 1) {
        const quality = (low + high) / 2;
        const blob = await blobAt(quality);
        if (blob && blob.size <= budget) {
          best = { blob, quality };
          low = quality;
        } else {
          high = quality;
        }
      }
      if (!best) return null;
      const bytes = new Uint8Array(await best.blob.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { base64: btoa(binary), quality: best.quality, size: best.blob.size, width: canvas.width, height: canvas.height };
    },
    { base64: png.toString('base64'), budget: BUDGET },
  );
}

const hosted = option('url', null) ? null : await serveDist();
const base = option('url', hosted?.url);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
mkdirSync(OUT, { recursive: true });
let failed = false;
try {
  const encoder = await browser.newPage();
  await encoder.goto('about:blank');
  for (const { file, viewport } of VARIANTS) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(`${base}/?quality=high`);
    await page.locator('.tqw-corridor-canvas[data-pose]').waitFor({ timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    // The scene has drawn when its published frame count moves (or, drawing on demand, its pose has been there a while).
    await page.waitForFunction(() => Number(document.querySelector('.tqw-corridor-canvas')?.dataset.frames ?? 0) >= 1, null, { timeout: 60_000 }).catch(() => undefined);
    await page.waitForTimeout(2500);
    // Only the world: everything the page lays over it is hidden, and so is the poster itself. The page
    // reserves a scrollbar gutter (so engaging never shifts it); a still of the world has no use for one.
    await page.evaluate(() => {
      document.documentElement.style.setProperty('scrollbar-gutter', 'auto', 'important');
      for (const el of document.querySelectorAll('.tqw-hero, .tqw-poster, .tqw-game__chrome, .tqw-game__scrim, .tqw-veil, .tqw-skip')) {
        el.style.setProperty('visibility', 'hidden', 'important');
      }
    });
    await page.waitForTimeout(1500);
    const width = await page.evaluate(() => document.querySelector('.tqw-game__window')?.getBoundingClientRect().width ?? 0);
    if (Math.abs(width - viewport.width) > 1) throw new Error(`${file}: the world is ${width} px wide, not ${viewport.width}`);
    const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, ...viewport } });
    const encoded = await encode(encoder, png);
    if (!encoded) {
      console.error(`${file}: no WebP quality fits ${BUDGET} bytes`);
      failed = true;
    } else {
      writeFileSync(path.join(OUT, file), Buffer.from(encoded.base64, 'base64'));
      console.log(`${file}: ${encoded.width} x ${encoded.height}, quality ${encoded.quality.toFixed(2)}, ${encoded.size} bytes (budget ${BUDGET})`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  hosted?.server.close();
}
if (failed) process.exit(1);
