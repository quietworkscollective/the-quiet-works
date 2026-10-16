import { toggleOfficePlaces } from './officePlaces.ts';
import { expect, test } from '@playwright/test';
import { app, expectSpine, site, stampButton } from './helpers.ts';

test('the found Office chain survives reset and restores its furthest step after reload', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('office-exploration-archive-reset')) {
      localStorage.removeItem('unheld.v1');
      sessionStorage.setItem('office-exploration-archive-reset', 'true');
    }
  });
  await page.goto('/certification-office?mode=text');
  await stampButton(page).click();
  await page.getByRole('button', { name: 'Open drawer', exact: true }).click();
  await page.getByRole('button', { name: 'Mark inspection copy', exact: true }).click();
  await page.getByRole('button', { name: 'Pull hatch', exact: true }).click();
  await expect(app(page)).toHaveAttribute('data-play-step', 'resolved');

  const archivedIds = await page.evaluate(() => {
    const raw = localStorage.getItem('unheld.v1');
    const parsed = raw ? JSON.parse(raw) as { found?: Record<string, { id: string }[]> } : {};
    return (parsed.found?.['certification-office'] ?? []).map(item => item.id);
  });
  expect(archivedIds).toEqual(expect.arrayContaining([
    'office-application-receipt', 'office-inspection-copy', 'office-marked-copy',
    'office-empty-authority-bay', 'memo-001', 'office-mystery-resolved',
  ]));

  await toggleOfficePlaces(page);
  await page.getByRole('button', { name: 'Reset the apparatus', exact: true }).click();
  await expect(app(page)).toHaveAttribute('data-play-step', 'ready');
  await page.reload();
  await expect(app(page)).toHaveAttribute('data-play-step', 'resolved');
  const restoredIds = await page.evaluate(() => {
    const raw = localStorage.getItem('unheld.v1');
    const parsed = raw ? JSON.parse(raw) as { found?: Record<string, { id: string }[]> } : {};
    return (parsed.found?.['certification-office'] ?? []).map(item => item.id);
  });
  expect(restoredIds).toEqual(expect.arrayContaining(archivedIds));
});

for (const route of ['entrance', 'side door'] as const) {
  test(`${route} returns through the shared corridor anchor`, async ({ page }) => {
    await page.goto('/certification-office?mode=text');
    await toggleOfficePlaces(page);
    await page.getByRole('button', { name: `Leave through ${route}`, exact: true }).click();
    await expectSpine(page, 'corridor');
    await expect(site(page)).toHaveAttribute('data-focus', 'certification-office');
    await expect(page).toHaveURL(/mode=text/);
  });
}
