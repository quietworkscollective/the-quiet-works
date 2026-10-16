import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { OFFICE_OBJECTS } from '@tqw/engine';
import { expect, test } from '@playwright/test';
import { app, closeMenu, openMenu, roomReady } from './helpers.ts';
import { toggleOfficePlaces } from './officePlaces.ts';

declare global {
  interface Window { __officeAudioStarts: number }
}

test('every Office object action gives visible feedback and plays its object sound', async ({ page }, info) => {
  await page.addInitScript(() => {
    const scope = window as Window & { __officeAudioStarts: number };
    scope.__officeAudioStarts = 0;
    for (const prototype of [AudioBufferSourceNode.prototype, OscillatorNode.prototype]) {
      const source = prototype as unknown as { start: (...args: number[]) => void };
      const start = source.start;
      source.start = function (this: AudioScheduledSourceNode, ...args: number[]) {
        scope.__officeAudioStarts += 1;
        return start.apply(this, args);
      };
    }
  });
  await page.addInitScript(() => localStorage.removeItem('unheld.v1'));
  await page.goto('/certification-office?mode=text');

  const menu = await openMenu(page);
  await menu.getByRole('button', { name: 'Captions' }).click();
  await menu.getByRole('button', { name: 'Reduced motion' }).click();
  await closeMenu(page);
  await toggleOfficePlaces(page);
  await page.getByText('Things nearby', { exact: true }).click();

  let previousStarts = await page.evaluate(() => window.__officeAudioStarts);
  const evidence = process.env.TQW_OFFICE_EVIDENCE_DIR;
  if (evidence) await mkdir(evidence, { recursive: true });

  for (const object of OFFICE_OBJECTS) {
    if (object.id === 'chair' && evidence) {
      await page.screenshot({ path: join(evidence, `actions-${info.project.name}-chair-before.png`) });
    }
    await page.getByRole('button', { name: `${object.name}: ${object.action}` }).click();
    await expect(page.locator('.tqw-app')).toHaveAttribute('data-object', object.id);
    const response = page.getByRole('log', { name: 'What happened' });
    await expect(response).toContainText(object.first);
    await expect(page.locator('.tqw-captions')).toContainText(object.caption);
    if (object.id === 'chair' && evidence) {
      await page.screenshot({ path: join(evidence, `actions-${info.project.name}-chair-after.png`) });
    }

    const starts = await page.evaluate(() => window.__officeAudioStarts);
    expect(starts, `${object.name} should start an audible object response`).toBeGreaterThan(previousStarts);
    previousStarts = starts;

    const repeat = object.id === 'ink-pad' ? 'Close ink pad'
      : object.id === 'window' ? 'Close speaking flap'
      : object.id === 'lamp' ? 'Turn lamp shade' : null;
    if (repeat) {
      const beforeRepeat = previousStarts;
      await page.getByRole('button', { name: repeat, exact: true }).click();
      await expect(response).not.toContainText(object.first);
      await expect(page.locator('.tqw-captions')).toContainText(object.caption);
      const repeatStarts = await page.evaluate(() => window.__officeAudioStarts);
      expect(repeatStarts, `${repeat} should start an audible object response`).toBeGreaterThan(beforeRepeat);
      previousStarts = repeatStarts;
    }
  }
});

test('Inspect machine gives a close status-panel response in 3D', async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.removeItem('unheld.v1'));
  await page.goto('/certification-office');
  await roomReady(page);

  const menu = await openMenu(page);
  await menu.getByRole('button', { name: 'Captions' }).click();
  await menu.getByRole('button', { name: 'Reduced motion' }).click();
  await closeMenu(page);
  await toggleOfficePlaces(page);
  await page.getByText('Things nearby', { exact: true }).click();

  const machine = page.getByRole('button', { name: 'Approval machine: Inspect machine' });
  await machine.focus();
  await machine.click();
  const canvas = page.locator('.tqw-canvas');
  const captureCanvas = async (path?: string) => {
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    return page.screenshot({ ...(path ? { path } : {}), clip: box! });
  };
  await expect(app(page)).toHaveAttribute('data-station', 'machine-detail');
  await expect(canvas).toHaveAttribute('data-position', /1\.00,1\.62,3\.30/, { timeout: 30_000 });
  await expect(canvas).toHaveAttribute('data-moving', 'false');

  const evidence = process.env.TQW_OFFICE_EVIDENCE_DIR;
  if (evidence) await mkdir(evidence, { recursive: true });
  const before = evidence
    ? await captureCanvas(join(evidence, `machine-${info.project.name}-before.png`))
    : await captureCanvas();

  await machine.click();
  await expect(app(page)).toHaveAttribute('data-object', 'machine');
  await expect(page.getByRole('log', { name: 'What happened' })).toContainText(OFFICE_OBJECTS.find(object => object.id === 'machine')?.first ?? '');
  await expect(page.locator('.tqw-captions')).toContainText('[A small relay clicks]');
  await expect(page.locator('.tqw-context-cue button')).toHaveText('[A small relay clicks]');
  await page.waitForTimeout(270);
  const after = evidence
    ? await captureCanvas(join(evidence, `machine-${info.project.name}-after.png`))
    : await captureCanvas();
  expect(after.equals(before)).toBe(false);
});
