import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { APARTMENT_STAGE, STATIONS, VISIBLE_HALF_ARC_DEG, PITCH_LIMIT_DEG, withinWalkableStage } from '../src/chambers/apartment/stage.ts';
import { disableWebGL } from './helpers.ts';

const ready = async (page: import('@playwright/test').Page) => {
  await expect(page.locator('.tqw-site')).toHaveAttribute('data-spine', 'chamber', { timeout: 60_000 });
  await expect(page.locator('.tqw-apartment')).toHaveAttribute('data-room-ready', 'true', { timeout: 60_000 });
};

async function assertMetalRenderer(page: import('@playwright/test').Page): Promise<void> {
  if (process.env['TQW_E2E_ANGLE'] !== 'metal') return;
  const renderer = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl && extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null;
  });
  console.info(`Apartment WebGL renderer ${String(renderer)}`);
  expect(String(renderer), 'The Apartment capture should use its real Metal renderer').toMatch(/metal/i);
}

test.describe('The Apartment', () => {
  test.setTimeout(120_000);

  test('reports ready only after the model and baked light are on screen', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/apartment?quality=high&stageProbe=1');
    await ready(page);
    await assertMetalRenderer(page);
    await expect(page.locator('.tqw-chamber-host')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('.tqw-apartment-canvas')).toHaveAttribute('data-frame-ready', 'true');
    await expect(page.locator('.tqw-apartment-canvas canvas')).toHaveAttribute('data-baked', 'apartment');
    expect(errors).toEqual([]);
  });

  test('has a keyboard action for all twelve scene objects', async ({ page }) => {
    await page.goto('/apartment?quality=high');
    await ready(page);
    const places = page.locator('.tqw-apartment-places');
    await places.locator('summary').focus();
    await page.keyboard.press('Enter');
    const objects = places.locator('[data-room-object]');
    await expect(objects).toHaveCount(12);
    for (let index = 0; index < 12; index += 1) {
      await expect(objects.nth(index).getByRole('button').first()).toBeVisible();
    }
    await expect(objects.locator('[data-object-action="phone"]')).toBeVisible();
    await expect(objects.locator('[data-object-action="underside"]')).toBeVisible();
  });

  test('reaches the reply and investigation paths through the phone', async ({ page }) => {
    await page.goto('/apartment?quality=high');
    await ready(page);
    const room = page.locator('.tqw-apartment');
    const places = page.locator('.tqw-apartment-places');
    await places.locator('summary').click();
    const phone = places.locator('[data-room-object="phone"]');
    const read = phone.getByRole('button', { name: 'Read the phone' });
    await read.click();
    await expect(room).toHaveAttribute('data-reply-set', 'default');
    await expect(phone.locator('[data-reply-choice]')).toHaveCount(3);
    await phone.locator('[data-reply-choice]').first().click();
    await expect(room).toHaveAttribute('data-path', 'engage');

    await page.goto('/apartment?quality=high');
    await ready(page);
    await page.locator('.tqw-apartment-places summary').click();
    const freshPhone = page.locator('[data-room-object="phone"]');
    for (let count = 0; count < 3; count += 1) await freshPhone.getByRole('button', { name: 'Read the phone' }).click();
    await expect(page.locator('.tqw-apartment')).toHaveAttribute('data-path', 'investigate');
    await expect(page.locator('.tqw-apartment')).toHaveAttribute('data-reply-set', 'revised');
  });

  test('reaches the pause path without an answer or required interaction', async ({ page }) => {
    await page.goto('/apartment?quality=high');
    await ready(page);
    await expect(page.locator('.tqw-apartment')).toHaveAttribute('data-path', 'stop', { timeout: 25_000 });
    await expect(page.locator('.tqw-apartment')).toHaveAttribute('data-elevator', 'available');
    await expect(page.locator('.tqw-apartment')).toHaveAttribute('data-platform-intact', 'true');
  });

  test('keeps the white-grey kettle wisp quiet until the switch is touched', async ({ page }) => {
    await page.goto('/apartment?quality=high&stageProbe=1');
    await ready(page);
    await assertMetalRenderer(page);
    const visible = () => page.evaluate(() => {
      const scene = (window as Window & {
        __tqwScene?: { getObjectByName(name: string): { visible: boolean } | undefined };
      }).__tqwScene;
      return scene?.getObjectByName('Kettle_Smoke')?.visible ?? false;
    });
    await expect.poll(visible).toBe(false);
    const places = page.locator('.tqw-apartment-places');
    await places.locator('summary').click();
    await places.locator('[data-room-object="kettle"]').getByRole('button', { name: 'Test the switch' }).click();
    await expect.poll(visible).toBe(true);
  });

  test('offers the same actions in text mode when WebGL is unavailable', async ({ page }) => {
    await disableWebGL(page);
    await page.goto('/apartment?quality=high');
    await ready(page);
    const room = page.locator('.tqw-apartment[data-mode="text"]');
    await expect(room).toBeVisible();
    await room.locator('.tqw-apartment-places summary').click();
    await expect(room.locator('[data-room-object]')).toHaveCount(12);
    await expect(room.getByRole('button', { name: 'Read the phone' })).toBeVisible();
  });

  test('keeps all stations framed and sweeps the complete visible stage', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await page.goto('/apartment?quality=high&stageProbe=1');
    await ready(page);
    const stationReadings = await page.evaluate(({ stations, visibleHalfArc }) => {
      type View = { magentaPixels: number; calls: number; triangles: number; lights: number };
      type Probe = {
        camera: { fov: number; aspect: number };
        setPose(id: 'threshold' | 'table' | 'kitchen' | 'window' | 'sofa', yaw: number, pitch?: number): number;
        measureMagenta(restore?: boolean): View;
      };
      const probe = (window as Window & { __apartmentStageProbe?: Probe }).__apartmentStageProbe;
      if (!probe) throw new Error('The Apartment stage probe did not mount');
      const horizontalFov = 2 * Math.atan(Math.tan((probe.camera.fov * Math.PI) / 360) * probe.camera.aspect) * 180 / Math.PI;
      const limit = visibleHalfArc - horizontalFov / 2;
      return stations.flatMap((station) => [-1, 0, 1].map((sign) => {
        const appliedYaw = probe.setPose(station.id, sign * limit, station.pitchDeg);
        return { station: station.id, sign, limit, appliedYaw, pitch: station.pitchDeg, ...probe.measureMagenta() };
      }));
    }, { stations: STATIONS, visibleHalfArc: VISIBLE_HALF_ARC_DEG });
    expect(stationReadings).toHaveLength(STATIONS.length * 3);
    const evidenceDir = process.env['TQW_EVIDENCE_DIR'];
    if (evidenceDir) {
      await mkdir(evidenceDir, { recursive: true });
      for (const reading of stationReadings) {
        await page.evaluate(({ id, yaw }) => {
          const probe = (window as Window & { __apartmentStageProbe?: { setPose(id: string, yaw: number): number } }).__apartmentStageProbe;
          if (!probe) throw new Error('The Apartment stage probe did not mount');
          probe.setPose(id, yaw);
        }, { id: reading.station, yaw: reading.appliedYaw });
        const view = reading.sign === 0 ? 'center' : reading.sign < 0 ? 'yaw-left' : 'yaw-right';
        await page.screenshot({ path: join(evidenceDir, `${testInfo.project.name}-${reading.station}-${view}.png`), animations: 'disabled' });
      }
    }

    for (const reading of stationReadings) {
      expect(reading.appliedYaw).toBeCloseTo(reading.sign * reading.limit, 4);
      expect(reading.magentaPixels, `${reading.station} yaw ${reading.sign}`).toBe(0);
      expect(reading.calls, `${reading.station} draw calls`).toBeLessThanOrEqual(150);
      expect(reading.triangles, `${reading.station} triangles`).toBeLessThanOrEqual(250_000);
      expect(reading.lights, `${reading.station} lights`).toBeLessThanOrEqual(6);
    }

    const grid: { x: number; z: number }[] = [];
    const [west, south] = APARTMENT_STAGE.walkable[0];
    const [east, north] = APARTMENT_STAGE.walkable[2];
    for (let x = Math.ceil(west * 2) / 2; x <= east; x += 0.5) {
      for (let z = Math.ceil(south * 2) / 2; z <= north; z += 0.5) {
        if (withinWalkableStage(x, z)) grid.push({ x, z });
      }
    }
    expect(grid.length).toBeGreaterThan(40);
    const readings = await page.evaluate(({ positions, visibleHalfArc, pitchLimit }) => {
      type Pose = { x: number; z: number };
      type Probe = {
        camera: { fov: number; aspect: number };
        setSweepPixelRatio(value: number): void;
        setPoseAt(position: Pose, heading: number, yaw: number, pitch: number): { appliedYaw: number; appliedPitch: number };
        measureMagenta(restore?: boolean): { magentaPixels: number; calls: number; triangles: number; lights: number };
      };
      const probe = (window as Window & { __apartmentStageProbe?: Probe }).__apartmentStageProbe;
      if (!probe) throw new Error('The Apartment stage probe did not mount');
      probe.setSweepPixelRatio(0.08);
      const horizontalFov = 2 * Math.atan(Math.tan((probe.camera.fov * Math.PI) / 360) * probe.camera.aspect) * 180 / Math.PI;
      const limit = visibleHalfArc - horizontalFov / 2;
      const results = [];
      for (const position of positions) {
        for (const yaw of [-limit, 0, limit]) {
          for (const pitch of [-pitchLimit, 0, pitchLimit]) {
            const pose = probe.setPoseAt(position, 180, yaw, pitch);
            const view = probe.measureMagenta(false);
            results.push({ x: position.x, z: position.z, yaw, pitch, ...pose, ...view });
          }
        }
      }
      return results;
    }, { positions: grid, visibleHalfArc: VISIBLE_HALF_ARC_DEG, pitchLimit: PITCH_LIMIT_DEG });
    expect(readings).toHaveLength(grid.length * 9);
    for (const reading of readings) {
      expect(reading.appliedYaw).toBeCloseTo(reading.yaw, 4);
      expect(reading.appliedPitch).toBe(reading.pitch);
      expect(reading.magentaPixels, `hole at ${reading.x},${reading.z}, yaw ${reading.yaw}, pitch ${reading.pitch}`).toBe(0);
      expect(reading.calls).toBeLessThanOrEqual(150);
      expect(reading.triangles).toBeLessThanOrEqual(250_000);
      expect(reading.lights).toBeLessThanOrEqual(6);
    }

    const allReadings = [...stationReadings, ...readings];
    const measured = {
      device: testInfo.project.name,
      stations: STATIONS.length,
      stationViews: stationReadings.length,
      walkablePositions: grid.length,
      gridViews: readings.length,
      yawLimitDeg: Number(Math.max(...stationReadings.map((reading) => Math.abs(reading.limit))).toFixed(2)),
      pitchLimitDeg: PITCH_LIMIT_DEG,
      maxDrawCalls: Math.max(...allReadings.map((reading) => reading.calls)),
      maxTriangles: Math.max(...allReadings.map((reading) => reading.triangles)),
      maxLights: Math.max(...allReadings.map((reading) => reading.lights)),
      maxMagentaPixels: Math.max(...allReadings.map((reading) => reading.magentaPixels)),
    };
    console.info(`Apartment stage measurements ${JSON.stringify(measured)}`);
    if (evidenceDir) await writeFile(join(evidenceDir, `${testInfo.project.name}-budgets.json`), `${JSON.stringify(measured, null, 2)}\n`);
  });
});
