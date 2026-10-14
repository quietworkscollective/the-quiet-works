#!/usr/bin/env node
/**
 * Draws the UNHELD mark's raster files from the same geometry as the favicon and the in-page
 * mark (packages/ui/src/spine/Mark.tsx): `public/favicon.svg`, `public/apple-touch-icon.png`
 * (180 x 180) and `public/icon-512.png`. Rasterised with the installed Playwright (Chromium), so
 * no image library is added. Run from apps/web after a change to the mark:
 *
 *   node scripts/brand-assets.mjs
 *
 * and commit the three files it writes. The PNGs are opaque coal with the mark in bone; the mark
 * sits inside the central 50% so a circular maskable crop never touches it.
 *
 * Licence of the files this script writes: original art, (c) 2026 Asiri Dalugoda, licensed under
 * Creative Commons Attribution 4.0 International (CC BY 4.0). That is a decision, recorded in
 * LICENSING.md, which puts `apps/web/public/` under CC BY 4.0; LICENSES/CC-BY-4.0.txt is the licence
 * text and the licence file named for these three files in assets.manifest.json. LICENSING.md keeps
 * one thing back: the UNHELD name and the mark as the project's identity. Using them to refer to the
 * project is fine; using them for something else, or to suggest endorsement, is not.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const COAL = '#151A20';
const BONE = '#DDD5C8';
/** Same path as MARK.path in Mark.tsx: left upright and top bar, then the right upright. */
const MARK_PATH = 'M2 15V2h13M14 6v9';
/** The mark occupies units 1..15 of its 16-unit grid. */
const MARK_EXTENT = 14;

const stroke = `fill="none" stroke="${BONE}" stroke-width="2" stroke-linecap="butt" stroke-linejoin="miter"`;

/** 16 x 16: a rounded coal tile and the mark at its native, pixel-aligned size. */
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
  <rect width="16" height="16" rx="3" fill="${COAL}"/>
  <path d="${MARK_PATH}" ${stroke}/>
</svg>
`;

/** A square icon of `size` px: full-bleed coal, mark `fraction` of the side, centred. */
function iconSvg(size, fraction) {
  const scale = (size * fraction) / MARK_EXTENT;
  const offset = size / 2 - 8 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="${COAL}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})"><path d="${MARK_PATH}" ${stroke}/></g>
</svg>`;
}

mkdirSync(PUBLIC_DIR, { recursive: true });
writeFileSync(path.join(PUBLIC_DIR, 'favicon.svg'), FAVICON);

const browser = await chromium.launch();
try {
  for (const [file, size, fraction] of [
    ['apple-touch-icon.png', 180, 0.5],
    ['icon-512.png', 512, 0.46],
  ]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><body style="margin:0;background:${COAL}">${iconSvg(size, fraction)}</body>`);
    await page.screenshot({ path: path.join(PUBLIC_DIR, file), omitBackground: false });
    await page.close();
    console.log(`wrote public/${file} (${size} x ${size})`);
  }
} finally {
  await browser.close();
}
console.log('wrote public/favicon.svg');
