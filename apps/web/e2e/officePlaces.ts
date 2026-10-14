import type { Page } from '@playwright/test';
/** Exercise the Office's early keyboard disclosure, which is visible on focus or while open. */
export async function toggleOfficePlaces(page: Page): Promise<void> {
  const summary = page.getByText('Places and actions', { exact: true });
  await summary.focus();
  await summary.press('Enter');
}
