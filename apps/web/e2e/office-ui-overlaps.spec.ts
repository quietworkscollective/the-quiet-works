import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { engageGameWindow, roomReady } from './helpers.ts';

test.use({ reducedMotion: 'reduce' });

type Station = 'machine' | 'certificate' | 'service' | 'desk';
type Box = { x: number; y: number; width: number; height: number };

const STATIONS: readonly Station[] = ['machine', 'certificate', 'service', 'desk'];
const TARGET: Record<Station, { center: readonly [number, number, number]; half: readonly [number, number, number] }> = {
  machine: { center: [1, .68, 4.9], half: [.625, .675, .375] },
  certificate: { center: [-1.86, 1.65, 7.89], half: [.32, .42, .01] },
  service: { center: [3.2, 1.15, 6.7], half: [.55, 1.15, .1] },
  desk: { center: [-1, .95, 4], half: [.21, .2, .175] },
};
const EVIDENCE = process.env['TQW_OFFICE_OVERLAP_EVIDENCE'];

function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}

function hasClearance(a: Box, b: Box, pixels = 16): boolean {
  return a.x + a.width + pixels <= b.x || b.x + b.width + pixels <= a.x
    || a.y + a.height + pixels <= b.y || b.y + b.height + pixels <= a.y;
}

async function boxOf(locator: ReturnType<Page['locator']>): Promise<Box | null> {
  const box = await locator.boundingBox();
  return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
}

async function projectedTarget(page: Page, station: Station): Promise<Box> {
  const result = await page.locator('.tqw-canvas').evaluate((canvas, target) => {
    const box = canvas.getBoundingClientRect();
    const pose = (canvas.getAttribute('data-pose') ?? '').split(',').map(Number);
    const x = pose[0]!, z = pose[1]!, yaw = pose[2]!, pitch = pose[3]!;
    const fov = Number(canvas.getAttribute('data-fov')) * Math.PI / 180;
    const [cx, cy, cz] = target.center;
    const [hx, hy, hz] = target.half;
    const tan = Math.tan(fov / 2);
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const dx of [-hx, hx]) for (const dy of [-hy, hy]) for (const dz of [-hz, hz]) {
      const wx = cx + dx - x;
      const wy = cy + dy - 1.62;
      const wz = cz + dz - z;
      const yawRad = yaw * Math.PI / 180;
      const pitchRad = pitch * Math.PI / 180;
      const localX = Math.cos(yawRad) * wx + Math.sin(yawRad) * wz;
      const localZ = -Math.sin(yawRad) * wx + Math.cos(yawRad) * wz;
      const localY = Math.cos(pitchRad) * wy + Math.sin(pitchRad) * localZ;
      const depth = Math.sin(pitchRad) * wy - Math.cos(pitchRad) * localZ;
      const ndcX = localX / (depth * tan * (box.width / box.height));
      const ndcY = localY / (depth * tan);
      const sx = box.left + (ndcX + 1) * box.width / 2;
      const sy = box.top + (1 - ndcY) * box.height / 2;
      left = Math.min(left, sx); right = Math.max(right, sx);
      top = Math.min(top, sy); bottom = Math.max(bottom, sy);
    }
    const clippedLeft = Math.max(box.left, left), clippedTop = Math.max(box.top, top);
    const clippedRight = Math.min(box.right, right), clippedBottom = Math.min(box.bottom, bottom);
    return {
      x: clippedLeft,
      y: clippedTop,
      width: Math.max(0, clippedRight - clippedLeft),
      height: Math.max(0, clippedBottom - clippedTop),
    };
  }, TARGET[station]);
  expect(result.width, `${station} target should project into the stage`).toBeGreaterThan(0);
  expect(result.height, `${station} target should project into the stage`).toBeGreaterThan(0);
  return result;
}

async function readyForStation(page: Page, station: Station): Promise<void> {
  await expect(page.locator('.tqw-app')).toHaveAttribute('data-station', station);
  await expect(page.locator('.tqw-canvas')).toHaveAttribute('data-moving', 'false');
}

async function setPlacesOpen(page: Page, open: boolean): Promise<void> {
  const places = page.locator('.tqw-places');
  const isOpen = await places.evaluate((node: HTMLDetailsElement) => node.open);
  if (isOpen !== open) {
    await places.locator(':scope > summary').focus();
    await page.keyboard.press('Enter');
  }
  await expect(places).toHaveJSProperty('open', open);
}

async function nextStation(page: Page, mobile: boolean): Promise<void> {
  if (mobile) {
    await page.getByRole('button', { name: 'Next view' }).tap();
  } else {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('w');
  }
}

test('Office controls stay clear of the stamp dock and framed station targets', async ({ page }, info) => {
  test.skip(!['desktop', 'mobile'].includes(info.project.name), 'measured on desktop and Pixel 7');
  test.setTimeout(300_000);
  const mobile = info.project.name === 'mobile';
  const violations: Array<{ station: Station; control: string; box: Box; dock: Box }> = [];
  const measurements: Array<Record<string, unknown>> = [];
  const evidenceDir = EVIDENCE ? join(EVIDENCE, info.project.name) : null;
  if (evidenceDir) await mkdir(evidenceDir, { recursive: true });

  await page.goto('/certification-office');
  await roomReady(page);
  await engageGameWindow(page);
  await expect(page.locator('.tqw-app')).toHaveAttribute('data-station', 'machine');
  const places = page.locator('.tqw-places');
  if (!mobile) {
    await setPlacesOpen(page, true);
  } else {
    await setPlacesOpen(page, false);
  }

  for (const station of STATIONS) {
    if (station !== 'machine') await nextStation(page, mobile);
    await readyForStation(page, station);
    if (mobile) await setPlacesOpen(page, true);

    const dock = await boxOf(page.locator('.tqw-desk-actions'));
    expect(dock, `${station} stamp dock should be rendered`).not.toBeNull();
    const panel = await boxOf(places);
    expect(panel, `${station} Places panel should be rendered`).not.toBeNull();
    if (!hasClearance(panel!, dock!)) violations.push({ station, control: 'Places panel (16px dock clearance)', box: panel!, dock: dock! });

    if (mobile) await setPlacesOpen(page, false);
    const chevrons = mobile ? await boxOf(page.getByRole('group', { name: 'Office stations' })) : null;
    let target: Box | null = null;
    if (mobile) {
      expect(chevrons, `${station} station chevrons should be visible`).not.toBeNull();
      if (!hasClearance(chevrons!, dock!)) violations.push({ station, control: 'station chevrons (16px dock clearance)', box: chevrons!, dock: dock! });
      target = await projectedTarget(page, station);
      if (intersects(chevrons!, target)) violations.push({ station, control: 'station chevrons', box: chevrons!, dock: target });
    }

    const capture = { station, panel, dock, chevrons, projectedTarget: target };
    measurements.push(capture);
    if (evidenceDir) await page.screenshot({ path: join(evidenceDir, `${station}.png`), animations: 'disabled' });
  }

  if (evidenceDir) await writeFile(join(evidenceDir, 'measurements.json'), JSON.stringify({ project: info.project.name, violations, measurements }, null, 2));
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
});

test('Mobile Places never blocks the central look-drag start', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'the fixed drag start is a Pixel 7 touch interaction');
  test.setTimeout(180_000);

  await page.goto('/certification-office');
  await roomReady(page);
  await engageGameWindow(page);
  const app = page.locator('.tqw-app');
  await expect(app).toHaveAttribute('data-station', 'machine');
  await setPlacesOpen(page, true);
  await page.getByRole('button', { name: 'View the records', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(app).toHaveAttribute('data-station', 'records');
  await expect(page.locator('.tqw-canvas')).toHaveAttribute('data-moving', 'false');

  const lookStartHit = async () => page.locator('.tqw-canvas').evaluate(canvas => {
    const box = canvas.getBoundingClientRect();
    const target = document.elementFromPoint(box.left + box.width * .5, box.top + box.height * .2);
    const classes = typeof target?.className === 'string' ? target.className : '';
    return { isCanvas: target === canvas || Boolean(target && canvas.contains(target)), description: target ? `${target.tagName.toLowerCase()}.${classes}` : 'none' };
  });
  const openHit = await lookStartHit();
  expect(openHit, `Pixel 7 look drag starts on ${openHit.description} with Places expanded`).toMatchObject({ isCanvas: true });
  await setPlacesOpen(page, false);
  const closedHit = await lookStartHit();
  expect(closedHit, `Pixel 7 look drag starts on ${closedHit.description} after Places closes`).toMatchObject({ isCanvas: true });
});
