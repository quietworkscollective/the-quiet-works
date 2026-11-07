import { expect, test } from '@playwright/test';

const TICKET_LINES = [
  'DELIVERY: One completed tomorrow.',
  'INBOUND RECORD: THE EXCHANGE / CERTIFICATION enquiries forwarded here. Routing only; no approval issued.',
  'RELEASE REQUIRES: Certification approval.',
  'RETURN ENQUIRY TO: CERTIFICATION OFFICE — ROUTING TRAY.',
  'DRAWING: GREAT ATRIUM — ROUTING AND SUPPORT SECTION.',
] as const;

const archiveButton = (page: import('@playwright/test').Page) => page.locator('.tqw-tomorrow-topbar .tqw-tomorrow-archive');

async function activatePrimaryWithKeyboard(page: import('@playwright/test').Page, label: string): Promise<void> {
  const primary = page.locator('.tqw-tomorrow-primary');
  await expect(primary).toHaveText(label);
  await primary.focus();
  await page.keyboard.press('Enter');
}

for (const motion of ['no-preference', 'reduce'] as const) {
  test(`plays the approved chain and restores its archive with reduced motion ${motion}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: motion });
    await page.goto('/tomorrow-engine');
    const room = page.locator('.tqw-tomorrow-engine');
    await expect(room).toHaveAttribute('data-mode', '3d');
    await expect(room).toHaveAttribute('data-room-ready', 'true', { timeout: 60_000 });
    await expect(room).toHaveAttribute('data-reduced-motion', motion === 'reduce' ? 'true' : 'false');
    const canvas = page.locator('canvas');
    await expect(canvas).toHaveAttribute('data-date-numeral', '14');

    await activatePrimaryWithKeyboard(page, 'Wind once');
    await expect(room).toHaveAttribute('data-phase', 'wound');
    await expect(room).toHaveAttribute('data-date', '15');
    await expect(canvas).toHaveAttribute('data-date-numeral', '15');
    await expect(page.locator('.tqw-tomorrow-result')).toHaveText('Movement record ready — date display.');
    await expect(page.locator('.tqw-tomorrow-panel-header h2')).toHaveText('Winding instructions');
    await expect(page.locator('.tqw-tomorrow-acknowledgement')).toContainText('Found: Winding instructions');

    await page.locator('[data-station-target="date-display"]').click();
    await expect(room).toHaveAttribute('data-station', 'date-display');
    await activatePrimaryWithKeyboard(page, 'Read movement record');
    await expect(room).toHaveAttribute('data-phase', 'record-opened');
    await expect(page.locator('.tqw-tomorrow-result')).toHaveText('Date advanced one day. Carriage displacement: zero. Brake released for use.');
    await expect(page.locator('.tqw-tomorrow-panel-header h2')).toHaveText('Movement record');
    await expect(page.locator('.tqw-tomorrow-reader-body')).toContainText('The pencil line across the rail still meets the carriage edge. Both measurements were checked against the same turn. The date department may enter its result. Delivery has no movement to enter.');
    await expect(page.locator('.tqw-tomorrow-acknowledgement')).toContainText('Found: Movement record');

    await activatePrimaryWithKeyboard(page, 'Apply brake');
    await expect(room).toHaveAttribute('data-phase', 'braked');
    await expect(room).toHaveAttribute('data-station', 'winding-control');
    await expect(page.locator('.tqw-tomorrow-result')).toHaveText('Brake applied. Dispatch ticket available — service hatch.');
    await expect(page.locator('.tqw-tomorrow-panel')).not.toHaveClass(/tqw-tomorrow-panel--open/);

    await activatePrimaryWithKeyboard(page, 'Withdraw ticket');
    await expect(room).toHaveAttribute('data-phase', 'withdrawn');
    await expect(room).toHaveAttribute('data-completed', 'true');
    await expect(room).toHaveAttribute('data-station', 'service-hatch');
    await expect(page.locator('.tqw-tomorrow-result')).toHaveText('The date advances; delivery still requires unavailable approval.');
    await expect(page.locator('.tqw-tomorrow-acknowledgement')).toContainText('Found: The undelivered tomorrow');
    await expect(page.locator('.tqw-tomorrow-panel-header h2')).toHaveText('Dispatch ticket');
    await expect(page.locator('.tqw-tomorrow-ticket-reference')).toHaveText('Drawing reference: GREAT ATRIUM — ROUTING AND SUPPORT SECTION.');
    expect(await page.locator('.tqw-tomorrow-ticket-lines li').allTextContents()).toEqual([...TICKET_LINES]);

    await archiveButton(page).click();
    const archive = page.locator('.tqw-tomorrow-archive-list');
    await expect(archive).toContainText('Winding instructions');
    await expect(archive).toContainText('Movement record');
    await expect(archive).toContainText('The undelivered tomorrow');
    await expect(archive).toContainText('The Tomorrow Engine — mystery resolved');
    await expect(archive).not.toContainText(/\b\d+\s*\/\s*\d+\b/);
    const completion = await page.evaluate(() => {
      const raw = localStorage.getItem('unheld.v1');
      const parsed = raw ? JSON.parse(raw) as { found?: Record<string, { id: string; kind: string; title?: string }[]> } : null;
      return parsed?.found?.['tomorrow-engine'] ?? [];
    });
    expect(completion).toContainEqual({ id: 'tomorrow-engine-mystery-resolved', kind: 'payoff', title: 'The Tomorrow Engine — mystery resolved' });
    expect(completion.filter(({ id }) => id === 'tomorrow-engine-mystery-resolved')).toHaveLength(1);

    await page.reload();
    await expect(room).toHaveAttribute('data-phase', 'withdrawn');
    await expect(room).toHaveAttribute('data-completed', 'true');
    await expect(room).toHaveAttribute('data-station', 'service-hatch');
    await expect(page.locator('.tqw-tomorrow-result')).toHaveText('The date advances; delivery still requires unavailable approval.');
    await expect(page.locator('.tqw-tomorrow-primary')).toHaveText('Read dispatch ticket');
    await archiveButton(page).click();
    await expect(page.locator('.tqw-tomorrow-archive-list')).toContainText('The undelivered tomorrow');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Withdraw ticket', exact: true }).first().click();
    await expect(room).toHaveAttribute('data-phase', 'withdrawn');
    await expect(page.locator('.tqw-tomorrow-result')).toHaveText('Ticket already withdrawn.');
    await expect(page.locator('.tqw-tomorrow-reader-body')).toHaveAttribute('data-ticket-face', 'front');
  });
}

test('optional finds and the Office comparison use the exact register finding', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/tomorrow-engine');
  const room = page.locator('.tqw-tomorrow-engine');
  await expect(room).toHaveAttribute('data-room-ready', 'true', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Carriage', exact: true }).click();
  await page.getByRole('button', { name: 'Open hour sleeve', exact: true }).click();
  await expect(page.locator('.tqw-tomorrow-panel-header h2')).toHaveText('Sleeve note');
  await expect(page.locator('.tqw-tomorrow-reader-body')).toContainText('This hour belongs to the date on the display.');
  await expect(page.locator('.tqw-tomorrow-reader-body')).toContainText('UNUSED HOUR');
  await expect(page.locator('.tqw-tomorrow-reader-body')).toContainText('Evidence not yet read: Office register.');
  await expect(page.getByRole('button', { name: 'Arrange together', exact: true })).toHaveCount(0);

  await archiveButton(page).click();
  await page.locator('[data-archive-entry="unused-hour"]').click();
  await expect(page.locator('.tqw-tomorrow-panel-header h2')).toHaveText('Unused Hour');
  await expect(page.getByRole('button', { name: 'Arrange together', exact: true })).toHaveCount(0);

  await page.goto('/certification-office?mode=text');
  await page.getByRole('button', { name: 'Open register', exact: true }).click();
  const officeFindings = await page.evaluate(() => {
    const raw = localStorage.getItem('unheld.v1');
    const parsed = raw ? JSON.parse(raw) as { found?: Record<string, { id: string; title?: string }[]> } : null;
    return parsed?.found?.['certification-office'] ?? [];
  });
  expect(officeFindings).toContainEqual({ id: 'office-expired-approval', kind: 'line', title: 'Expired Approval — Sample' });

  await page.goto('/tomorrow-engine');
  await expect(room).toHaveAttribute('data-room-ready', 'true', { timeout: 60_000 });
  await archiveButton(page).click();
  await page.locator('[data-archive-entry="unused-hour"]').click();
  await expect(page.locator('.tqw-tomorrow-panel-header h2')).toHaveText('Unused Hour');
  await expect(page.locator('.tqw-tomorrow-reader-body')).toContainText('Optional cross-room comparison available.');
  await expect(page.getByRole('button', { name: 'Arrange together', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Arrange together', exact: true }).click();
  await expect(page.locator('.tqw-tomorrow-panel-header h2')).toHaveText('Joint record');
  await expect(page.locator('.tqw-tomorrow-original').nth(0)).toHaveText('UNUSED HOURReserved for unloading.\nNo delivery entered.');
  await expect(page.locator('.tqw-tomorrow-original').nth(1)).toHaveText('EXPIRED APPROVAL — SAMPLESpecimen expiry completed. Approval field never signed.');

  await page.getByRole('button', { name: 'Carriage', exact: true }).click();
  await page.getByRole('button', { name: 'Lift stop tab', exact: true }).click();
  await expect(page.locator('.tqw-tomorrow-panel-header h2')).toHaveText('Stop inspection');
  await expect(page.locator('.tqw-tomorrow-reader-body')).toContainText('Nothing in this repair authorises a departure.');
  await expect(page.locator('.tqw-tomorrow-reader-body')).toContainText('STARTING-STOP RUBBING');

  await page.getByRole('button', { name: 'Winding control', exact: true }).click();
  await page.locator('.tqw-tomorrow-actions [data-station-action="wind"]').click();
  await page.getByRole('button', { name: 'Date display', exact: true }).click();
  await page.getByRole('button', { name: 'Read movement record', exact: true }).last().click();
  await page.getByRole('button', { name: 'Winding control', exact: true }).click();
  await page.getByRole('button', { name: 'Apply brake', exact: true }).last().click();
  await page.getByRole('button', { name: 'Service hatch', exact: true }).click();
  await page.getByRole('button', { name: 'Withdraw ticket', exact: true }).first().click();
  await page.getByRole('button', { name: 'Turn over', exact: true }).click();
  await expect(page.locator('.tqw-tomorrow-reader-body')).toHaveAttribute('data-ticket-face', 'reverse');
  await expect(page.locator('.tqw-tomorrow-reader-body')).toContainText('RETURN ADDRESS: PREPRINTED');
  await expect(page.locator('.tqw-tomorrow-reader-body')).toContainText('The return address is printed beneath the carbon');
});
