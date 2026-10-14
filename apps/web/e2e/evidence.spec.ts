import { expect, test, type Page } from '@playwright/test';
import { app, disableWebGL, stampButton, stampTarget, stampWithKeyboard } from './helpers.ts';

/**
 * Captures the screenshot evidence required by TQW-001 into evidence/tqw-001/.
 * Opt-in (TQW_EVIDENCE=1) so routine e2e runs do not rewrite committed images.
 */
test.skip(!process.env.TQW_EVIDENCE, 'set TQW_EVIDENCE=1 to capture evidence');

const OVERLOAD_SETTLE_MS = 4500;

async function shot(page: Page, project: string, name: string): Promise<void> {
  await page.screenshot({ path: `evidence/tqw-001/${project}-${name}.png` });
}

test('3D office states', async ({ page }, info) => {
  const p = info.project.name;
  await page.goto('/');
  await expect(app(page)).toHaveAttribute('data-mode', '3d');
  await stampTarget(page);
  await page.waitForTimeout(800);
  await shot(page, p, '01-initial');

  await stampButton(page).focus();
  await page.keyboard.down('Space');
  await page.waitForTimeout(700);
  await shot(page, p, '02-holding');
  await page.keyboard.up('Space');
  await expect(app(page)).toHaveAttribute('data-stamps', '1');

  await stampWithKeyboard(page);
  await stampWithKeyboard(page);
  await page.waitForTimeout(1500);
  await shot(page, p, '03-three-stamps');

  await stampWithKeyboard(page);
  await stampWithKeyboard(page);
  await page.waitForTimeout(OVERLOAD_SETTLE_MS);
  await shot(page, p, '04-overload');

  await page.getByRole('button', { name: /Memo 001/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, p, '05-memo');
});

test('text mode states', async ({ page }, info) => {
  const p = info.project.name;
  await disableWebGL(page);
  await page.goto('/');
  await expect(app(page)).toHaveAttribute('data-mode', 'text');
  await shot(page, p, '06-text-initial');
  for (let i = 0; i < 5; i += 1) await stampButton(page).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `evidence/tqw-001/${p}-07-text-overload.png`, fullPage: true });
});
