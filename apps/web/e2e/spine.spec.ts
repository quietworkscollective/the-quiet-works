import { sceneTimeout } from './timeouts.ts';
import { expect, test } from '@playwright/test';
import {
  activateDoor,
  app,
  audioContexts,
  countAudioContexts,
  disableWebGL,
  door,
  expectSpine,
  expectStamps,
  openMenu,
  site,
  stampWithKeyboard,
} from './helpers.ts';

/** TQW-002 acceptance at the DOM level: the spine's routes, doors, board and pages. */

const OFFICE = 'The Certification Office';

test.describe('landing', () => {
  test('opens on the UNHELD brand with Enter and Menu routes to the board and About', async ({ page }) => {
    await page.goto('/');
    await expectSpine(page, 'entrance');
    await expect(page.getByRole('heading', { level: 1, name: 'UNHELD' })).toBeVisible();
    await expect(page.locator('.tqw-hero__tagline')).toHaveText('A space for everything we carry.');
    await expect(page.locator('.tqw-hero__tagline')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Enter The Quiet Works' })).toBeVisible();
    const menu = await openMenu(page);
    await expect(menu.getByRole('button', { name: 'Notice board', exact: true })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'About', exact: true })).toBeVisible();
    await expect(page.locator('.tqw-corridor-canvas canvas')).toHaveCount(1);
  });

  test('scrolling to the end walks the visitor into the corridor', async ({ page }) => {
    await page.goto('/');
    await expectSpine(page, 'entrance');
    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2.6));
    await expectSpine(page, 'corridor');
    await expect(page).toHaveURL(/\/$/);
  });

  test('scrolling alone never creates an AudioContext', async ({ page }) => {
    await countAudioContexts(page);
    await page.goto('/');
    for (let i = 1; i <= 5; i += 1) {
      await page.evaluate((f) => window.scrollTo(0, window.innerHeight * 0.55 * f), i);
    }
    await expectSpine(page, 'corridor');
    expect(await audioContexts(page)).toBe(0);
  });
});

test.describe('corridor doors', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Enter The Quiet Works' }).click();
    await expectSpine(page, 'corridor');
  });

  test('the six doors are listed in corridor order, only the released Office open', async ({ page }) => {
    const doors = page.getByRole('navigation', { name: 'Doors' }).getByRole('button');
    await expect(doors).toHaveText([
      'The Certification Office, open the door',
      'The Apartment, not yet open',
      'The Tomorrow Engine, not yet open',
      'The Great Atrium, not yet open',
      'The Exchange, not yet open',
      'The Outline Room, not yet open',
    ]);
  });

  test('focusing a door turns to it; Enter opens the Office at its own URL', async ({ page }) => {
    await door(page, OFFICE, 'open').focus();
    await expect(site(page)).toHaveAttribute('data-focus', 'certification-office');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/certification-office$/);
    await expectSpine(page, 'chamber');
    await expect(app(page)).toHaveAttribute('data-mode', '3d');
  });

  test('entering focuses the room and leaving restores focus to the door used', async ({ page }) => {
    const officeDoor = door(page, OFFICE, 'open');
    await officeDoor.focus();
    await page.keyboard.press('Enter');
    await expectSpine(page, 'chamber');
    await expect.poll(() => page.evaluate(() => {
      const host = document.querySelector('.tqw-chamber-host');
      const active = document.activeElement;
      return Boolean(host && active && host.contains(active) && active.matches('[data-chamber-entry], h1, h2, button'));
    })).toBe(true);

    await page.getByRole('button', { name: 'Return to the corridor' }).click();
    await expectSpine(page, 'corridor');
    await expect.poll(() => officeDoor.evaluate((element) => element === document.activeElement)).toBe(true);
  });

  test('a sealed door stays shut and the visitor stays in the corridor', async ({ page }) => {
    await activateDoor(page, 'The Tomorrow Engine', 'sealed');
    await expectSpine(page, 'corridor');
    await expect(site(page)).toHaveAttribute('data-focus', 'tomorrow-engine');
    await expect(page).toHaveURL(/\/$/);
  });

  test('back from the Office returns to the corridor, facing its door', async ({ page }) => {
    await activateDoor(page, OFFICE, 'open');
    await expectSpine(page, 'chamber');
    await page.goBack();
    await expectSpine(page, 'corridor');
    await expect(site(page)).toHaveAttribute('data-focus', 'certification-office');
  });

  test('the office keeps its forms for the whole visit', async ({ page }) => {
    await activateDoor(page, OFFICE, 'open');
    await expectSpine(page, 'chamber');
    await stampWithKeyboard(page);
    await page.getByRole('button', { name: 'Return to the corridor' }).click();
    await expectSpine(page, 'corridor');
    await expect(page).toHaveURL(/\/$/);
    await activateDoor(page, OFFICE, 'open');
    await expectSpine(page, 'chamber');
    await expectStamps(page, 1);
  });

  test('context loss in the corridor falls back to the text corridor in the same place', async ({ page }) => {
    await door(page, 'The Apartment', 'sealed').focus();
    // Wait for a completed native frame; a valid view can have no door centre on screen.
    await expect(page.locator('.tqw-corridor-canvas canvas')).toHaveAttribute('data-world', 'ready', { timeout: sceneTimeout(30_000) });
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('.tqw-corridor-canvas canvas');
      canvas?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
    });
    await expect(site(page)).toHaveAttribute('data-text', 'true');
    await expect(site(page)).toHaveAttribute('data-focus', 'apartment');
    await expect(page.getByRole('heading', { level: 1, name: 'The corridor' })).toBeVisible();
    await page.getByRole('button', { name: 'Try the 3D view again' }).click();
    await expect(site(page)).toHaveAttribute('data-text', 'false');
  });
});

test.describe('notice board', () => {
  test('reaches the Office straight from the landing, without walking', async ({ page }) => {
    await page.goto('/');
    // A phone's hero shows the Menu alone (ADR 0003); the board is one press inside it.
    await (await openMenu(page)).getByRole('button', { name: 'Notice board' }).click();
    const board = page.getByRole('dialog', { name: 'Notice board' });
    await expect(board).toBeVisible();
    await expect(board).toContainText('OFFICE SEEKS EVIDENCE OF COMPETENCE');
    await expect(board).toContainText('The Tomorrow Engine: Not yet open');
    await board.getByRole('button', { name: `Go in: ${OFFICE}` }).click();
    await expect(board).toBeHidden();
    await expect(page).toHaveURL(/\/certification-office$/);
    await expectSpine(page, 'chamber');
  });

  test('closes with Escape and leaves the visitor where they were', async ({ page }) => {
    await page.goto('/');
    await (await openMenu(page)).getByRole('button', { name: 'Notice board' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Notice board' })).toBeHidden();
    await expectSpine(page, 'entrance');
  });
});

test.describe('deep links and pages', () => {
  test('a chamber URL goes straight in, skipping the landing', async ({ page }) => {
    await page.goto('/certification-office');
    await expectSpine(page, 'chamber');
    // ADR 0003: the hero is still the first section of the page, but the visitor arrives at the game
    // window, engaged, with the hero scrolled out of sight.
    await expect(page.getByRole('heading', { name: 'UNHELD', level: 1 })).not.toBeInViewport();
    await expect(site(page)).toHaveAttribute('data-engaged', 'true');
  });

  test('About opens over the landing at /about and closes back to /', async ({ page }) => {
    await page.goto('/');
    await (await openMenu(page)).getByRole('link', { name: 'About' }).click();
    await expect(page).toHaveURL(/\/about$/);
    const about = page.getByRole('dialog', { name: 'About UNHELD' });
    await expect(about).toContainText('It is an artwork, not a support service.');
    await about.getByRole('link', { name: 'Privacy' }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('dialog', { name: 'Privacy' })).toContainText('no cookies');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/$/);
    await expectSpine(page, 'entrance');
  });

  test('an unknown address shows the directory page and keeps its URL', async ({ page }) => {
    await page.goto('/nowhere');
    await expect(page.getByRole('dialog', { name: "This address isn't in the directory" })).toBeVisible();
    await expect(page).toHaveURL(/\/nowhere$/);
  });
});

test.describe('text mode and no WebGL', () => {
  test('?mode=text shows the corridor in prose and keeps text mode through a door', async ({ page }) => {
    await page.goto('/?mode=text');
    await expect(page.getByRole('heading', { level: 1, name: 'The corridor' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    await door(page, OFFICE, 'open').click();
    await expect(page).toHaveURL(/\/certification-office\?mode=text$/);
    await expect(app(page)).toHaveAttribute('data-mode', 'text');
  });

  test('without WebGL the corridor, board and office all work in HTML', async ({ page }) => {
    await disableWebGL(page);
    await page.goto('/');
    await expect(site(page)).toHaveAttribute('data-text', 'true');
    await expect(page.locator('canvas')).toHaveCount(0);
    await door(page, OFFICE, 'open').click();
    await expectSpine(page, 'chamber');
    await expect(app(page)).toHaveAttribute('data-mode', 'text');
  });
});

test.describe('privacy across the spine', () => {
  test('landing, corridor, board and office make no requests and store nothing', async ({ page, context, baseURL }) => {
    const foreign: string[] = [];
    const connections: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith(baseURL ?? '') && !url.startsWith('data:') && !url.startsWith('blob:')) foreign.push(url);
      if (['fetch', 'xhr', 'websocket', 'eventsource'].includes(request.resourceType())) connections.push(url);
    });
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2.6));
    await expectSpine(page, 'corridor');
    await (await openMenu(page)).getByRole('button', { name: 'Notice board' }).click();
    await page.getByRole('button', { name: `Go in: ${OFFICE}` }).click();
    await expectSpine(page, 'chamber');
    expect(foreign).toEqual([]);
    expect(connections).toEqual([]);
    expect(await context.cookies()).toEqual([]);
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  });
});

test.describe('threshold', () => {
  test('walking through a door mounts the chamber only at the seam, never mid-walk', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Enter The Quiet Works' }).click();
    await expectSpine(page, 'corridor');
    await activateDoor(page, OFFICE, 'open');
    await expectSpine(page, 'threshold');
    // The swing and the 1.6 m walk-through take about 1.9 s; the chamber's heavy first mount must
    // not land inside it.
    await expect(page.locator('.tqw-chamber-host')).toHaveCount(0);
    await expect(page.locator('.tqw-corridor-canvas')).toHaveCount(1);
    await expectSpine(page, 'chamber');
    await expect(page.locator('.tqw-chamber-host')).toHaveCount(1);
  });
});
