import { expect, test, type Page } from '@playwright/test';

const STATIONS = ['winding-control', 'date-display', 'carriage', 'service-hatch'] as const;

async function readyRoom(page: Page): Promise<void> {
  await page.goto('/tomorrow-engine');
  await expect(page.locator('.tqw-tomorrow-engine')).toHaveAttribute('data-room-ready', 'true', { timeout: 60_000 });
  await page.waitForFunction(() => !!window.__tqwTomorrowEngine);
}

test('no timer changes phase, date, completion or result', async ({ page }) => {
  await readyRoom(page);
  const room = page.locator('.tqw-tomorrow-engine');
  await page.locator('.tqw-tomorrow-actions [data-station-action="wind"]').click();
  const before = await Promise.all(['data-phase', 'data-date', 'data-completed'].map((name) => room.getAttribute(name)));
  const result = await page.locator('.tqw-tomorrow-result').innerText();
  await page.waitForTimeout(3_200);
  const after = await Promise.all(['data-phase', 'data-date', 'data-completed'].map((name) => room.getAttribute(name)));
  expect(after, 'waiting after one input must not advance or settle the mechanism').toEqual(before);
  await expect(page.locator('.tqw-tomorrow-result')).toHaveText(result);
});

test('the Archive lists found titles only and contains no counters', async ({ page }) => {
  await readyRoom(page);
  await page.locator('.tqw-tomorrow-topbar .tqw-tomorrow-archive').click();
  const text = await page.locator('.tqw-tomorrow-archive-list').innerText();
  expect(text).toBe('Found records appear here.');
  expect(text, 'archive content must not expose found or unfound totals').not.toMatch(/\b(?:\d+\s*\/\s*\d+|found\s*:\s*\d+|total\s*:\s*\d+)\b/i);
  await page.locator('.tqw-tomorrow-actions [data-station-action="wind"]').click();
  await page.locator('.tqw-tomorrow-topbar .tqw-tomorrow-archive').click();
  const foundTitles = await page.locator('.tqw-tomorrow-archive-list').innerText();
  expect(foundTitles).toContain('Winding instructions');
  expect(foundTitles).not.toMatch(/\b\d+\s*\/\s*\d+\b/);
});

test('Leave stays visible at every station, including while the Archive is open', async ({ page }) => {
  await readyRoom(page);
  const room = page.locator('.tqw-tomorrow-engine');
  const leave = room.getByRole('button', { name: 'Leave', exact: true });
  const returnToCorridor = page.locator('.tqw-game__tool--return');
  for (const station of STATIONS) {
    await page.locator(`[data-station-target="${station}"]`).click();
    await expect(room).toHaveAttribute('data-station', station);
    await expect(leave, `Leave at ${station}`).toBeVisible();
    await expect(leave).toHaveAttribute('title', 'Return to the corridor');
    // The room's Leave is its sole exit (script §4, B1): the site strip's exits are hidden here.
    await expect(returnToCorridor, `no second corridor return at ${station}`).toBeHidden();
    await expect(page.locator('.tqw-game__leave'), `no second Leave at ${station}`).toBeHidden();
    await page.locator('.tqw-tomorrow-topbar .tqw-tomorrow-archive').click();
    await expect(leave, `Leave at ${station} with Archive open`).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
  }
});

test('the 390 by 844 layout keeps every station action and Leave inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await readyRoom(page);
  const room = page.locator('.tqw-tomorrow-engine');
  await expect(page.locator('.tqw-game__mode')).toBeHidden();
  const leave = room.getByRole('button', { name: 'Leave', exact: true });
  const returnToCorridor = page.locator('.tqw-game__tool--return');
  for (const station of STATIONS) {
    await page.locator(`[data-station-target="${station}"]`).click();
    await expect(leave).toBeVisible();
    await expect(returnToCorridor).toBeHidden();
    await expect(page.locator('.tqw-game__leave')).toBeHidden();
    const leaveBox = await leave.boundingBox();
    const stationAction = page.locator('.tqw-tomorrow-actions button').first();
    await expect(stationAction).toBeVisible();
    const actionBox = await stationAction.boundingBox();
    expect(leaveBox).not.toBeNull();
    expect(actionBox).not.toBeNull();
    expect(leaveBox!.x).toBeGreaterThanOrEqual(0);
    expect(leaveBox!.y).toBeGreaterThanOrEqual(0);
    expect(leaveBox!.x + leaveBox!.width).toBeLessThanOrEqual(390);
    expect(leaveBox!.y + leaveBox!.height).toBeLessThanOrEqual(844);
    expect(actionBox!.x).toBeGreaterThanOrEqual(0);
    expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(844);
  }
});

test('origin-trail nodes and copy are absent from the live room', async ({ page }) => {
  await readyRoom(page);
  const result = await page.evaluate(() => {
    const scene = (window as Window & { __tqwScene?: { traverse(callback: (node: { name: string }) => void): void } }).__tqwScene;
    const names: string[] = [];
    scene?.traverse((node) => names.push(node.name));
    const room = document.querySelector('.tqw-tomorrow-engine');
    return { names, text: room?.textContent ?? '' };
  });
  const forbidden = /(?:operator\s*44|q.?0?2|0044|now\s*clock|backwards\s*clock|shadow\s*plate|maintenance\s*hatch|half.?gear|loose\s*gear|\bNOW\b)/i;
  expect(result.names.filter((name) => forbidden.test(name))).toEqual([]);
  expect(result.text).not.toMatch(forbidden);
});

test('W, A, S and D do not move or rotate the fixed camera', async ({ page }) => {
  await readyRoom(page);
  const canvas = page.locator('canvas');
  await canvas.focus();
  for (const key of ['w', 'a', 's', 'd']) {
    const before = await page.evaluate(() => window.__tqwTomorrowEngine?.inspectCamera());
    await page.keyboard.press(key);
    const after = await page.evaluate(() => window.__tqwTomorrowEngine?.inspectCamera());
    expect(after, `${key.toUpperCase()} leaves a camera snapshot`).toEqual(before);
  }
  await expect(page.getByRole('button', { name: 'Step back', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Step forward', exact: true })).toHaveCount(0);
});

test('the hint ladder caps, survives navigation and incidental repeats, and resets on progress', async ({ page }) => {
  await readyRoom(page);
  const result = page.locator('.tqw-tomorrow-result');
  const hint = page.getByRole('button', { name: 'Hint', exact: true });
  await hint.click();
  await expect(result).toHaveText('The grip is ready.');
  await page.getByRole('button', { name: 'Date display', exact: true }).click();
  await expect(result).toHaveText('The grip is ready.');
  await hint.click();
  await expect(result).toHaveText('One turn operates the date mechanism.');

  await page.getByRole('button', { name: 'Winding control', exact: true }).click();
  await page.getByRole('button', { name: 'Apply brake', exact: true }).click();
  await expect(result).toHaveText('Wind once, then open the movement record to release the brake.');
  await hint.click();
  await expect(result).toHaveText('Select Wind once.');
  await hint.click();
  await expect(result).toHaveText('Select Wind once.');
  await expect(page.locator('.tqw-tomorrow-panel')).not.toHaveClass(/tqw-tomorrow-panel--open/);

  await page.locator('.tqw-tomorrow-actions [data-station-action="wind"]').click();
  await expect(page.locator('.tqw-tomorrow-engine')).toHaveAttribute('data-phase', 'wound');
  await expect(page.locator('.tqw-tomorrow-acknowledgement')).toContainText('Found: Winding instructions');
  await hint.click();
  await expect(result).toHaveText('The date moved. Did the carriage?');
  await page.locator('.tqw-tomorrow-actions [data-station-action="wind"]').click();
  await expect(result).toHaveText('Movement already recorded.');
  await hint.click();
  await expect(result).toHaveText('The movement record is beside the date.');
});

test('moving the mouse over the room never rebuilds its baked lighting', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'A phone has no hovering pointer.');
  await readyRoom(page);
  const canvas = page.locator('.tqw-tomorrow-engine canvas');
  await expect(canvas).toHaveAttribute('data-baked', 'tomorrow-engine');
  await page.evaluate(() => {
    const target = document.querySelector('.tqw-tomorrow-engine canvas') as HTMLCanvasElement;
    const record = window as Window & { __bakeChanges?: number };
    record.__bakeChanges = 0;
    new MutationObserver((changes) => { record.__bakeChanges! += changes.length; })
      .observe(target, { attributes: true, attributeFilter: ['data-baked', 'data-bake-bind-ms'] });
  });
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  for (let step = 0; step <= 40; step += 1) {
    await page.mouse.move(box!.x + box!.width * (0.15 + 0.7 * (step / 40)), box!.y + box!.height * (0.2 + 0.6 * ((step % 8) / 8)));
    await page.waitForTimeout(25);
  }
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => (window as Window & { __bakeChanges?: number }).__bakeChanges)).toBe(0);
});
