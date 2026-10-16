import { mkdir } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { expectSpine, openMenu } from './helpers.ts';

const MENU_BG = 'rgb(32, 35, 31)';
const TEXT = 'rgb(238, 234, 225)';
const MUTED = 'rgb(186, 188, 179)';
const ENTER = 'Enter The Quiet Works';
const isPhone = (info: TestInfo) => info.project.name === 'mobile';
const canvas = (page: Page) => page.locator('.tqw-corridor-canvas');

async function worldReady(page: Page): Promise<void> {
  await expect(canvas(page).locator('canvas')).toHaveAttribute('data-world', 'ready', { timeout: 45_000 });
}

test('the invitation leads, with the open-door count beside it and one quieter cue below', async ({ page }) => {
  await page.goto('/');
  await expectSpine(page, 'entrance');
  await expect(page.getByRole('link', { name: ENTER })).toBeVisible();
  await worldReady(page);

  const arrangement = await page.evaluate(() => {
    const enter = document.querySelector<HTMLElement>('.tqw-hero__enter')!;
    const cue = document.querySelector<HTMLElement>('.tqw-hero__cue')!;
    const detail = document.querySelector<HTMLElement>('.tqw-hero__details')!;
    const tagline = document.querySelector<HTMLElement>('.tqw-hero__tagline')!;
    const enterRect = enter.getBoundingClientRect();
    const cueRect = cue.getBoundingClientRect();
    const detailRect = detail.getBoundingClientRect();
    return {
      enterHeight: enterRect.height,
      enterTop: enterRect.top,
      enterBottom: enterRect.bottom,
      enterBg: getComputedStyle(enter).backgroundColor,
      enterBorder: getComputedStyle(enter).borderTopWidth,
      cueTop: cueRect.top,
      cueGap: cueRect.top - enterRect.bottom,
      detailCenterY: (detailRect.top + detailRect.bottom) / 2,
      enterCenterY: (enterRect.top + enterRect.bottom) / 2,
      detailCenterX: (detailRect.left + detailRect.right) / 2,
      enterCenterX: (enterRect.left + enterRect.right) / 2,
      cueText: cue.textContent?.replace(/\s+/g, ' ').trim(),
      detailText: detail.textContent?.replace(/\s+/g, ' ').trim(),
      taglineBottom: tagline.getBoundingClientRect().bottom,
    };
  });

  expect(arrangement.enterHeight).toBeGreaterThanOrEqual(48);
  expect(arrangement.enterBg).toBe('rgb(238, 234, 225)');
  expect(arrangement.enterBorder).toBe('1px');
  expect(arrangement.enterTop).toBeGreaterThanOrEqual(arrangement.taglineBottom + 24);
  expect(arrangement.detailText).toBe('1 door open');
  expect(Math.abs(arrangement.detailCenterY - arrangement.enterCenterY)).toBeLessThanOrEqual(8);
  expect(arrangement.detailCenterX).toBeGreaterThan(arrangement.enterCenterX);
  expect(arrangement.cueText).toBe('Scroll to The Quiet Works');
  expect(arrangement.cueGap).toBeGreaterThanOrEqual(24);
});

test('the menu is an opaque, compact sheet with explicit setting states', async ({ page }, info) => {
  await page.goto('/');
  const menu = await openMenu(page);
  const geometry = await menu.evaluate((dialog) => {
    const rect = dialog.getBoundingClientRect();
    const sheet = dialog.querySelector<HTMLElement>('.tqw-menu-panel__sheet')!;
    const style = getComputedStyle(dialog);
    return {
      x: rect.left,
      rightGap: document.documentElement.clientWidth - rect.right,
      width: rect.width,
      background: style.backgroundColor,
      color: style.color,
      padInline: getComputedStyle(sheet).paddingInline,
    };
  });
  if (isPhone(info)) {
    expect(geometry.x).toBeCloseTo(16, 0);
    expect(geometry.rightGap).toBeCloseTo(16, 0);
    expect(geometry.padInline).toBe('20px');
  } else {
    expect(geometry.width).toBeCloseTo(360, 0);
    expect(geometry.rightGap).toBeCloseTo(24, 0);
    expect(geometry.padInline).toBe('24px');
  }
  expect(geometry.background).toBe(MENU_BG);
  expect(geometry.color).toBe(TEXT);

  const settings = menu.getByRole('group', { name: 'Settings' });
  const closeTarget = await menu.getByRole('button', { name: 'Close the menu' }).boundingBox();
  expect(closeTarget?.width).toBeGreaterThanOrEqual(44);
  expect(closeTarget?.height).toBeGreaterThanOrEqual(44);
  for (const button of await settings.getByRole('button').all()) {
    const pressed = (await button.getAttribute('aria-pressed')) === 'true';
    await expect(button.locator('.tqw-toggle__state')).toHaveText(pressed ? 'On' : 'Off');
    await expect(button.locator('.tqw-toggle__label')).toHaveCSS('color', TEXT);
    await expect(button.locator('.tqw-toggle__state')).toHaveCSS('color', MUTED);
  }
});

test('the phone engagement strip covers the scene edge without wrapping', async ({ page }, info) => {
  test.skip(!isPhone(info), 'the phone strip is the target');
  await page.goto('/certification-office');
  await expectSpine(page, 'chamber');
  await expect(page.locator('.tqw-site')).toHaveAttribute('data-engaged', 'true');

  const strip = page.locator('.tqw-game__strip');
  await expect(strip).toBeVisible();
  await expect(strip.locator('.tqw-game__location-phone')).toHaveText('Certification Office');
  await expect(strip.locator('.tqw-game__location-phone')).not.toHaveAttribute('aria-hidden');
  const state = await strip.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const leave = node.querySelector<HTMLElement>('.tqw-game__leave')!;
    const leaveRect = leave.getBoundingClientRect();
    const key = node.querySelector<HTMLElement>('.tqw-game__key')!;
    const returnLabel = node.querySelector<HTMLElement>('.tqw-game__tool--return .tqw-game__tool-label')!;
    return {
      height: rect.height,
      top: rect.top,
      background: style.backgroundColor,
      leaveWidth: leaveRect.width,
      leaveHeight: leaveRect.height,
      leaveWhiteSpace: getComputedStyle(leave).whiteSpace,
      keyDisplay: getComputedStyle(key).display,
      returnLabelRect: returnLabel.getBoundingClientRect().toJSON(),
      windowWidth: node.closest('.tqw-game__window')!.getBoundingClientRect().width,
    };
  });
  expect(Math.abs(state.top)).toBeLessThanOrEqual(1);
  expect(state.height).toBeGreaterThanOrEqual(56);
  expect(state.background).toBe(MENU_BG);
  expect(state.leaveWidth).toBeGreaterThanOrEqual(44);
  expect(state.leaveHeight).toBeGreaterThanOrEqual(44);
  expect(state.leaveWhiteSpace).toBe('nowrap');
  expect(state.keyDisplay).toBe('none');
  expect(state.returnLabelRect.width).toBeLessThanOrEqual(1);
  expect(state.windowWidth).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth));
  await expect(strip.getByRole('button', { name: 'Return to the corridor' })).toBeVisible();
  await expect(strip.getByRole('button', { name: 'Leave', exact: true })).toBeVisible();
});

test('captures the entrance, menu, resting view and engaged strip', async ({ page }, info) => {
  const evidenceDir = process.env['TQW_EVIDENCE_DIR'];
  test.skip(process.env['TQW_EVIDENCE'] !== '1' || !evidenceDir, 'set TQW_EVIDENCE=1 and TQW_EVIDENCE_DIR');
  test.setTimeout(180_000);
  const phase = process.env['TQW_EVIDENCE_PHASE'] ?? 'after';
  const prefix = `${info.project.name}-${phase}`;
  const capture = (name: string) => page.screenshot({ path: `${evidenceDir}/${prefix}-${name}.png`, timeout: 120_000, animations: 'disabled' });
  await mkdir(evidenceDir!, { recursive: true });
  await page.goto('/');
  await expectSpine(page, 'entrance');
  await worldReady(page);
  await page.waitForTimeout(2500);
  await capture('hero');

  const menu = await openMenu(page);
  await page.waitForTimeout(200);
  await capture('menu');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  const top = await page.evaluate(() => {
    const section = document.getElementById('game')!;
    const window_ = section.querySelector<HTMLElement>('.tqw-game__window')!;
    return section.offsetTop + section.offsetHeight - window_.offsetHeight;
  });
  await page.evaluate((y) => window.scrollTo(0, y), top);
  await expectSpine(page, 'corridor');
  await page.waitForTimeout(250);
  await capture('resting');
  await page.getByRole('button', { name: ENTER }).click();
  await expect(page.locator('.tqw-site')).toHaveAttribute('data-engaged', 'true');
  await page.waitForTimeout(250);
  await capture('engaged-corridor');
  await page.goto('/certification-office');
  await expectSpine(page, 'chamber');
  await page.waitForTimeout(250);
  await capture('engaged-office');
});
