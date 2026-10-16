import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { closeMenu, openMenu, stampButton } from './helpers.ts';

test('reading the revealed Memo 001 keeps its titled finding in the archive', async ({ page }, info) => {
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
  const sound = menu.getByRole('button', { name: 'Sound' });
  if (await sound.getAttribute('aria-pressed') === 'false') await sound.click();
  await closeMenu(page);
  await stampButton(page).click();
  await page.getByRole('button', { name: 'Open drawer', exact: true }).click();
  await page.getByRole('button', { name: 'Mark inspection copy', exact: true }).click();
  await page.getByRole('button', { name: 'Pull hatch', exact: true }).click();

  const archive = page.locator('.tqw-archive');
  const room = archive.locator('[data-room="certification-office"]');
  await expect(room).toContainText('Memo 001');
  await expect(room.locator('.tqw-archive__room-count, .tqw-archive__sealed')).toHaveCount(0);
  await expect(page.locator('.tqw-office-completion')).not.toContainText('Found: Memo 001');
  const evidence = process.env.TQW_OFFICE_EVIDENCE_DIR;
  if (evidence) {
    await mkdir(evidence, { recursive: true });
    await archive.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(evidence, `memo-${info.project.name}-before.png`) });
  }

  await page.getByRole('button', { name: 'Read Memo 001', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Memo 001' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('nobody here has ever been authorised to decide.');
  await expect(page.locator('.tqw-office-completion')).toContainText('Found: Memo 001');
  expect(await page.evaluate(() => (window as Window & { __officeAudioStarts: number }).__officeAudioStarts)).toBeGreaterThan(0);
  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('unheld.v1');
    return raw ? JSON.parse(raw) as { found?: Record<string, { id: string; kind: string; title?: string }[]> } : null;
  });
  expect(stored?.found?.['certification-office']).toContainEqual({ id: 'memo-001', kind: 'memo', title: 'Memo 001' });
  await expect(room).toContainText('Memo 001');

  await page.keyboard.press('Escape');
  if (evidence) {
    await archive.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(evidence, `memo-${info.project.name}-after.png`) });
  }
  await page.getByRole('button', { name: 'Read Memo 001', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(room).toContainText('Memo 001');
});
