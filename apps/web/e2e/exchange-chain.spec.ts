import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Exact strings from main-plot-v3 rulings B2 and B3 and the Exchange section. */
const WIRING_CARD = 'CERTIFICATION: select the enquiry plug, then this jack.';
const PLUG_PROMPT = 'Enquiry plug selected. Select CERTIFICATION.';
const FORM = ['CERTIFICATION ENQUIRY', 'FORWARD TO: TOMORROW ENGINE', 'This connection carries enquiries only.'];
const CONNECTED = FORM.slice(1);
const SOLVE_RECORD = 'Departments connected';
const PLATE_RESULT = 'The rules omit an operator position the wiring already serves.';
const OPERATOR_CAPTION = 'OPERATOR TEST — circuit complete';
const ARCHIVE_TITLE = 'The socket beneath the plate';
const CERTIFICATION_LINE = '3';

type View = 'wide' | 'jacks' | 'desk-top' | 'kneehole' | 'shelf';
const VIEW_ROUTE: Readonly<Record<View, readonly string[]>> = {
  wide: ['Board'],
  jacks: ['Board', 'View jacks'],
  'desk-top': ['Board', 'View desk top'],
  kneehole: ['Desk underside'],
  shelf: ['Ticket shelf'],
};
const VIEWS = Object.keys(VIEW_ROUTE) as View[];
/** The controls that open a reader in each view without any earlier step. */
const READERS: Readonly<Record<View, readonly string[]>> = {
  wide: ['Lift the cardigan'],
  jacks: ['Read wiring card'],
  'desk-top': ['Read the rulebook', 'Turn the cap'],
  kneehole: ['Trace the diagram', 'Open plate'],
  shelf: ['Read rota', 'Read index'],
};
/** Longer than every retired timer: the 25 s idle, the 112 s lamp schedule and the 300 s saturation. */
const LONG_WAIT_MS = 10 * 60 * 1000;

const room = (page: Page) => page.locator('.tqw-exchange');
/** Scoped to the room: the shared chrome also holds a Leave, which this room hides. */
const action = (page: Page, name: string) => room(page).getByRole('button', { name, exact: true });
const press = (page: Page, name: string) => action(page, name).click();
const result = (page: Page) => page.locator('.tqw-exchange-result');
const acknowledgement = (page: Page) => page.locator('.tqw-exchange-ack');
const readerBody = (page: Page) => page.locator('.tqw-exchange-reader-body');
const line = (page: Page, number: string) => page.locator(`.tqw-exchange-lines [data-line="${number}"]`);

async function arrive(page: Page, motion: string, mode = 'text'): Promise<void> {
  await page.goto(`/the-exchange?${mode === 'text' ? 'mode=text' : 'quality=high'}`);
  await expect(room(page)).toBeVisible();
  await expect(room(page)).toHaveAttribute('data-reduced-motion', String(motion === 'reduce'));
  await expect(room(page)).toHaveAttribute('data-room-ready', 'true', { timeout: 60_000 });
}

async function goToView(page: Page, view: View): Promise<void> {
  for (const name of VIEW_ROUTE[view]) await press(page, name);
  await expect(room(page)).toHaveAttribute('data-view', view);
}

/** Visible, on screen, enabled and not covered by anything: a control the visitor can really use. */
async function expectReachable(page: Page, name: string, where: string): Promise<void> {
  const control = action(page, name);
  await expect(control, `${name} at ${where}`).toBeVisible();
  await expect(control, `${name} at ${where}`).toBeEnabled();
  await expect(control, `${name} at ${where}`).toBeInViewport({ ratio: 1 });
  const covered = await control.evaluate(element => {
    const box = element.getBoundingClientRect();
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return !top || !(top === element || element.contains(top));
  });
  expect(covered, `${name} is covered at ${where}`).toBe(false);
}

const foundTitle = (page: Page, id: string) => page.evaluate(finding => {
  const saved = JSON.parse(localStorage.getItem('unheld.v1') ?? '{}') as { found?: Record<string, { id: string; title?: string }[]> };
  return (saved.found?.['exchange'] ?? []).filter(entry => entry.id === finding).map(entry => entry.title ?? '');
}, id);

/** Everything a wait could change: the room's state, what it has saved, and the words on screen. */
const snapshot = (page: Page) => page.evaluate(() => {
  const element = document.querySelector<HTMLElement>('.tqw-exchange');
  return { state: { ...element?.dataset }, saved: localStorage.getItem('unheld.v1'), text: element?.innerText };
});

async function expectWaitChangesNothing(page: Page, where: string): Promise<void> {
  const before = await snapshot(page);
  await page.clock.runFor(LONG_WAIT_MS);
  expect(await snapshot(page), `ten minutes of waiting at ${where}`).toEqual(before);
}

async function solve(page: Page): Promise<void> {
  await goToView(page, 'jacks');
  await press(page, 'Read wiring card');
  await expect(readerBody(page)).toContainText(WIRING_CARD);
  await press(page, 'Select enquiry plug');
  await expect(result(page)).toHaveText(PLUG_PROMPT);
  await press(page, 'Connect CERTIFICATION');
}

async function expectForm(page: Page): Promise<void> {
  await expect(room(page)).toHaveAttribute('data-reader', 'form');
  const lines = (await readerBody(page).innerText()).split('\n').map(text => text.trim()).filter(Boolean);
  expect(lines.join('\n')).toContain(FORM.join('\n'));
}

/** Chain B without the solve: plate, operator test and handset. */
async function completeOperatorTest(page: Page): Promise<void> {
  await goToView(page, 'kneehole');
  await press(page, 'Open plate');
  await press(page, 'Connect operator test');
  await press(page, 'Lift handset');
  await expect(room(page)).toHaveAttribute('data-handset', 'off-hook');
}

for (const motion of ['no-preference', 'reduce'] as const) {
  test.describe(`reduced motion ${motion}`, () => {
    test.use({ contextOptions: { reducedMotion: motion } });

    test('CERTIFICATION is lit on arrival and the B3 solve records Departments connected once', async ({ page }) => {
      await arrive(page, motion);
      await expect(room(page)).toHaveAttribute('data-service', 'day');
      await expect(room(page)).toHaveAttribute('data-plug', 'rest');
      await expect(line(page, CERTIFICATION_LINE)).toHaveAttribute('data-lit', 'true');
      await expect(page.locator('.tqw-exchange-lines [data-lit="true"]')).toHaveCount(1);
      await expect(page.getByText(`Found: ${SOLVE_RECORD}`, { exact: true })).toHaveCount(0);

      await solve(page);
      await expectForm(page);
      await expect(result(page).locator('p')).toHaveText(CONNECTED);
      await expect(acknowledgement(page)).toHaveText(`Found: ${SOLVE_RECORD}`);
      await expect(room(page)).toHaveAttribute('data-plug', 'seated');
      expect(await foundTitle(page, 'departments-connected')).toEqual([SOLVE_RECORD]);

      await line(page, CERTIFICATION_LINE).click();
      expect(await foundTitle(page, 'departments-connected'), 'a repeat adds no discovery').toHaveLength(1);

      await page.reload();
      await expect(room(page)).toHaveAttribute('data-plug', 'seated');
      await goToView(page, 'jacks');
      await press(page, 'Read form');
      await expectForm(page);
      expect(await foundTitle(page, 'departments-connected'), 'a reload adds no discovery').toHaveLength(1);
    });

    test('the operator test needs no solve and records the archive title on the handset', async ({ page }) => {
      await arrive(page, motion);
      await expect(result(page)).toHaveText('');
      await goToView(page, 'kneehole');
      await press(page, 'Open plate');
      await expect(room(page)).toHaveAttribute('data-plate', 'open');
      await expect(result(page)).toHaveText(PLATE_RESULT);
      expect(await foundTitle(page, 'socket-beneath-plate'), 'the plate alone records nothing').toEqual([]);
      await press(page, 'Connect operator test');
      await expect(room(page)).toHaveAttribute('data-lead', 'seated');
      expect(await foundTitle(page, 'socket-beneath-plate'), 'the title waits for the handset').toEqual([]);
      await press(page, 'Lift handset');
      await expect(room(page)).toHaveAttribute('data-handset', 'off-hook');
      await expect(room(page)).toHaveAttribute('data-view', 'desk-top');
      await expect(result(page)).toHaveText(OPERATOR_CAPTION);
      expect(await foundTitle(page, 'socket-beneath-plate')).toEqual([ARCHIVE_TITLE]);
      await expect(room(page)).toHaveAttribute('data-plug', 'rest');

      await goToView(page, 'kneehole');
      await press(page, 'Lift handset');
      expect(await foundTitle(page, 'socket-beneath-plate'), 'a repeat adds no discovery').toHaveLength(1);
      await page.reload();
      await expect(room(page)).toHaveAttribute('data-handset', 'off-hook');
      await goToView(page, 'kneehole');
      await expect(result(page)).toHaveText(OPERATOR_CAPTION);
      await page.goto('/');
      await expect(page.locator('#archive')).toContainText(ARCHIVE_TITLE);
    });

    test('a handset lifted before the operator test settles back and records its own finding', async ({ page }) => {
      await arrive(page, motion);
      await goToView(page, 'desk-top');
      await press(page, 'Lift handset');
      await expect(room(page)).toHaveAttribute('data-reader', 'handset');
      await expect(room(page)).toHaveAttribute('data-handset', 'cradle');
      await expect(room(page)).toHaveAttribute('data-findings', /(^|,)handset-first(,|$)/);
      expect(await foundTitle(page, 'socket-beneath-plate')).toEqual([]);
    });

    test('the tickets follow the handset and open their sealed reader', async ({ page }) => {
      await arrive(page, motion);
      await completeOperatorTest(page);
      await page.locator('.tqw-exchange-context').click();
      await expect(room(page)).toHaveAttribute('data-reader', 'tickets');
      await expect(room(page)).toHaveAttribute('data-view', 'kneehole');
      await expect(room(page)).toHaveAttribute('data-findings', /(^|,)operator-ticket(,|$)/);
      await expect.poll(() => readerBody(page).locator('p').count(), 'the sealed body opens after the subheading').toBeGreaterThan(1);
      await press(page, 'Close');
      await goToView(page, 'shelf');
      await press(page, 'Read rota');
      await expect(room(page)).toHaveAttribute('data-findings', /(^|,)shift-roster(,|$)/);
    });

    test('night service keeps the connection, and Resume service restores it and the last result in one tap', async ({ page }) => {
      await arrive(page, motion);
      await solve(page);
      await press(page, 'Close');
      await expectReachable(page, 'Leave', 'service');
      await press(page, 'Night service');
      await expect(room(page)).toHaveAttribute('data-service', 'night');
      await expect(page.getByRole('heading', { name: 'NIGHT SERVICE', exact: true })).toBeVisible();
      await expect(page.getByText('Connections retained.', { exact: true })).toBeVisible();
      await expect(room(page)).toHaveAttribute('data-plug', 'seated');

      for (const view of VIEWS) {
        await goToView(page, view);
        await expectReachable(page, 'Resume service', view);
        await expectReachable(page, 'Leave', view);
      }
      await press(page, 'Resume service');
      await expect(room(page)).toHaveAttribute('data-service', 'day');
      await expect(line(page, CERTIFICATION_LINE)).toHaveAttribute('data-lit', 'true');
      await expect(room(page)).toHaveAttribute('data-plug', 'seated');
      await expect(result(page).locator('p')).toHaveText(CONNECTED);
      await expect(action(page, 'Resume service')).toHaveCount(0);
    });

    test('a saved night-service record shows the same block and can be resumed', async ({ page }) => {
      await page.addInitScript(() => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem('unheld.v1', JSON.stringify({
          version: 1,
          found: { exchange: [{ id: 'cardigan', kind: 'line', title: 'Cardigan on the chair' }] },
          recognitions: [],
          roomState: { exchange: { version: 1, service: 'night', plug: 'rest', plate: 'shut', lead: 'clipped', handset: 'cradle' } },
        }));
      });
      await arrive(page, motion);
      await expect(room(page)).toHaveAttribute('data-service', 'night');
      await expect(page.getByText('Connections retained.', { exact: true })).toBeVisible();
      await expectReachable(page, 'Resume service', 'restored night service');
      await expectReachable(page, 'Leave', 'restored night service');
      await press(page, 'Resume service');
      await expect(room(page)).toHaveAttribute('data-service', 'day');
      await expect(line(page, CERTIFICATION_LINE)).toHaveAttribute('data-lit', 'true');
    });

    test('night service with nothing found writes nothing and is gone after a reload', async ({ page }) => {
      await arrive(page, motion);
      await press(page, 'Night service');
      await expect(room(page)).toHaveAttribute('data-service', 'night');
      expect(await page.evaluate(() => localStorage.getItem('unheld.v1'))).toBeNull();
      await page.reload();
      await expect(room(page)).toHaveAttribute('data-service', 'day');
    });

    test('waiting changes nothing, at arrival, mid-solve, after the solve and in night service', async ({ page }) => {
      await page.clock.install();
      await arrive(page, motion);
      await page.clock.runFor(1_000);
      await expectWaitChangesNothing(page, 'arrival');
      await expect(room(page)).toHaveAttribute('data-service', 'day');
      await goToView(page, 'jacks');
      await press(page, 'Read wiring card');
      await press(page, 'Select enquiry plug');
      await expectWaitChangesNothing(page, 'plug selected');
      await press(page, 'Connect CERTIFICATION');
      await expectWaitChangesNothing(page, 'connected');
      await press(page, 'Night service');
      await expectWaitChangesNothing(page, 'night service');
      await expect(room(page)).toHaveAttribute('data-service', 'night');
    });

    test('Leave and Resume service stay reachable in every view and reader of the 3D room', async ({ page }) => {
      await arrive(page, motion, '3d');
      await expect(page.locator('.tqw-exchange-canvas')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
      await expect(action(page, 'Resume service')).toHaveCount(0);
      for (const view of VIEWS) {
        await goToView(page, view);
        await expectReachable(page, 'Leave', view);
      }
      await goToView(page, 'wide');
      await press(page, 'Night service');
      for (const view of VIEWS) {
        await goToView(page, view);
        await expectReachable(page, 'Resume service', view);
        await expectReachable(page, 'Leave', view);
        for (const reader of READERS[view]) {
          await press(page, reader);
          await expect(room(page)).not.toHaveAttribute('data-reader', '');
          await expectReachable(page, 'Resume service', `${view}, ${reader}`);
          await expectReachable(page, 'Leave', `${view}, ${reader}`);
          await press(page, 'Close');
        }
      }
      await press(page, 'Resume service');
      await expect(room(page)).toHaveAttribute('data-service', 'day');
      await press(page, 'Leave');
      await expect(room(page)).toHaveCount(0);
    });
  });
}

for (const [width, height] of [[390, 844], [390, 664]] as const) {
  test(`the ${width} by ${height} layout shows one Leave and brings every control fully into view`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await arrive(page, 'no-preference', '3d');
    await expect(page.locator('.tqw-game__mode')).toBeHidden();
    await expect(page.locator('.tqw-game__leave')).toBeHidden();
    await expect(page.getByRole('button', { name: /^Leave/ })).toHaveCount(1);
    for (const view of VIEWS) {
      await goToView(page, view);
      for (const control of await page.locator('.tqw-exchange-actions button, .tqw-exchange-stations button').all()) {
        // A phone's rows scroll sideways; each control must come fully into view within its row.
        await control.scrollIntoViewIfNeeded();
        await expect(control, `control at ${view}`).toBeInViewport({ ratio: 1 });
      }
      await press(page, 'Archive');
      await expectReachable(page, 'Leave', `${view} with the Archive open`);
      await press(page, 'Close');
    }
    await goToView(page, 'wide');
    await press(page, 'Night service');
    await press(page, 'Archive');
    await expectReachable(page, 'Resume service', 'the Archive in night service');
    await expectReachable(page, 'Leave', 'the Archive in night service');
  });
}

test('every solve step works from the keyboard', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'A phone has no keyboard path to prove.');
  await arrive(page, 'no-preference');
  for (const name of ['Read wiring card', 'Select enquiry plug', 'Connect CERTIFICATION']) {
    const primary = action(page, `Next: ${name}`);
    await primary.focus();
    await page.keyboard.press('Enter');
  }
  await expectForm(page);
});

test('number keys choose stations and arrows walk the Lines group', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'A phone has no keyboard path to prove.');
  await arrive(page, 'no-preference');
  await page.keyboard.press('2');
  await expect(room(page)).toHaveAttribute('data-view', 'kneehole');
  await page.keyboard.press('3');
  await expect(room(page)).toHaveAttribute('data-view', 'shelf');
  await page.keyboard.press('1');
  await expect(room(page)).toHaveAttribute('data-view', 'wide');
  await line(page, CERTIFICATION_LINE).focus();
  await page.keyboard.press('ArrowRight');
  await expect(line(page, '4')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(line(page, CERTIFICATION_LINE)).toBeFocused();
});

test('Escape closes the reader and never leaves the room', async ({ page }) => {
  await arrive(page, 'no-preference', '3d');
  await press(page, 'Archive');
  await expect(room(page)).toHaveAttribute('data-reader', 'archive');
  await page.keyboard.press('Escape');
  await expect(room(page)).toHaveAttribute('data-reader', '');
  await page.keyboard.press('Escape');
  await expect(room(page)).toBeVisible();
  await expect(page.locator('.tqw-chamber-host')).not.toHaveAttribute('inert');
  await expectReachable(page, 'Leave', 'after Escape');
});

test('view captures for the evidence set', async ({ page }, testInfo) => {
  const directory = process.env['TQW_EVIDENCE_DIR'];
  test.skip(!directory, 'Set TQW_EVIDENCE_DIR to save captures.');
  // A touch project captures the authored phone, whatever its device's own viewport.
  if (testInfo.project.use.hasTouch) await page.setViewportSize({ width: 390, height: 844 });
  await arrive(page, 'no-preference', '3d');
  const stage = page.locator('.tqw-exchange-canvas');
  await expect(stage).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  await expect(stage).toHaveAttribute('data-frame-ready', 'true', { timeout: 60_000 });
  mkdirSync(directory ?? '', { recursive: true });
  for (const view of VIEWS) {
    await goToView(page, view);
    // Full motion: let the longest camera move (the 1.6 s follow) finish before the capture.
    await page.waitForTimeout(1800);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.screenshot({ path: join(directory ?? '', `${testInfo.project.name}-${view}.png`) });
  }
});
