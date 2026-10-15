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
    // Unreleased rooms (sealed in production until the founder approves them) run as visible
    // extended diagnostics, so they never block shipping; they return to core on approval.
    test(`opens ${room.title} through its corridor door`, { tag: '@extended' }, async ({ page }) => {
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

  // Unreleased rooms (sealed in production until the founder approves them) run as visible
  // extended diagnostics, so they never block shipping; they return to core on approval.
  test('holds the Apartment threshold until its baked scene reports ready', { tag: '@extended' }, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?quality=high');
    await expectSpine(page, 'entrance');
    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2.6));
    await expectSpine(page, 'corridor');
    await page.getByRole('link', { name: 'Enter The Quiet Works' }).click();
    await expect(site(page)).toHaveAttribute('data-engaged', 'true');

    let atlasRequested = false;
    let releaseAtlas: (() => void) | undefined;
    const held = new Promise<void>((resolve) => { releaseAtlas = resolve; });
    await page.route('**/apartment-0*.webp', async (route) => {
      atlasRequested = true;
      await held;
      await route.continue();
    });
    try {
      await door(page, 'The Apartment', 'open').focus();
      await page.keyboard.press('Enter');
      // On the Pixel 7 profile, allow the high-tier model to finish parsing before the held atlas request.
      await expect.poll(() => atlasRequested, { timeout: 30_000 }).toBe(true);
      await expect(site(page)).toHaveAttribute('data-spine', 'threshold');
      await expect(site(page)).toHaveAttribute('data-chamber', 'apartment');
      await expect(page.locator('.tqw-apartment')).toHaveAttribute('data-room-ready', 'false');
      const staging = page.locator('.tqw-chamber-preload');
      await expect(staging).toHaveAttribute('data-seam', 'false');
      await expect(staging).toHaveAttribute('data-ready', 'false');
      await expect(staging).toHaveAttribute('aria-hidden', 'true');
      await expect(staging).toHaveAttribute('inert');
      await expect(page.locator('.tqw-chamber-host')).toHaveCount(0);
      await expect(page.locator('.tqw-seam-veil')).toHaveCount(0);
      await page.waitForTimeout(500);
      await expect(site(page)).toHaveAttribute('data-spine', 'threshold');
      releaseAtlas?.();
      await expectSpine(page, 'chamber');
      await expect(page.locator('.tqw-chamber-host')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
      expect(errors).toEqual([]);
    } finally {
      releaseAtlas?.();
      await page.unroute('**/apartment-0*.webp');
    }
  });

  test('slides both custom Outline Room leaves from the keyboard with reduced motion', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?quality=high');
    await expect(site(page)).toHaveAttribute('data-reduced-motion', 'true');
    await expectSpine(page, 'entrance');
    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2.6));
    await expectSpine(page, 'corridor');
    await page.getByRole('link', { name: 'Enter The Quiet Works' }).click();
    await expect(site(page)).toHaveAttribute('data-engaged', 'true');
    const corridorCanvas = page.locator('.tqw-corridor-canvas canvas');
    await expect(corridorCanvas).toHaveAttribute('data-baked', 'corridor', { timeout: 60_000 });
    await expect.poll(() => page.evaluate(() => {
      const scene = (window as Window & { __tqwA1?: { scene: { getObjectByName(name: string): unknown } } }).__tqwA1?.scene;
      return Boolean(scene?.getObjectByName('OutlineDoorLeafLeft') && scene?.getObjectByName('OutlineDoorLeafRight'));
    })).toBe(true);
    const slideReadings = await page.evaluate(() => {
      const hook = (window as Window & {
        __tqwA1?: {
          animation: Record<string, { open: number }>;
          freeze(): void;
          render(): unknown;
          scene: { getObjectByName(name: string): { position: { x: number } } | undefined };
        };
      }).__tqwA1;
      if (!hook) throw new Error('The corridor door capture hook did not mount');
      hook.freeze();
      const readX = (side: 'Left' | 'Right') => hook.scene.getObjectByName(`OutlineDoorLeaf${side}`)?.position.x ?? Number.NaN;
      hook.animation['outline-room']!.open = 0;
      hook.render();
      const closed = { left: readX('Left'), right: readX('Right') };
      hook.animation['outline-room']!.open = 0.5;
      hook.render();
      const opening = { left: readX('Left'), right: readX('Right') };
      hook.animation['outline-room']!.open = 1;
      hook.render();
      const open = { left: readX('Left'), right: readX('Right') };
      hook.animation['outline-room']!.open = 0;
      hook.render();
      return { closed, opening, open };
    });
    expect(slideReadings.opening.left - slideReadings.closed.left).toBeCloseTo(-0.55, 2);
    expect(slideReadings.opening.right - slideReadings.closed.right).toBeCloseTo(0.55, 2);
    expect(slideReadings.open.left - slideReadings.closed.left).toBeCloseTo(-1.1, 2);
    expect(slideReadings.open.right - slideReadings.closed.right).toBeCloseTo(1.1, 2);

    const evidenceDir = process.env['TQW_EVIDENCE_DIR'];
    if (evidenceDir) {
      await mkdir(evidenceDir, { recursive: true });
      const mobile = testInfo.project.name === 'mobile';
      await page.evaluate((isMobile) => {
        const hook = (window as Window & { __tqwA1?: { freeze(): void; setCam(...pose: number[]): unknown } }).__tqwA1;
        if (!hook) throw new Error('The corridor door capture hook did not mount');
        hook.freeze();
        const pose = isMobile ? [0.9, 1.62, -17, 35, -5, 70] : [0.9, 1.62, -17, 25, -5, 70];
        hook.setCam(...pose);
      }, mobile);
      await page.mouse.move(1, 1);
      await corridorCanvas.screenshot({ path: join(evidenceDir, `${testInfo.project.name}-outline-door-down-corridor.png`), animations: 'disabled' });
      const closed = await page.evaluate((isMobile) => {
        const hook = (window as Window & { __tqwA1?: { freeze(): void; setCam(...pose: number[]): unknown; project(x: number, y: number, z: number): { x: number; y: number; depth: number } } }).__tqwA1;
        if (!hook) throw new Error('The corridor door capture hook did not mount');
        hook.freeze();
        const rendered = isMobile
          ? hook.setCam(2.24, 1.62, -20.16, 59.7, -8.5, 70)
          : hook.setCam(0.8, 1.62, -21, 59.7, -8.5, 70);
        const centre = hook.project(-1.6, 1.2, -22.4);
        const bounds = document.querySelector('.tqw-corridor-canvas canvas')?.getBoundingClientRect();
        if (!bounds) throw new Error('The corridor canvas has no capture bounds');
        return { rendered, centre, bounds: { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height } };
      }, mobile);
      expect(closed.rendered).toBeTruthy();
      expect(closed.centre.x).toBeGreaterThan(closed.bounds.left + closed.bounds.width * 0.3);
      expect(closed.centre.x).toBeLessThan(closed.bounds.left + closed.bounds.width * 0.7);
      expect(closed.centre.y).toBeGreaterThan(closed.bounds.top + closed.bounds.height * 0.25);
      expect(closed.centre.y).toBeLessThan(closed.bounds.top + closed.bounds.height * 0.75);
      await page.mouse.move(1, 1);
      await corridorCanvas.screenshot({ path: join(evidenceDir, `${testInfo.project.name}-outline-door-closed.png`), animations: 'disabled' });
      await page.evaluate(() => {
        const hook = (window as Window & { __tqwA1?: { animation: Record<string, { open: number }>; render(): unknown } }).__tqwA1;
        if (!hook) throw new Error('The corridor door capture hook did not mount');
        hook.animation['outline-room']!.open = 0.5;
        hook.render();
      });
      await page.mouse.move(1, 1);
      await corridorCanvas.screenshot({ path: join(evidenceDir, `${testInfo.project.name}-outline-door-opening.png`), animations: 'disabled' });
      await page.evaluate(() => {
        const hook = (window as Window & { __tqwA1?: { animation: Record<string, { open: number }>; render(): unknown } }).__tqwA1;
        if (!hook) throw new Error('The corridor door capture hook did not mount');
        hook.animation['outline-room']!.open = 1;
        hook.render();
      });
      await page.mouse.move(1, 1);
      await corridorCanvas.screenshot({ path: join(evidenceDir, `${testInfo.project.name}-outline-door-open.png`), animations: 'disabled' });
      await page.evaluate(() => {
        const hook = (window as Window & { __tqwA1?: { animation: Record<string, { open: number }>; render(): unknown } }).__tqwA1;
        if (!hook) throw new Error('The corridor door capture hook did not mount');
        hook.animation['outline-room']!.open = 0;
        hook.render();
      });
    }

    await door(page, 'The Outline Room', 'open').focus();
    await page.keyboard.press('Enter');
    await expectSpine(page, 'chamber');
    await expect(page).toHaveURL(/\/outline-room/);
    await expect(page.locator('.tqw-chamber-host')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
    expect(errors).toEqual([]);
  });

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

  test('captures the comparison hood shut and lifted at the tracing bench', async ({ page }, testInfo) => {
    await page.goto('/outline-room?quality=high');
    const room = page.locator('.tqw-outline-room');
    await expect(room).toHaveAttribute('data-room-ready', 'true', { timeout: 60_000 });
    await page.getByText('Places and actions', { exact: true }).click();
    await page.getByRole('button', { name: 'Tracing bench' }).click();
    const hoodVisible = () => page.evaluate(() => {
      const probe = (window as Window & { __outlineStageProbe?: { scene: { getObjectByName(name: string): { visible: boolean } | undefined } } }).__outlineStageProbe;
      return probe?.scene.getObjectByName('ComparisonHood')?.visible ?? null;
    });
    await expect.poll(hoodVisible).toBe(true);

    const evidenceDir = process.env['TQW_EVIDENCE_DIR'];
    if (evidenceDir) {
      await mkdir(evidenceDir, { recursive: true });
      await page.mouse.move(1, 1);
      await page.locator('.tqw-outline-room__stage').screenshot({ path: join(evidenceDir, `${testInfo.project.name}-hood-closed.png`), animations: 'disabled' });
    }

    await page.getByRole('button', { name: 'Lift comparison hood' }).click();
    await expect.poll(hoodVisible).toBe(false);
    if (evidenceDir) {
      await page.mouse.move(1, 1);
      await page.locator('.tqw-outline-room__stage').screenshot({ path: join(evidenceDir, `${testInfo.project.name}-hood-open.png`), animations: 'disabled' });
    }
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
        await page.mouse.move(1, 1);
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
