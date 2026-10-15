import { expect, test } from '@playwright/test';
import { chambersForBuild, REPO_ROOT } from '../scripts/chamber-release.mjs';
import { openMenu } from './helpers.ts';

const rooms = chambersForBuild(REPO_ROOT, false);
const sealed = rooms.filter(room => room.status === 'sealed');

// Keep the live publication guards alongside the unchanged protected page specification.
test('sealed rooms expose only their names and status in doors, clippings and the archive', async ({ page }) => {
  await page.goto('/?mode=text');
  const archive = page.locator('#archive');
  await expect(archive.getByRole('heading', { level: 3 })).toHaveText(rooms.map(room => room.title));
  await expect(archive.locator('.tqw-archive__room-count')).toHaveText(rooms.map(room =>
    room.status === 'sealed' ? 'Not yet open.' : `0 of ${room.findings.papers} papers found.`));
  await expect(archive.locator('.tqw-archive__sealed-row')).toHaveCount(
    rooms.filter(room => room.status === 'open').reduce((total, room) => total + room.findings.papers, 0));
  for (const room of sealed) {
    await expect(archive.locator(`[data-room="${room.id}"]`)).toHaveText(`${room.title}Not yet open.`);
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

test('imported discoveries stay private in sealed archive rows across reload and forgetting', async ({ page }) => {
  await page.goto('/?mode=text');
  const found = Object.fromEntries(rooms.map(room => [room.id, [{ id: 'publication-test-paper', kind: 'memo' }]]));
  await page.locator('.tqw-archive input[type="file"]').setInputFiles({
    name: 'unheld-discoveries.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, found, recognitions: [] })),
  });
  await expect(page.locator('.tqw-archive__message')).toHaveText(/Imported/);
  for (const reload of [false, true]) {
    if (reload) await page.reload();
    for (const room of sealed) {
      await expect(page.locator(`#archive [data-room="${room.id}"]`)).toHaveText(`${room.title}Not yet open.`);
    }
    await expect(page.locator('#archive .tqw-paper[data-state="found"]')).toHaveCount(rooms.filter(room => room.status === 'open').length);
  }
  await page.locator('#archive').getByRole('button', { name: 'Forget everything', exact: true }).click();
  await page.getByRole('dialog', { name: 'Forget everything?' }).getByRole('button', { name: 'Forget everything', exact: true }).click();
  for (const room of sealed) {
    await expect(page.locator(`#archive [data-room="${room.id}"]`)).toHaveText(`${room.title}Not yet open.`);
  }
  await expect(page.locator('#archive .tqw-paper[data-state="found"]')).toHaveCount(0);
});
