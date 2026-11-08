import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const STATIONS = [
  { id: 'winding-control', phoneCameraZ: '1.75', label: 'Winding control' },
  { id: 'date-display', phoneCameraZ: '3.2', label: 'Date display' },
  { id: 'carriage', phoneCameraZ: '2.9', label: 'Carriage' },
  { id: 'service-hatch', phoneCameraZ: '3', label: 'Service hatch' },
] as const;

async function readyRoom(page: Page): Promise<void> {
  await page.goto('/tomorrow-engine');
  await expect(page.locator('.tqw-tomorrow-engine[data-mode="3d"]')).toHaveAttribute('data-room-ready', 'true', { timeout: 60_000 });
  await page.waitForFunction(() => !!window.__tqwTomorrowEngine);
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset['baked'] === 'tomorrow-engine');
}

test('captures each fixed station and sweeps for magenta pixels within the room budgets', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await readyRoom(page);
  const captureRoot = process.env['TQW_CAPTURE_ROOT'] ?? testInfo.outputPath('captures');
  await mkdir(captureRoot, { recursive: true });
  const device = testInfo.project.name === 'mobile' ? 'pixel-7' : 'desktop';

  for (const station of STATIONS) {
    await page.getByRole('button', { name: station.label, exact: true }).click();
    await expect(page.locator('.tqw-tomorrow-engine')).toHaveAttribute('data-station', station.id);
    if (device === 'pixel-7') await expect(page.locator('.tqw-tomorrow-engine canvas')).toHaveAttribute('data-camera-z', station.phoneCameraZ);
    const leave = page.locator('.tqw-tomorrow-engine').getByRole('button', { name: 'Leave', exact: true });
    const returnToCorridor = page.locator('.tqw-game__tool--return');
    await expect(leave).toBeVisible();
    await expect(leave).toHaveAttribute('title', 'Return to the corridor');
    await expect(returnToCorridor).toBeHidden();
    await expect(page.locator('.tqw-game__leave')).toBeHidden();
    await expect(page.locator('canvas')).toHaveAttribute('data-camera-station', station.id);
    const result = await page.evaluate(() => {
      const room = window.__tqwTomorrowEngine;
      if (!room) throw new Error('Missing fixed-stage inspection hook');
      return { magenta: room.clearAndCountMagenta(), stats: room.stats() };
    });
    console.info(`[Tomorrow Engine budget] ${device} ${station.id}: ${JSON.stringify(result)}`);
    expect(result.magenta, `${station.id} stage sweep`).toBe(0);
    expect(result.stats.calls, `${station.id} draw calls`).toBeLessThanOrEqual(150);
    expect(result.stats.triangles, `${station.id} visible triangles`).toBeLessThanOrEqual(250_000);
    expect(result.stats.lights, `${station.id} lights`).toBeLessThanOrEqual(6);
    await page.screenshot({ path: join(captureRoot, `${device}-${station.id}.png`) });
  }
});
