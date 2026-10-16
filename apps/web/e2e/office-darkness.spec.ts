import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { decodePng, luminance } from './png.ts';
import { engageGameWindow } from './helpers.ts';
import { toggleOfficePlaces } from './officePlaces.ts';

test.use({ reducedMotion: 'no-preference' });

type Station = 'machine' | 'certificate' | 'service' | 'desk';
type Direction = 'centre' | 'yaw-min' | 'yaw-max';

const STATIONS: readonly Station[] = ['machine', 'certificate', 'service', 'desk'];
const EVIDENCE = process.env['TQW_DARKNESS_EVIDENCE'];
const PHASE = process.env['TQW_DARKNESS_PHASE'] ?? 'before';
const BRIGHTNESS_THRESHOLD = .09;
const MAX_EMPTY_SURFACE_SHARE = .01;

type EmptyRegion = readonly [left: number, top: number, right: number, bottom: number];

// Hand-marked wall/floor areas contain no props in their corresponding fixed camera frame.
// Coordinates are normalized to the viewport; pixel count is divided by the whole frame area.
const EMPTY_SURFACE_AREAS: Record<'desktop' | 'mobile', Record<string, readonly EmptyRegion[]>> = {
  desktop: {
    'machine-centre': [[.02, .80, .16, .96]],
    'machine-yaw-min': [[.02, .76, .98, .97]],
    'machine-yaw-max': [[.02, .78, .17, .95]],
    'certificate-centre': [[.82, .25, .98, .42]],
    'certificate-yaw-min': [[.82, .35, .98, .78]],
    'certificate-yaw-max': [[.34, .13, .56, .34]],
    'service-centre': [[.02, .20, .14, .78]],
    'service-yaw-min': [[.02, .16, .17, .72]],
    'service-yaw-max': [[.58, .16, .75, .34]],
    'desk-centre': [[.04, .20, .15, .36]],
    'desk-yaw-min': [[.36, .13, .76, .40]],
    'desk-yaw-max': [[.38, .14, .70, .38]],
    'founder-empty-1-records-view': [[.80, .32, .97, .68]],
    'founder-empty-2-ceiling-view': [[.62, .35, .78, .70]],
  },
  mobile: {
    'machine-centre': [[.03, .86, .23, .97]],
    'machine-yaw-min': [[.70, .68, .96, .84]],
    'machine-yaw-max': [[.03, .68, .16, .84]],
    'certificate-centre': [[.02, .35, .17, .63]],
    'certificate-yaw-min': [[.86, .18, .97, .39]],
    'certificate-yaw-max': [[.06, .20, .80, .80]],
    'service-centre': [[.03, .60, .15, .82]],
    'service-yaw-min': [[.05, .20, .80, .82]],
    'service-yaw-max': [[.78, .18, .97, .42]],
    'desk-centre': [[.03, .20, .18, .38]],
    'desk-yaw-min': [[.20, .16, .82, .34]],
    'desk-yaw-max': [[.04, .20, .36, .48]],
    'founder-empty-1-records-view': [[.76, .20, .96, .39]],
    'founder-empty-2-ceiling-view': [[.62, .35, .78, .70]],
  },
};

async function ready(page: Page): Promise<void> {
  await expect(page.locator('.tqw-chamber-host')).toHaveAttribute('data-ready', 'true', { timeout: 90_000 });
}

async function visitRecordsView(page: Page, app: Locator, canvas: Locator, stationBased: boolean): Promise<void> {
  await toggleOfficePlaces(page);
  const records = page.getByRole('button', { name: 'View the records', exact: true });
  await records.focus();
  await records.press('Enter');
  if (stationBased) await expect(app).toHaveAttribute('data-station', 'records', { timeout: 90_000 });
  await expect.poll(async () => {
    const pose = poseFrom(await canvas.getAttribute('data-pose'));
    return [Number((pose[0] ?? 0).toFixed(2)), Number((pose[1] ?? 0).toFixed(2))];
  }, { timeout: 90_000 }).toEqual([-2.6, 4.4]);
  await expect(canvas).toHaveAttribute('data-moving', 'false', { timeout: 90_000 });
  await toggleOfficePlaces(page);
}

function poseFrom(value: string | null): number[] {
  return (value ?? '').split(',').map(Number);
}

function stageOffset(yaw: number): number {
  return ((yaw - 180 + 540) % 360) - 180;
}

async function reachYaw(page: Page, direction: 'min' | 'max'): Promise<void> {
  const canvas = page.locator('.tqw-canvas');
  const target = direction === 'min' ? -1 : 1;
  const fov = Number(await canvas.getAttribute('data-fov'));
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const mobile = box!.width < 600;
  const horizontal = 2 * Math.atan(Math.tan(fov * Math.PI / 360) * (box!.width / box!.height)) * 180 / Math.PI;
  const yawLimit = 90 - horizontal / 2;
  const expected = target * yawLimit;
  // Dragging is the live room's look input. Touch swipes use the phone's higher look gain and
  // stay clear of the station controls along the right edge. A contextual cue may move over a
  // fixed drag start, so choose a row that begins on the canvas and outside all ignored controls.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const sign = direction === 'min' ? 1 : -1;
    const left = box!.x + box!.width * (mobile ? .12 : .06);
    const right = box!.x + box!.width * (mobile ? .72 : .94);
    const startX = sign > 0 ? left : right, endX = sign > 0 ? right : left;
    const y = await page.evaluate(({ startX, top, height }) => {
      for (const fraction of [.24, .32, .4, .48, .56, .64, .72]) {
        const candidate = top + height * fraction;
        const target = document.elementFromPoint(startX, candidate);
        if (target?.closest('.tqw-canvas') && !target.closest('[data-fp-ignore]')) return candidate;
      }
      return null;
    }, { startX, top: box!.y, height: box!.height });
    expect(y, `${mobile ? 'mobile' : 'desktop'} ${direction} yaw needs a clear drag start`).not.toBeNull();
    if (mobile) {
      const client = await page.context().newCDPSession(page);
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart', touchPoints: [{ id: 1, x: startX, y: y!, radiusX: 1, radiusY: 1, force: 1 }],
      });
      for (let step = 1; step <= 8; step += 1) await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ id: 1, x: startX + (endX - startX) * step / 8, y: y!, radiusX: 1, radiusY: 1, force: 1 }],
      });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await client.detach();
    } else {
      await page.mouse.move(startX, y!);
      await page.mouse.down();
      await page.mouse.move(endX, y!, { steps: 8 });
      await page.mouse.up();
    }
    const offset = stageOffset(poseFrom(await canvas.getAttribute('data-pose'))[2] ?? 180);
    if (Math.abs(offset - expected) < 0.5) return;
  }
  await expect.poll(async () => stageOffset(poseFrom(await canvas.getAttribute('data-pose'))[2] ?? 180), { timeout: 10_000 }).toBeCloseTo(expected, 0);
}

async function measure(canvasPng: Buffer, name: string, project: 'desktop' | 'mobile'): Promise<{
  width: number;
  height: number;
  threshold: number;
  regions: readonly EmptyRegion[];
  maskShare: number;
  litEmptyPixels: number;
  litEmptyFrameShare: number;
}> {
  const raster = decodePng(canvasPng);
  const regions = EMPTY_SURFACE_AREAS[project][name];
  expect(regions, `missing empty-surface annotation for ${project}/${name}`).toBeDefined();
  let maskSamples = 0;
  let litSamples = 0;
  for (const [left, top, right, bottom] of regions!) {
    const x0 = Math.floor(left * raster.width), x1 = Math.ceil(right * raster.width);
    const y0 = Math.floor(top * raster.height), y1 = Math.ceil(bottom * raster.height);
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        maskSamples += 1;
        if (luminance(raster.at(x, y)) > BRIGHTNESS_THRESHOLD) litSamples += 1;
      }
    }
  }
  const maskPixels = maskSamples * 4;
  const litEmptyPixels = litSamples * 4;
  return {
    width: raster.width,
    height: raster.height,
    threshold: BRIGHTNESS_THRESHOLD,
    regions: regions!,
    maskShare: maskPixels / (raster.width * raster.height),
    litEmptyPixels,
    litEmptyFrameShare: litEmptyPixels / (raster.width * raster.height),
  };
}

type Captured = { name: string; pose: number[]; metric: Awaited<ReturnType<typeof measure>> };

async function capture(page: Page, canvas: Locator, name: string, info: TestInfo, results: Captured[]): Promise<void> {
  await page.waitForTimeout(120);
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  // A compositor screenshot preserves the settled WebGL frame after Chromium releases its drawing buffer.
  const png = await page.screenshot({ animations: 'disabled' });
  const project = info.project.name as 'desktop' | 'mobile';
  if (EVIDENCE) {
    const folder = join(EVIDENCE, PHASE, info.project.name);
    await writeFile(join(folder, `${name}.png`), png);
  }
  const metric = await measure(png, name, project);
  expect(metric.litEmptyFrameShare, `${project}/${name}: lit empty-surface share`)
    .toBeLessThanOrEqual(MAX_EMPTY_SURFACE_SHARE);
  const pose = poseFrom(await canvas.getAttribute('data-pose'));
  results.push({ name, pose, metric });
  console.log(`${project} ${name}: ${metric.litEmptyFrameShare.toFixed(3)} lit empty-surface share at yaw ${pose[2]?.toFixed(1)}`);
}

test('Office station views keep lit empty surfaces out of the frame', async ({ page }, info) => {
  test.setTimeout(600_000);
  const mobile = info.project.name === 'mobile';
  const app = page.locator('.tqw-app');
  const canvas = page.locator('.tqw-canvas');
  const webgl = page.locator('.tqw-canvas canvas');
  const results: Array<{ name: string; pose: number[]; metric: Awaited<ReturnType<typeof measure>> }> = [];
  if (EVIDENCE) await mkdir(join(EVIDENCE, PHASE, info.project.name), { recursive: true });

  await page.goto('/certification-office');
  await ready(page);
  await engageGameWindow(page);
  const stationBased = await app.getAttribute('data-station') === 'machine';
  if (!stationBased) {
    await expect(app).toHaveAttribute('data-station', 'room');
    await visitRecordsView(page, app, canvas, false);
    await capture(page, canvas, 'founder-empty-1-records-view', info, results);
    for (let i = 0; i < 3; i += 1) {
      const box = await webgl.first().boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.move(box!.x + box!.width * .5, box!.y + box!.height * .2);
      await page.mouse.down();
      await page.mouse.move(box!.x + box!.width * .5, box!.y + box!.height * .8, { steps: 8 });
      await page.mouse.up();
    }
    await expect.poll(async () => Number(await canvas.getAttribute('data-pitch'))).toBeCloseTo(25, 0);
    await capture(page, canvas, 'founder-empty-2-ceiling-view', info, results);
    return;
  }

  for (let index = 0; index < STATIONS.length; index += 1) {
    const station = STATIONS[index]!;
    if (index > 0) {
      if (mobile) await page.getByRole('button', { name: 'Next view' }).tap();
      else await page.keyboard.press('w');
      await expect(app).toHaveAttribute('data-station', station);
    }
    for (const direction of ['centre', 'yaw-min', 'yaw-max'] as const satisfies readonly Direction[]) {
      if (direction === 'yaw-min') await reachYaw(page, 'min');
      if (direction === 'yaw-max') await reachYaw(page, 'max');
      const name = `${station}-${direction}`;
      await capture(page, canvas, name, info, results);
    }
  }

  await visitRecordsView(page, app, canvas, true);
  await capture(page, canvas, 'founder-empty-1-records-view', info, results);
  for (let i = 0; i < 3; i += 1) {
    const box = await webgl.first().boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width * .5, box!.y + box!.height * .2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width * .5, box!.y + box!.height * .8, { steps: 8 });
    await page.mouse.up();
  }
  await expect.poll(async () => Number(await canvas.getAttribute('data-pitch'))).toBeCloseTo(25, 0);
  await capture(page, canvas, 'founder-empty-2-ceiling-view', info, results);

  if (EVIDENCE && PHASE === 'after') {
    const before = await Promise.all(results.map(async result => {
      const source = await readFile(join(EVIDENCE, 'before', info.project.name, `${result.name}.png`));
      return { name: result.name, metric: await measure(source, result.name, info.project.name as 'desktop' | 'mobile') };
    }));
    await writeFile(join(EVIDENCE, PHASE, info.project.name, 'measurements.json'), JSON.stringify({
      brightnessThreshold: BRIGHTNESS_THRESHOLD,
      maxLitEmptyFrameShare: MAX_EMPTY_SURFACE_SHARE,
      before,
      after: results,
    }, null, 2));
  }
});
