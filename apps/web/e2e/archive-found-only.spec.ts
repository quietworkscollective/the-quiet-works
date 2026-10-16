import { expect, test } from '@playwright/test';

type Finding = { id: string; kind: 'memo' | 'secret' | 'payoff' | 'line' };
type Found = Record<string, Finding[]>;

async function importArchive(page: import('@playwright/test').Page, found: Found): Promise<void> {
  const text = JSON.stringify({ version: 1, found, recognitions: [] });
  await page.locator('.tqw-archive input[type="file"]').setInputFiles({
    name: 'unheld-discoveries.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(page.locator('.tqw-archive__message')).toHaveText(/Imported/);
}

async function expectFoundOnly(page: import('@playwright/test').Page, rooms: number, papers: number): Promise<void> {
  const archive = page.locator('#archive');
  const archiveCopy = await archive.evaluate((element) => {
    const labels = [...element.querySelectorAll<HTMLElement>('[aria-label], [title]')]
      .flatMap((node) => [node.getAttribute('aria-label'), node.getAttribute('title')])
      .filter((value): value is string => value !== null);
    return [element.textContent ?? '', ...labels].join(' ');
  });
  expect(archiveCopy).not.toMatch(/\b\d+\s*(?:of|out of|\/)\s*\d+\b|\b\d+\s+(?:papers?|secrets?|items?|findings?|discoveries|rooms?|entries|documents?)\b|\b(?:count|counts|total|totals|sealed|slot|slots|not yet open|more rooms will appear)\b/i);
  await expect(archive.locator('.tqw-archive__room')).toHaveCount(rooms);
  await expect(archive.locator('.tqw-paper[data-state="found"]')).toHaveCount(papers);
  await expect(archive.locator('.tqw-archive__none, .tqw-archive__room-count, .tqw-archive__sealed, .tqw-archive__sealed-row')).toHaveCount(0);
}

test('empty archive shows no counts, totals, sealed items or room slots', async ({ page }) => {
  await page.goto('/');
  await expectFoundOnly(page, 0, 0);
});

test('partial archive shows only the room and items found', async ({ page }) => {
  await page.goto('/');
  await importArchive(page, { 'certification-office': [{ id: 'memo-a', kind: 'memo' }] });
  await expectFoundOnly(page, 1, 1);
});

test('Office-complete archive shows its seven found papers without totals or placeholders', async ({ page }) => {
  await page.goto('/');
  await importArchive(page, {
    'certification-office': Array.from({ length: 7 }, (_, index) => ({ id: `memo-${index + 1}`, kind: 'memo' as const })),
  });
  await expectFoundOnly(page, 1, 7);
});
