import { expect, test } from '@playwright/test';
import { chambersForBuild, REPO_ROOT } from '../scripts/chamber-release.mjs';
import { openMenu } from './helpers.ts';

const rooms = chambersForBuild(REPO_ROOT, false);
const sealed = rooms.filter(room => room.status === 'sealed');

// Keep the live publication guards alongside the unchanged protected page specification.
test('sealed rooms appear only by name and status in doors and clippings, never in the archive', async ({ page }) => {
  await page.goto('/?mode=text');
  const archive = page.locator('#archive');
  await expect(archive.locator('.tqw-archive__room')).toHaveCount(0);
  for (const room of sealed) {
    await expect(archive.locator(`[data-room="${room.id}"]`)).toHaveCount(0);
    const door = page.getByRole('button', { name: `${room.title}, not yet open`, exact: true });
    await expect(door).toBeAttached();
    await expect(door.locator('..').locator('.tqw-door__description')).toHaveText('Not yet open.');
    await expect(page.getByRole('button', { name: `${room.title}, open the door`, exact: true })).toHaveCount(0);
  }
  await (await openMenu(page)).getByRole('button', { name: 'Notice board' }).click();
  const board = page.getByRole('dialog', { name: 'Notice board' });
  for (const room of sealed) {
    const clipping = board.locator('.tqw-clipping').filter({ hasText: room.title.toUpperCase() });
    await expect(clipping.locator('.tqw-clipping__headline')).toHaveText(room.title.toUpperCase());
    await expect(clipping.locator('.tqw-clipping__dek')).toHaveText('Not yet open.');
    await expect(clipping.locator('.tqw-clipping__dateline')).toBeEmpty();
    await expect(clipping.getByRole('button')).toHaveCount(0);
    expect(await clipping.textContent()).not.toContain(room.clipping.dek);
  }
});

test('imported sealed discoveries stay stored but never render across reload and forgetting', async ({ page }) => {
  await page.goto('/?mode=text');
  const found = Object.fromEntries(rooms.map(room => [room.id, [{ id: 'publication-test-paper', kind: 'memo' }]]));
  const storedFindings = () => page.evaluate(() => {
    const stored = localStorage.getItem('unheld.v1');
    return stored ? (JSON.parse(stored) as { found: Record<string, unknown> }).found : null;
  });
  await page.locator('.tqw-archive input[type="file"]').setInputFiles({
    name: 'unheld-discoveries.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, found, recognitions: [] })),
  });
  await expect(page.locator('.tqw-archive__message')).toHaveText(/Imported/);
  expect(await storedFindings()).toEqual(found);
  for (const reload of [false, true]) {
    if (reload) await page.reload();
    for (const room of sealed) {
      const sealedRoom = page.locator(`#archive [data-room="${room.id}"]`);
      expect(await sealedRoom.allTextContents()).toEqual([]);
      expect(await sealedRoom.locator('.tqw-paper').allTextContents()).toEqual([]);
    }
    for (const room of rooms.filter(room => room.status === 'open')) {
      await expect(page.locator(`#archive [data-room="${room.id}"] .tqw-paper[data-state="found"]`)).toHaveCount(1);
    }
    await expect(page.locator('#archive .tqw-paper[data-state="found"]')).toHaveCount(rooms.filter(room => room.status === 'open').length);
    expect(await storedFindings()).toEqual(found);
  }
  await page.locator('#archive').getByRole('button', { name: 'Forget everything', exact: true }).click();
  await page.getByRole('dialog', { name: 'Forget everything?' }).getByRole('button', { name: 'Forget everything', exact: true }).click();
  await expect(page.locator('#archive .tqw-archive__room')).toHaveCount(0);
  await expect(page.locator('#archive .tqw-paper[data-state="found"]')).toHaveCount(0);
  for (const room of sealed) {
    await expect(page.locator(`#archive [data-room="${room.id}"]`)).toHaveCount(0);
    await expect(page.locator(`#archive [data-room="${room.id}"] .tqw-paper`)).toHaveCount(0);
  }
  expect(await storedFindings()).toBeNull();
});
