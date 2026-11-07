import { expect, test, type Page } from '@playwright/test';

/** Imports an archive through the page's own file input, as a visitor restoring one would. */
async function importArchive(page: Page, found: Record<string, Array<{ id: string; kind: string; title: string }>>): Promise<void> {
  const text = JSON.stringify({ version: 1, found, recognitions: [] });
  await page.locator('.tqw-archive input[type="file"]').setInputFiles({ name: 'unheld-discoveries.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.locator('.tqw-archive__message')).toHaveText(/Imported/);
}

// A found record in the site's archive must open again: Read again takes the visitor into the
// record's room and opens that record there. Before this, the button was never rendered, so no
// archived note could be opened from the archive at all.
test.describe('the archive reads found records again', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await importArchive(page, {
      'tomorrow-engine': [{ id: 'winding-instructions', kind: 'memo', title: 'Winding instructions' }],
      exchange: [{ id: 'wiring-diagram', kind: 'line', title: 'Wiring diagram' }],
    });
  });

  test('a Tomorrow Engine record opens in its room, and again when chosen again', async ({ page }) => {
    await page.getByRole('button', { name: 'Read again: Winding instructions' }).click();
    await expect(page).toHaveURL(/\/tomorrow-engine$/);
    const panel = page.locator('.tqw-tomorrow-panel-header h2');
    await expect(panel).toHaveText('Winding instructions', { timeout: 60_000 });
    await page.getByRole('button', { name: 'Close', exact: true }).first().click();
    await expect(panel).toHaveCount(0);
    await page.getByRole('button', { name: 'Read again: Winding instructions' }).click();
    await expect(panel).toHaveText('Winding instructions', { timeout: 30_000 });
  });

  test('an Exchange record opens in its room', async ({ page }) => {
    await page.getByRole('button', { name: 'Read again: Wiring diagram' }).click();
    await expect(page).toHaveURL(/\/the-exchange$/);
    await expect(page.locator('.tqw-exchange[data-reader]')).toHaveAttribute('data-reader', 'diagram', { timeout: 60_000 });
    await expect(page.locator('.tqw-exchange-reader')).toBeVisible();
  });
});
