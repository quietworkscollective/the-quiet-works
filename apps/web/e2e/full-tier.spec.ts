import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PITCH_LIMIT_DEG, STATIONS, VISIBLE_HALF_ARC_DEG, withinWalkableStage } from '../src/chambers/annex-codex/stage.ts';
import { door, expectSpine, site } from './helpers.ts';

async function readCredit(roomDirectory: 'exchange' | 'annex-codex'): Promise<string> {
  const record = JSON.parse(await readFile(
    new URL(`../src/chambers/${roomDirectory}/provenance.json`, import.meta.url),
    'utf8',
  )) as { credit: string };
  return record.credit;
}

/**
 * The test browser renders in software, which the site detects and answers with its lite tier: no
 * finishing stack, no atmosphere. Visitors on real GPUs get the full tier, so every suite that only
 * ever saw the lite tier missed what the stack changes. `?quality=high` forces the full tier here.
 *
 * Guards a real failure: the Office waits for two frames the visitor has seen before it opens, and
 * on the full tier the scene is drawn offscreen into the stack's buffer first, so it never opened.
 */
test.describe('the full rendering tier', () => {
  test.setTimeout(120_000);

  for (const path of ['/certification-office', '/', '/the-exchange']) {
    test(`opens ${path} with the finishing stack mounted`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${path}?quality=high`);
      const site = page.locator('.tqw-site');
      if (path === '/') await expect(site).toHaveAttribute('data-spine', /entrance|corridor/, { timeout: 60_000 });
      else await expect(site).toHaveAttribute('data-spine', 'chamber', { timeout: 60_000 });
      if (path === '/the-exchange') {
        const stage = page.locator('.tqw-exchange-canvas');
        await expect(stage).toHaveAttribute('data-frame-ready', 'true', { timeout: 60_000 });
        await expect(page.locator('.tqw-exchange-canvas canvas')).toHaveAttribute('data-baked', 'exchange', { timeout: 60_000 });
      }
      expect(errors).toEqual([]);
    });
  }

  for (const room of [
    { title: 'The Exchange', path: '/the-exchange', ready: '.tqw-exchange-canvas' },
    { title: 'The Outline Room', path: '/outline-room', ready: '.tqw-outline-room' },
  ]) {
    test(`opens ${room.title} through its corridor door`, async ({ page }) => {
      await page.goto('/?quality=high');
      await expectSpine(page, 'entrance');
      await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2.6));
      await expectSpine(page, 'corridor');
      await page.getByRole('link', { name: 'Enter The Quiet Works' }).click();
      await expect(site(page)).toHaveAttribute('data-engaged', 'true');

      await door(page, room.title, 'open').focus();
      await page.keyboard.press('Enter');
      await expectSpine(page, 'chamber');
      await expect(page).toHaveURL(new RegExp(room.path));
      await expect(page.locator('.tqw-chamber-host')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
      await expect(page.locator(room.ready)).toBeVisible();
    });
  }

  test('opens the Outline Room after its scene and baked light are ready', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/outline-room?quality=high');
    await expect(page.locator('.tqw-site')).toHaveAttribute('data-spine', 'chamber', { timeout: 60_000 });
    await expect(page.locator('.tqw-outline-room')).toHaveAttribute('data-room-ready', 'true', { timeout: 60_000 });
    if (process.env.TQW_E2E_ANGLE === 'metal') {
      const renderer = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
        const extension = gl?.getExtension('WEBGL_debug_renderer_info');
        return gl && extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null;
      });
      expect(String(renderer), 'the browser should expose its Metal WebGL renderer').toMatch(/metal/i);
    }
    expect(errors).toEqual([]);
  });

  test('has a keyboard action for every object and reaches the tracing path', async ({ page }) => {
    await page.goto('/outline-room?quality=high');
    const room = page.locator('.tqw-outline-room');
    await expect(room).toHaveAttribute('data-room-ready', 'true', { timeout: 60_000 });
    await page.getByText('Places and actions', { exact: true }).click();
    const objects = room.locator('[data-room-object]');
    await expect(objects).toHaveCount(12);
    for (let index = 0; index < 12; index += 1) {
      await expect(objects.nth(index).getByRole('button').first()).toBeVisible();
    }

    await page.getByRole('button', { name: 'Trace Tin A' }).click();
    await expect(room).toHaveAttribute('data-active-trace', 'tin-a');
    await expect(room).toHaveAttribute('data-line-tin-a', 'full', { timeout: 8_000 });
    await page.getByRole('button', { name: 'Trace Tin B' }).click();
    await expect(room).toHaveAttribute('data-active-trace', 'tin-b');
    await expect(room).toHaveAttribute('data-path', 'engage', { timeout: 8_000 });
  });

  test('reaches the direct-inspection and twelve-second stop paths', async ({ page }) => {
    await page.goto('/outline-room?quality=high');
    const room = page.locator('.tqw-outline-room');
    await expect(room).toHaveAttribute('data-room-ready', 'true', { timeout: 60_000 });
    await page.getByText('Places and actions', { exact: true }).click();
    await page.getByRole('button', { name: 'Lift comparison hood' }).click();
    await expect(room).toHaveAttribute('data-path', 'investigate');

    await page.goto('/outline-room?quality=high');
    const freshRoom = page.locator('.tqw-outline-room');
    await expect(freshRoom).toHaveAttribute('data-room-ready', 'true', { timeout: 60_000 });
    await expect(freshRoom).toHaveAttribute('data-path', 'stop', { timeout: 15_000 });
  });

  test('shows the reviewed machine-made credit from each room record', async ({ page }) => {
    const exchangeCredit = await readCredit('exchange');
    const outlineCredit = await readCredit('annex-codex');
    await page.goto('/the-exchange?quality=high');
    await expect(page.getByText(exchangeCredit, { exact: true })).toBeVisible();

    await page.goto('/outline-room?quality=high');
    await expect(page.locator('.tqw-outline-room')).toHaveAttribute('data-room-ready', 'true', { timeout: 60_000 });
    await page.getByText('Places and actions', { exact: true }).click();
    await page.getByRole('button', { name: 'Read provenance plate' }).click();
    await expect(page.getByText(outlineCredit, { exact: true })).toBeVisible();
  });

  test('sweeps the walkable stage at its yaw and pitch limits and captures every station', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await page.goto('/outline-room?quality=high');
    await expect(page.locator('.tqw-outline-room')).toHaveAttribute('data-room-ready', 'true', { timeout: 60_000 });
    const stationReadings = await page.evaluate(({ stations, visibleHalfArc }) => {
      type Probe = {
        camera: { fov: number; aspect: number };
        setPose(station: 'arrival' | 'bench' | 'west' | 'rear' | 'east', yaw: number, pitch?: number): number;
        measureMagenta(restore?: boolean): { magentaPixels: number; calls: number; triangles: number; lights: number };
      };
      const probe = (window as Window & { __outlineStageProbe?: Probe }).__outlineStageProbe;
      if (!probe) throw new Error('The Outline Room stage probe did not mount');
      const horizontalFov = (2 * Math.atan(Math.tan((probe.camera.fov * Math.PI) / 360) * probe.camera.aspect) * 180) / Math.PI;
      const limit = visibleHalfArc - horizontalFov / 2;
      const readings = [];
      for (const station of stations) {
        for (const sign of [0, -1, 1] as const) {
          const appliedYaw = probe.setPose(station.id, sign * limit, -2);
          const view = probe.measureMagenta();
          readings.push({ station: station.id, sign, limit, appliedYaw, ...view });
        }
      }
      return readings;
    }, { stations: STATIONS, visibleHalfArc: VISIBLE_HALF_ARC_DEG });
    expect(stationReadings).toHaveLength(STATIONS.length * 3);
    const stationById = new Map(STATIONS.map((station) => [station.id, station]));
    for (const reading of stationReadings) {
      expect(reading.appliedYaw, `${reading.station} yaw ${reading.sign}`).toBeCloseTo(reading.sign * reading.limit, 5);
      expect(reading.magentaPixels, `${reading.station} yaw ${reading.sign} magenta hole sweep`).toBe(0);
      expect(reading.calls, `${reading.station} draw calls`).toBeLessThanOrEqual(150);
      expect(reading.triangles, `${reading.station} triangles`).toBeLessThanOrEqual(250_000);
      expect(reading.lights, `${reading.station} lights`).toBeLessThanOrEqual(6);
    }

    const evidenceDir = process.env['TQW_EVIDENCE_DIR'];
    if (evidenceDir) {
      await mkdir(evidenceDir, { recursive: true });
      for (const reading of stationReadings) {
        const station = stationById.get(reading.station);
        if (!station) throw new Error(`Unknown station ${reading.station}`);
        await page.evaluate(({ id, yaw }) => {
          const probe = (window as Window & { __outlineStageProbe?: { setPose(station: 'arrival' | 'bench' | 'west' | 'rear' | 'east', yaw: number): number } }).__outlineStageProbe;
          if (!probe) throw new Error('The Outline Room stage probe did not mount');
          probe.setPose(id, yaw);
        }, { id: reading.station, yaw: reading.appliedYaw });
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
        const view = reading.sign === 0 ? 'center' : reading.sign < 0 ? 'yaw-left' : 'yaw-right';
        await page.screenshot({ path: join(evidenceDir, `${testInfo.project.name}-${reading.station}-${view}.png`), animations: 'disabled' });
      }
    }

    await page.evaluate((pixelRatio) => {
      const probe = (window as Window & { __outlineStageProbe?: { setSweepPixelRatio(pixelRatio: number): void; setStageShellOnly(enabled: boolean): void } }).__outlineStageProbe;
      if (!probe) throw new Error('The Outline Room stage probe did not mount');
      probe.setSweepPixelRatio(pixelRatio);
      probe.setStageShellOnly(true);
    }, testInfo.project.name === 'mobile' ? 0.18 : 0.1);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

    const grid = [] as { x: number; z: number }[];
    for (let xIndex = 0; xIndex <= 7; xIndex += 1) {
      const x = -2.7 + xIndex * 0.75;
      if (x > 2.7) continue;
      for (let zIndex = 0; zIndex <= 8; zIndex += 1) {
        const z = 0.55 + zIndex * 0.75;
        if (z <= 6.95 && withinWalkableStage(x, z)) grid.push({ x, z });
      }
    }
    const yawGridReadings = await page.evaluate(({ positions, visibleHalfArc }) => {
      type Probe = {
        camera: { fov: number; aspect: number };
        setPoseAt(position: { x: number; z: number }, headingDeg: number, yaw: number, pitch: number): { appliedYaw: number; appliedPitch: number };
        setSweepPixelRatio(pixelRatio: number): void;
        setStageShellOnly(enabled: boolean): void;
        measureMagenta(restore?: boolean): { magentaPixels: number; calls: number; triangles: number; lights: number };
      };
      const probe = (window as Window & { __outlineStageProbe?: Probe }).__outlineStageProbe;
      if (!probe) throw new Error('The Outline Room stage probe did not mount');
      const halfVertical = (probe.camera.fov * Math.PI) / 360;
      const horizontalFov = (2 * Math.atan(Math.tan(halfVertical) * probe.camera.aspect) * 180) / Math.PI;
      const yawLimit = visibleHalfArc - horizontalFov / 2;
      const readings = [];
      for (const position of positions) {
        for (const yaw of [-yawLimit, 0, yawLimit]) {
          const pose = probe.setPoseAt(position, 180, yaw, 0);
          const view = probe.measureMagenta(false);
          readings.push({ x: position.x, z: position.z, yaw, pitch: 0, appliedYaw: pose.appliedYaw, appliedPitch: pose.appliedPitch, magentaPixels: view.magentaPixels, calls: view.calls, triangles: view.triangles, lights: view.lights });
        }
      }
      return readings;
    }, { positions: grid, visibleHalfArc: VISIBLE_HALF_ARC_DEG });
    expect(grid.length).toBeGreaterThan(50);
    expect(yawGridReadings).toHaveLength(grid.length * 3);

    const pitchSamples = [
      { x: -2.6, z: 0.65 },
      { x: 2.6, z: 0.65 },
      { x: -2.6, z: 6.85 },
      { x: 2.6, z: 6.85 },
      { x: -1.8, z: 3.6 },
      { x: 1.8, z: 3.6 },
    ];
    for (const position of pitchSamples) expect(withinWalkableStage(position.x, position.z)).toBe(true);
    const pitchLimitReadings = await page.evaluate(({ positions, visibleHalfArc, pitchLimit }) => {
      type Probe = {
        camera: { fov: number; aspect: number };
        setPoseAt(position: { x: number; z: number }, headingDeg: number, yaw: number, pitch: number): { appliedYaw: number; appliedPitch: number };
        measureMagenta(restore?: boolean): { magentaPixels: number; calls: number; triangles: number; lights: number };
      };
      const probe = (window as Window & { __outlineStageProbe?: Probe }).__outlineStageProbe;
      if (!probe) throw new Error('The Outline Room stage probe did not mount');
      const halfVertical = (probe.camera.fov * Math.PI) / 360;
      const horizontalFov = (2 * Math.atan(Math.tan(halfVertical) * probe.camera.aspect) * 180) / Math.PI;
      const yawLimit = visibleHalfArc - horizontalFov / 2;
      const readings = [];
      for (const position of positions) {
        for (const yaw of [-yawLimit, 0, yawLimit]) {
          for (const pitch of [-pitchLimit, 0, pitchLimit]) {
            const pose = probe.setPoseAt(position, 180, yaw, pitch);
            const view = probe.measureMagenta(false);
            readings.push({ x: position.x, z: position.z, yaw, pitch, appliedYaw: pose.appliedYaw, appliedPitch: pose.appliedPitch, magentaPixels: view.magentaPixels, calls: view.calls, triangles: view.triangles, lights: view.lights });
          }
        }
      }
      return readings;
    }, { positions: pitchSamples, visibleHalfArc: VISIBLE_HALF_ARC_DEG, pitchLimit: PITCH_LIMIT_DEG });
    expect(pitchLimitReadings).toHaveLength(pitchSamples.length * 9);

    for (const reading of [...yawGridReadings, ...pitchLimitReadings]) {
      expect(reading.appliedYaw, `grid ${reading.x},${reading.z} yaw ${reading.yaw}`).toBeCloseTo(reading.yaw, 5);
      expect(reading.appliedPitch, `grid ${reading.x},${reading.z} pitch ${reading.pitch}`).toBe(reading.pitch);
      expect(reading.magentaPixels, `grid ${reading.x},${reading.z} yaw ${reading.yaw} pitch ${reading.pitch}`).toBe(0);
      expect(reading.calls, `grid ${reading.x},${reading.z} draw calls`).toBeLessThanOrEqual(150);
      expect(reading.triangles, `grid ${reading.x},${reading.z} triangles`).toBeLessThanOrEqual(250_000);
      expect(reading.lights, `grid ${reading.x},${reading.z} lights`).toBeLessThanOrEqual(6);
    }
    if (evidenceDir) {
      const readings = [...stationReadings, ...yawGridReadings, ...pitchLimitReadings];
      await writeFile(join(evidenceDir, `${testInfo.project.name}-stage-budget.json`), JSON.stringify({
        project: testInfo.project.name,
        fullSceneStationViews: stationReadings.length,
        structuralGridPositions: grid.length,
        yawGridViews: yawGridReadings.length,
        pitchLimitSamplePositions: pitchSamples.length,
        pitchLimitViews: pitchLimitReadings.length,
        samples: readings.length,
        maxDrawCalls: Math.max(...readings.map((reading) => reading.calls)),
        maxTriangles: Math.max(...readings.map((reading) => reading.triangles)),
        maxLights: Math.max(...readings.map((reading) => reading.lights)),
        maxMagentaPixels: Math.max(...readings.map((reading) => reading.magentaPixels)),
      }, null, 2) + '\n');
    }
    await page.evaluate(() => (window as Window & { __outlineStageProbe?: { setStageShellOnly(enabled: boolean): void } }).__outlineStageProbe?.setStageShellOnly(false));
  });
});
