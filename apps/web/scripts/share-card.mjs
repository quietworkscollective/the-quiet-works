/** Derive the public 1200 × 630 card from the committed hero art, without recapturing the scene. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { SITE } from '../src/site.ts';

const data = (path, mime) => `data:${mime};base64,${readFileSync(new URL(path, import.meta.url)).toString('base64')}`;
const poster = data('../public/poster-hero-1440x900.webp', 'image/webp');
const sans = data('../node_modules/@fontsource/ibm-plex-sans-condensed/files/ibm-plex-sans-condensed-latin-400-normal.woff2', 'font/woff2');
const serif = data('../node_modules/@fontsource/newsreader/files/newsreader-latin-400-normal.woff2', 'font/woff2');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><style>
    @font-face { font-family: Brand; src: url('${sans}'); }
    @font-face { font-family: Reading; src: url('${serif}'); }
    body { margin: 0; width: 1200px; height: 630px; color: #ddd5c8; background: #151a20 url('${poster}') center / cover; }
    body::before { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(21,26,32,.94), rgba(21,26,32,.55) 42%, transparent 78%); }
    main { position: absolute; top: 72px; left: 72px; }
    h1 { margin: 0; font: 400 76px Brand; letter-spacing: .2em; }
    p { margin: 18px 0 0; font: 400 28px Reading; }
  </style><main><h1>${SITE.name}</h1><p>${SITE.tagline}</p></main>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: fileURLToPath(new URL('../public/share-unheld-1200x630.png', import.meta.url)) });
} finally { await browser.close(); }
