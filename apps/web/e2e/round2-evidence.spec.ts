import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { officeYawLimit } from '../src/chambers/certification-office/scene/stage.ts';
import { HANDOVER, START_VIEW, WALK_LIMITS } from '../src/corridor/layout.ts';
import { expectSpine } from './helpers.ts';

const EVIDENCE_DIR = join(fileURLToPath(new URL('../../../', import.meta.url)), 'evidence/round2');

function pngFromDataUrl(url: string): Buffer {
  return Buffer.from(url.replace(/^data:image\/png;base64,/, ''), 'base64');
}

async function saveProbeImage(
  page: import('@playwright/test').Page,
  name: string,
  view: { x: number; z: number; yawDeg: number; pitchDeg: number },
  size: { width: number; height: number },
): Promise<void> {
  const coverage = await page.evaluate((pose) => window.__tqwProbe!.frame(pose), view);
  const png = await page.evaluate(async ({ view: pose, size: target }) => {
    const source = window.__tqwProbe!.image(pose);
    const image = new Image();
    image.src = source;
    await image.decode();
    const output = document.createElement('canvas');
    output.width = target.width;
    output.height = target.height;
    output.getContext('2d')!.drawImage(image, 0, 0, target.width, target.height);
    return output.toDataURL('image/png');
  }, { view, size });
  const buffer = pngFromDataUrl(png);
  expect(buffer.readUInt32BE(16)).toBe(size.width);
  expect(buffer.readUInt32BE(20)).toBe(size.height);
  await writeFile(join(EVIDENCE_DIR, name), buffer);
  expect(coverage.magenta, `${name} is clear at the captured view`).toBe(0);
}

test('captures the whole corridor and lobby in both screen shapes', async ({ page, isMobile }, info) => {
  test.skip(process.env['TQW_EVIDENCE'] !== '1' || !['desktop', 'mobile'].includes(info.project.name), 'evidence capture run only');
  const size = isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await page.setViewportSize(size);
  await page.goto('/?tqw-debug=holes');
  await expectSpine(page, 'entrance');
  await page.evaluate(() => {
    const game = document.getElementById('game');
    const window_ = game?.querySelector<HTMLElement>('.tqw-game__window');
    if (game) window.scrollTo(0, game.offsetTop + game.offsetHeight - (window_?.offsetHeight ?? window.innerHeight));
  });
  await expectSpine(page, 'corridor');
  await expect(page.locator('.tqw-corridor-canvas canvas')).toHaveAttribute('data-world', 'ready', { timeout: 90_000 });
  await page.waitForFunction(() => window.__tqwProbe !== undefined, undefined, { timeout: 60_000 });

  const start = isMobile ? START_VIEW.portrait : START_VIEW.desktop;
  const device = isMobile ? 'pixel-7' : 'desktop';
  const captures = [
    { name: 'lobby-front-doors', view: { x: 0, z: 4.2, yawDeg: 180, pitchDeg: 0 } },
    { name: 'hero-start-front-doors', view: { x: start.x, z: start.z, yawDeg: 180, pitchDeg: 0 } },
    { name: 'handover-front-doors', view: { ...HANDOVER, yawDeg: 180, pitchDeg: 0 } },
    { name: 'corridor-down', view: { x: 0, z: -12, yawDeg: 0, pitchDeg: 0 } },
    { name: 'lookback-mid-corridor', view: { x: 0, z: -12, yawDeg: 180, pitchDeg: 0 } },
    { name: 'lookback-far-end', view: { x: 0, z: WALK_LIMITS.minZ + 1, yawDeg: 180, pitchDeg: 0 } },
  ];
  for (const capture of captures) {
    await saveProbeImage(page, `${device}-${capture.name}.png`, capture.view, size);
  }
});

test('measures and captures the Office yaw stops in the production scene', async ({ page }, info) => {
  test.skip(process.env['TQW_EVIDENCE'] !== '1' || !['desktop', 'mobile'].includes(info.project.name), 'evidence capture run only');
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await page.goto('/certification-office');
  const stage = page.locator('.tqw-canvas');
  await expect(stage).toHaveAttribute('data-ready', 'true', { timeout: 90_000 });
  const bounds = await stage.locator('canvas').first().boundingBox();
  expect(bounds).not.toBeNull();

  const readPose = async (): Promise<{ yaw: number; fov: number }> => {
    const [pose, fov] = await Promise.all([stage.getAttribute('data-pose'), stage.getAttribute('data-fov')]);
    const yaw = Number((pose ?? '').split(',')[2]);
    expect(Number.isFinite(yaw)).toBe(true);
    expect(Number.isFinite(Number(fov))).toBe(true);
    return { yaw, fov: Number(fov) };
  };
  const box = bounds!;
  const y = box.y + box.height * 0.5;
  const turnTo = async (direction: -1 | 1): Promise<number> => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const left = box.x + box.width * 0.15;
      const right = box.x + box.width * 0.85;
      const fromX = direction > 0 ? right : left;
      const toX = direction > 0 ? left : right;
      if (info.project.name === 'mobile') {
        const touch = await page.context().newCDPSession(page);
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fromX, y }] });
        for (let step = 1; step <= 24; step += 1) {
          await touch.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: fromX + ((toX - fromX) * step) / 24, y }],
          });
        }
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await touch.detach();
      } else {
        await page.mouse.move(fromX, y);
        await page.mouse.down();
        await page.mouse.move(toX, y, { steps: 24 });
        await page.mouse.up();
      }
    }
    await page.waitForTimeout(300);
    return (await readPose()).yaw;
  };

  const rightYaw = await turnTo(1);
  await page.mouse.move(1, 1);
  await stage.screenshot({ path: join(EVIDENCE_DIR, `${info.project.name}-office-right-stop.png`) });
  const leftYaw = await turnTo(-1);
  await page.mouse.move(1, 1);
  await stage.screenshot({ path: join(EVIDENCE_DIR, `${info.project.name}-office-left-stop.png`) });

  const { fov } = await readPose();
  const horizontal = (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * (box.width / box.height)) * 180) / Math.PI;
  const limit = officeYawLimit(horizontal);
  const expectedLeft = 180 - limit;
  const expectedRight = 180 + limit;
  const result = `project=${info.project.name}; officeYawLimit=${limit.toFixed(2)}°; expected=${expectedLeft.toFixed(2)}°..${expectedRight.toFixed(2)}°; measured=${leftYaw.toFixed(2)}°..${rightYaw.toFixed(2)}°`;
  console.log(`[Office yaw evidence] ${result}`);
  info.annotations.push({ type: 'office-yaw', description: result });
});
