import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const OFFICE = '/certification-office';
type Station = 'desk' | 'machine' | 'certificate' | 'service';
const POSITION: Record<Station, readonly [number, number]> = {
  desk: [-1, 2.9], machine: [.2, .25], certificate: [-2.6, 3.9], service: [2.8, 5.3],
};
const AFTER_MACHINE = ['certificate', 'service', 'desk'] as const;

async function ready(page: Page): Promise<void> {
  await expect(page.locator('.tqw-chamber-host')).toHaveAttribute('data-ready', 'true', { timeout: 90_000 });
}

async function expectStation(page: Page, station: Station): Promise<void> {
  await expect(page.locator('.tqw-app')).toHaveAttribute('data-station', station);
  await expect.poll(async () => {
    const pose = (await page.locator('.tqw-canvas').getAttribute('data-pose'))?.split(',').map(Number);
    return pose?.length === 4 ? [Number(pose[0]!.toFixed(2)), Number(pose[1]!.toFixed(2))] : null;
  }).toEqual(POSITION[station]);
}

async function swipeStation(page: Page, direction: 'forward' | 'back'): Promise<void> {
  const canvas = page.locator('.tqw-canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const client = await page.context().newCDPSession(page);
  const x = box!.x + box!.width * 0.08;
  const startY = box!.y + box!.height * 0.25;
  const endY = startY + (direction === 'forward' ? -100 : 100);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ id: 1, x, y: startY, radiusX: 1, radiusY: 1, force: 1 }],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove', touchPoints: [{ id: 1, x, y: endY, radiusX: 1, radiusY: 1, force: 1 }],
  });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.detach();
}

async function stepForward(page: Page, mobile: boolean): Promise<void> {
  if (mobile) await swipeStation(page, 'forward');
  else await page.keyboard.press('w');
}

test('opens on the core area, visits every authored station, and returns to the corridor', async ({ page }, info) => {
  test.setTimeout(300_000);
  const mobile = info.project.name === 'mobile';
  await page.goto(OFFICE);
  await expect(page.locator('.tqw-app')).toHaveAttribute('data-mode', '3d');
  await ready(page);
  await expectStation(page, 'machine');
  await expect(page.locator('.tqw-game__mode')).toHaveText('Stations');
  await expect(page.getByRole('button', { name: 'Return to the corridor' })).toBeVisible();
  await info.attach('office-core-start', { body: await page.screenshot(), contentType: 'image/png' });
  const evidenceDir = process.env['TQW_EVIDENCE_DIR'];
  if (process.env['TQW_EVIDENCE'] === '1' && evidenceDir) {
    await mkdir(evidenceDir, { recursive: true });
    await page.screenshot({ path: join(evidenceDir, `${info.project.name}-office-core-start.png`), animations: 'disabled' });
  }

  if (mobile) {
    await page.getByRole('button', { name: 'Previous view' }).tap();
    await expectStation(page, 'desk');
    await page.getByRole('button', { name: 'Next view' }).tap();
    await expectStation(page, 'machine');
    for (const station of ['certificate', 'service'] as const) {
      await stepForward(page, true);
      await expectStation(page, station);
      await expect(page.locator('.tqw-app')).toHaveAttribute('data-stamps', '0');
      await expect(page.getByRole('button', { name: 'Return to the corridor' })).toBeVisible();
    }
  } else {
    for (const station of AFTER_MACHINE) {
      await stepForward(page, false);
      await expectStation(page, station);
      await expect(page.locator('.tqw-app')).toHaveAttribute('data-stamps', '0');
      await expect(page.getByRole('button', { name: 'Return to the corridor' })).toBeVisible();
    }
  }

  if (mobile) {
    await swipeStation(page, 'back');
    await expectStation(page, 'certificate');
  } else {
    await page.keyboard.press('s');
    await expectStation(page, 'service');
  }

  await page.getByRole('button', { name: 'Return to the corridor' }).click();
  await expect(page.locator('.tqw-site')).toHaveAttribute('data-spine', 'corridor');
});

test('free walking input cannot move off authored stations, and a held step advances once', async ({ page }, info) => {
  test.setTimeout(180_000);
  await page.goto(OFFICE);
  await ready(page);
  const canvas = page.locator('.tqw-canvas');
  const before = await canvas.getAttribute('data-pose');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(350);
  await expect(canvas).toHaveAttribute('data-pose', before!);
  await expectStation(page, 'machine');

  if (info.project.name === 'mobile') {
    await swipeStation(page, 'forward');
    await expectStation(page, 'certificate');
    const stationPose = await canvas.getAttribute('data-pose');
    await page.waitForTimeout(700);
    await expect(canvas).toHaveAttribute('data-pose', stationPose!);
    return;
  }
  await page.keyboard.down('w');
  await expectStation(page, 'certificate');
  const stationPose = await canvas.getAttribute('data-pose');
  await page.waitForTimeout(700);
  await expect(canvas).toHaveAttribute('data-pose', stationPose!);
  await page.keyboard.up('w');
});
