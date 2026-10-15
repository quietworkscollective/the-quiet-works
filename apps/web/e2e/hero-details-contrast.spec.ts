import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expectSpine } from './helpers.ts';
import { sceneTimeout } from './timeouts.ts';
import { contrast, decodePng, luminance, parseColour } from './png.ts';

test('hero details keep five-to-one contrast over live corridor frames', async ({ page }, info) => {
  await page.goto('/');
  await expectSpine(page, 'entrance');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.tqw-corridor-canvas canvas')).toHaveAttribute('data-world', 'ready', { timeout: sceneTimeout(30_000) });
  await expect(page.locator('.tqw-corridor-canvas')).toHaveAttribute('data-pose', /,/);
  await page.waitForTimeout(800);
  const details = page.locator('.tqw-hero__details');
  const { colour, rect } = await details.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const bounds = range.getBoundingClientRect();
    return { colour: getComputedStyle(element).color, rect: { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom } };
  });
  const evidence = process.env.TQW_SOL_EVIDENCE;
  if (evidence) {
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: path.join(evidence, `${info.project.name}-hero.png`) });
  }
  // Match the protected contrast check: measure the actual ground with text and shadows hidden.
  await page.evaluate(() => {
    for (const element of document.querySelectorAll<HTMLElement | SVGElement>('.tqw-hero, .tqw-hero *')) {
      element.style.setProperty('color', 'transparent', 'important');
      element.style.setProperty('text-shadow', 'none', 'important');
      element.style.setProperty('text-decoration-color', 'transparent', 'important');
      if (element instanceof SVGElement) element.style.setProperty('visibility', 'hidden', 'important');
    }
  });
  for (const delay of [0, 1200, 1200]) {
    await page.waitForTimeout(delay);
    const raster = decodePng(await page.screenshot({ scale: 'css' }));
    const pixels: Array<readonly [number, number, number]> = [];
    for (let y = Math.floor(rect.top) - 2; y <= Math.ceil(rect.bottom) + 2; y += 2) {
      for (let x = Math.floor(rect.left) - 2; x <= Math.ceil(rect.right) + 2; x += 2) pixels.push(raster.at(x, y));
    }
    pixels.sort((a, b) => luminance(a) - luminance(b));
    const ground = pixels[Math.min(pixels.length - 1, Math.floor(pixels.length * .995))]!;
    const ratio = contrast(parseColour(colour), ground);
    console.log(`${info.project.name} hero details contrast=${ratio} colour=${colour} ground=${ground.join(',')}`);
    expect(ratio).toBeGreaterThanOrEqual(5);
  }
});
