import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WALK_LIMITS } from '../src/corridor/layout.ts';

const EVIDENCE_DIR = join(fileURLToPath(new URL('../../../', import.meta.url)), 'evidence/round3');

function pngFromDataUrl(url: string): Buffer {
  return Buffer.from(url.replace(/^data:image\/png;base64,/, ''), 'base64');
}

async function save(page: import('@playwright/test').Page, name: string, view: { x: number; z: number; yawDeg: number; pitchDeg: number }): Promise<void> {
  const result = await page.evaluate(async (pose) => {
    const coverage = window.__tqwProbe!.frame(pose);
    const image = new Image();
    image.src = window.__tqwProbe!.image(pose);
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { png: canvas.toDataURL('image/png'), magenta: coverage.magenta };
  }, view);
  expect(result.magenta, `${name} is clear`).toBe(0);
  await writeFile(join(EVIDENCE_DIR, name), pngFromDataUrl(result.png));
}

test('captures corridor grouping and repair shelf review views', async ({ page, isMobile }, info) => {
  test.setTimeout(180_000);
  test.skip(process.env['TQW_EVIDENCE'] !== '1' || !['desktop', 'mobile'].includes(info.project.name), 'evidence capture run only');
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await page.goto('/?tqw-debug=holes');
  await page.evaluate(() => {
    const game = document.getElementById('game');
    const window_ = game?.querySelector<HTMLElement>('.tqw-game__window');
    if (game) window.scrollTo(0, game.offsetTop + game.offsetHeight - (window_?.offsetHeight ?? window.innerHeight));
  });
  await expect(page.locator('.tqw-corridor-canvas canvas')).toHaveAttribute('data-world', 'ready', { timeout: 90_000 });
  await page.waitForFunction(() => window.__tqwProbe !== undefined, undefined, { timeout: 60_000 });

  const device = isMobile ? 'pixel7' : 'desktop';
  const views = [
    { name: `${device}-lookback-far-end.png`, pose: { x: 0, z: WALK_LIMITS.minZ + 1, yawDeg: 180, pitchDeg: 0 } },
    ...(isMobile ? [] : [{ name: 'desktop-corridor-down.png', pose: { x: 0, z: -12, yawDeg: 0, pitchDeg: 0 } }]),
  ];
  for (const view of views) await save(page, view.name, view.pose);
});
