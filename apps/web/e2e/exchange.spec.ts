import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OBJECT_ACTIONS = [
  'Lift the handset', 'Read the rulebook', 'Trace the diagram', 'Move the ladder', 'Test the lamps',
  'Turn the cap', 'Lift the cardigan', 'Read the roster', 'Tilt the frame', 'Ring the bell',
];
const STATION_ANGLE = { threshold: { yaw: 0, pitch: 2 }, desk: { yaw: 0, pitch: -19 }, ladder: { yaw: 0, pitch: 50 }, 'window-seat': { yaw: 0, pitch: 5 } } as const;

async function magentaPixels(page: import('@playwright/test').Page, png: Buffer): Promise<number> {
  return page.evaluate(async base64 => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas2D unavailable for pixel inspection');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        // ACES and the grade shift the diagnostic #ff00ff, so catch its pink output range.
        if ((pixels[i] ?? 0) > 210 && (pixels[i + 1] ?? 255) < 100 && (pixels[i + 2] ?? 0) > 180) count += 1;
      }
      return count;
    }, png.toString('base64'));
}

test('text mode exposes every room object and all twelve connection actions', async ({ page }) => {
  await page.goto('/the-exchange?mode=text');
  await expect(page.getByRole('heading', { name: 'The Exchange' })).toBeVisible();
  const disclosure = page.locator('.tqw-places summary');
  await expect(disclosure).toBeVisible();
  await disclosure.click();
  const objectIds = ['handset-first', 'rulebook', 'wiring-diagram', 'ladder', 'lamp-test', 'tea-flask', 'cardigan', 'shift-roster', 'operator-frame', 'wanted-bell'];
  for (let index = 0; index < OBJECT_ACTIONS.length; index += 1) {
    const action = OBJECT_ACTIONS[index];
    const id = objectIds[index];
    if (!action || !id) throw new Error('Object action fixture is incomplete');
    const button = page.getByRole('button', { name: action, exact: true });
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.locator('.tqw-exchange')).toHaveAttribute('data-findings', new RegExp('(^|,)' + id + '(,|$)'));
  }
  for (let line = 1; line <= 12; line += 1) {
    await expect(page.getByRole('button', { name: `Connect line ${line}`, exact: true })).toBeDisabled();
  }
});

test('the connection path opens the operator line and sealed call', async ({ page }) => {
  await page.clock.install();
  await page.goto('/the-exchange?mode=text');
  await page.locator('.tqw-places summary').click();
  await page.clock.runFor(10_000);
  for (let line = 1; line <= 12; line += 1) await page.getByRole('button', { name: `Connect line ${line}`, exact: true }).click();
  await page.getByRole('button', { name: 'Connect the operator line' }).click();
  await page.getByRole('button', { name: 'Answer the handset' }).click();
  await expect(page.locator('.tqw-exchange')).toHaveAttribute('data-findings', /operator-ticket/);
});

test('the investigation path opens the same operator line', async ({ page }) => {
  await page.goto('/the-exchange?mode=text');
  await page.locator('.tqw-places summary').click();
  await page.getByRole('button', { name: 'Read the rulebook', exact: true }).click();
  await page.getByRole('button', { name: 'Trace the diagram', exact: true }).click();
  await page.getByRole('button', { name: 'Connect the operator line' }).click();
  await page.getByRole('button', { name: 'Answer the handset' }).click();
  await expect(page.locator('.tqw-exchange')).toHaveAttribute('data-findings', /operator-ticket/);
});

test('night service opens the third route after twenty-five seconds without input', async ({ page }) => {
  await page.clock.install();
  await page.goto('/the-exchange?mode=text');
  await page.locator('.tqw-places summary').click();
  await page.clock.runFor(25_000);
  await page.getByRole('button', { name: 'Connect the operator line' }).click();
  await page.getByRole('button', { name: 'Answer the handset' }).click();
  await expect(page.locator('.tqw-exchange')).toHaveAttribute('data-findings', /operator-ticket/);
});

test('magenta hole sweep: station views stay framed at both yaw and pitch limits', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/the-exchange?quality=high&holes=magenta');
  const stage = page.locator('.tqw-exchange-canvas');
  await expect(stage).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  await expect(stage).toHaveAttribute('data-frame-ready', 'true', { timeout: 60_000 });
  await expect(stage).toHaveAttribute('data-yaw-limit', /\d/);
  if (process.env['TQW_METAL'] === '1') await expect(stage).toHaveAttribute('data-renderer', /metal/i);
  const canvas = page.locator('.tqw-exchange-canvas canvas');
  await expect(canvas).toBeVisible();

  for (const station of ['threshold', 'desk', 'ladder', 'window-seat'] as const) {
    await page.evaluate(id => window.dispatchEvent(new CustomEvent('exchange:station', { detail: id })), station);
    await expect(stage).toHaveAttribute('data-station', station);
    await expect(stage).toHaveAttribute('data-camera-station', station);
    await expect.poll(async () => Number(await stage.getAttribute('data-camera-yaw'))).toBeCloseTo(STATION_ANGLE[station].yaw, 0);
    await expect.poll(async () => Number(await stage.getAttribute('data-camera-pitch'))).toBeCloseTo(STATION_ANGLE[station].pitch, 0);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const center = await canvas.screenshot({ animations: 'disabled' });
    const centerHits = await magentaPixels(page, center);
    expect(centerHits, `${station} at center exposed ${centerHits} magenta pixels`).toBe(0);
    if (process.env['TQW_EVIDENCE'] === '1') {
      const name = 'exchange-' + station + '-center';
      await testInfo.attach(name, { body: center, contentType: 'image/png' });
      const evidence = process.env['TQW_EVIDENCE_DIR'];
      if (evidence) {
        const directory = join(evidence, testInfo.project.name);
        mkdirSync(directory, { recursive: true });
        writeFileSync(join(directory, name + '.png'), center);
      }
    }
    for (const sign of [-1, 1] as const) {
      const limit = Number(await stage.getAttribute('data-yaw-limit'));
      await page.evaluate(delta => window.dispatchEvent(new CustomEvent('exchange:turn', { detail: delta })), sign * 360);
      await expect.poll(async () => Number(await stage.getAttribute('data-yaw'))).toBeCloseTo(sign * limit, 0);
      await expect.poll(async () => Number(await stage.getAttribute('data-camera-yaw'))).toBeCloseTo(STATION_ANGLE[station].yaw + sign * limit, 0);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const edgeName = 'exchange-' + station + '-yaw-' + (sign > 0 ? 'right' : 'left') + '-center';
      const edgeImage = await canvas.screenshot({ animations: 'disabled' });
      const edgeHits = await magentaPixels(page, edgeImage);
      if (process.env['TQW_EVIDENCE'] === '1') {
        await testInfo.attach(edgeName, { body: edgeImage, contentType: 'image/png' });
        const evidence = process.env['TQW_EVIDENCE_DIR'];
        if (evidence) {
          const directory = join(evidence, testInfo.project.name);
          mkdirSync(directory, { recursive: true });
          writeFileSync(join(directory, edgeName + '.png'), edgeImage);
        }
      }
      expect(edgeHits, `${station} at yaw ${sign * limit}° exposed ${edgeHits} magenta pixels`).toBe(0);
      for (const pitch of [-25, 25] as const) {
        await page.evaluate(value => window.dispatchEvent(new CustomEvent('exchange:pitch', { detail: value })), pitch);
        await expect(stage).toHaveAttribute('data-look-pitch', String(pitch));
        await expect.poll(async () => Number(await stage.getAttribute('data-camera-pitch'))).toBeCloseTo(pitch + STATION_ANGLE[station].pitch, 0);
        const image = await canvas.screenshot({ animations: 'disabled' });
        const hits = await magentaPixels(page, image);
        if (process.env['TQW_EVIDENCE'] === '1') {
          const name = 'exchange-' + station + '-yaw-' + (sign > 0 ? 'right' : 'left') + '-pitch-' + pitch;
          await testInfo.attach(name, { body: image, contentType: 'image/png' });
          const evidence = process.env['TQW_EVIDENCE_DIR'];
          if (evidence) {
            const directory = join(evidence, testInfo.project.name);
            mkdirSync(directory, { recursive: true });
            writeFileSync(join(directory, name + '.png'), image);
          }
        }
        expect(hits, `${station} at yaw ${sign * limit}°, pitch ${pitch}° exposed ${hits} magenta pixels`).toBe(0);
        await page.evaluate(value => window.dispatchEvent(new CustomEvent('exchange:pitch', { detail: -value })), pitch);
      }
      await page.evaluate(delta => window.dispatchEvent(new CustomEvent('exchange:turn', { detail: delta })), -sign * 360);
    }
  }
  expect(errors).toEqual([]);
});
