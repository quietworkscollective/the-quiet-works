import { expect, test, type Page } from '@playwright/test';
import {
  app,
  approachDesk,
  audioContexts,
  closeMenu,
  countAudioContexts,
  disableWebGL,
  expectStamps,
  openMenu,
  roomReady,
  stampButton,
  stampTarget,
  stampWithKeyboard,
} from './helpers.ts';
import { toggleOfficePlaces } from './officePlaces.ts';

/** The Certification Office's own URL: TQW-001's behaviour, now behind its corridor door. */
const OFFICE = '/certification-office';

/** Open the contextual controls and reach their desk interaction state before stamping. */
async function prepareDesk(page: Page): Promise<void> {
  await roomReady(page);
  await approachDesk(page);
}

test.describe('3D office', () => {
  test.use({ reducedMotion: 'reduce' });
  test.beforeEach(async ({ page }, info) => {
    const touchOnly = info.title.startsWith('touch on the 3D stamp');
    const desktopOnly = info.title.startsWith('mouse press on the 3D stamp')
      || info.title.startsWith('context loss while the 3D stamp');
    if (touchOnly && info.project.name !== 'mobile') test.skip(true, 'touch path');
    if (desktopOnly && info.project.name !== 'desktop') test.skip(true, 'mouse path');
    await page.goto(OFFICE);
    await expect(app(page)).toHaveAttribute('data-mode', '3d');
    await roomReady(page);
    await prepareDesk(page);
  });

  test('Space and Enter on the stamp button drive the same stamp', async ({ page }) => {
    await stampWithKeyboard(page, 'Space');
    await expect(app(page)).toHaveAttribute('data-processing', 'false');
    await stampButton(page).press('Enter');
    await expectStamps(page, 1);
    await expect(page.getByRole('status')).toContainText('APPLICATION ALREADY RECEIVED');
  });

  test('a held key repeating does not stamp twice', async ({ page }) => {
    await stampButton(page).focus();
    await page.keyboard.down('Space');
    await page.keyboard.down('Space');
    await page.keyboard.down('Space');
    await page.keyboard.up('Space');
    await expectStamps(page, 1);
  });

  test('mouse press on the 3D stamp holds, release stamps', async ({ page }) => {
    await approachDesk(page);
    const { x, y } = await stampTarget(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await expect(app(page)).toHaveAttribute('data-pressing', 'true');
    await page.mouse.up();
    await expectStamps(page, 1);
  });

  test('touch on the 3D stamp and on the stamp button stamp the same form', async ({ page }) => {
    await approachDesk(page);
    const { x, y } = await stampTarget(page);
    await page.touchscreen.tap(x, y);
    await expectStamps(page, 1);
    await expect(app(page)).toHaveAttribute('data-processing', 'false');
    await stampButton(page).tap();
    await expectStamps(page, 1);
    await expect(page.getByRole('status')).toContainText('APPLICATION ALREADY RECEIVED');
  });

  test('the required chain opens the drawer, marks SEEN, then reveals the memo at the hatch', async ({ page }) => {
    await stampWithKeyboard(page);
    await expect(app(page)).toHaveAttribute('data-play-step', 'refused');
    await expect(app(page)).toHaveAttribute('data-memo', 'hidden');
    await toggleOfficePlaces(page);
    await page.getByText('Things nearby', { exact: true }).click();
    const drawer = page.getByRole('button', { name: 'Drawer: Open drawer' });
    await drawer.click();
    await drawer.click();
    await expect(app(page)).toHaveAttribute('data-play-step', 'drawer-open');
    const mark = page.getByRole('button', { name: 'Tiny underside stamp: Mark inspection copy' });
    await mark.click();
    await mark.click();
    await expect(app(page)).toHaveAttribute('data-play-step', 'inspection-recorded');
    const hatch = page.getByRole('button', { name: 'Approval machine: Pull hatch' });
    await hatch.click();
    await hatch.click();
    await expect(app(page)).toHaveAttribute('data-play-step', 'resolved');
    await expect(app(page)).toHaveAttribute('data-memo', 'inspection');
    const memoButton = page.getByRole('button', { name: 'Read Memo 001', exact: true }).first();
    await expect(memoButton).toBeVisible();
    await memoButton.click();
    const memo = page.getByRole('dialog', { name: 'Memo 001' });
    await expect(memo).toBeVisible();
    await expect(memo).toContainText('nobody here has ever been authorised to decide.');
    await expect(page.locator('.tqw-archive [data-room="certification-office"] .tqw-paper__title', { hasText: 'Memo 001' })).toBeVisible();
  });

  test('Start over returns the office to its first state', async ({ page }) => {
    await stampWithKeyboard(page);
    await toggleOfficePlaces(page);
    await page.getByRole('button', { name: 'Start over' }).click();
    await expectStamps(page, 0);
    await expect(page.getByRole('status')).toContainText('PROVE YOU ARE FINE');
  });

  test('context loss while the 3D stamp is held lifts it exactly once', async ({ page }) => {
    await approachDesk(page);
    const { x, y } = await stampTarget(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await expect(app(page)).toHaveAttribute('data-pressing', 'true');
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('.tqw-canvas canvas');
      canvas?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
    });
    await expect(app(page)).toHaveAttribute('data-mode', 'text');
    // The stamp touched the paper, so lifting it completes the stamp, as a window blur does.
    await expect(app(page)).toHaveAttribute('data-pressing', 'false');
    await expectStamps(page, 1);
    await page.mouse.up();
    await expectStamps(page, 1);
    await stampButton(page).click();
    await expectStamps(page, 1);
    await expect(page.getByRole('status')).toContainText('APPLICATION ALREADY RECEIVED');
  });

  test('WebGL context loss falls back to text mode in the same state', async ({ page }) => {
    await stampWithKeyboard(page);
    await stampTarget(page); // scene is mounted and rendering
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('.tqw-canvas canvas');
      const gl = canvas?.getContext('webgl2');
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    });
    await expect(app(page)).toHaveAttribute('data-mode', 'text');
    await expectStamps(page, 1);
    await expect(page.getByRole('note')).toContainText(/3D/);
    await page.getByRole('button', { name: 'Try the 3D view again' }).click();
    await expect(app(page)).toHaveAttribute('data-mode', '3d');
    await expectStamps(page, 1);
  });
});

test.describe('sound', () => {
test('no AudioContext exists until a deliberate stamp press', async ({ page }) => {
    await countAudioContexts(page);
    await page.goto(OFFICE);
    await expect(app(page)).toHaveAttribute('data-mode', '3d');
    // Settings are in the Menu (ADR 0003).
    const menu = await openMenu(page);
    await menu.getByRole('button', { name: 'Reduced motion' }).click();
    await menu.getByRole('button', { name: 'Captions' }).click();
    await closeMenu(page);
    await prepareDesk(page);
    expect(await audioContexts(page)).toBe(0);

    await stampWithKeyboard(page);
    await expect(app(page)).toHaveAttribute('data-processing', 'false');
    expect(await audioContexts(page)).toBe(1);
    await stampButton(page).press('Enter');
    await expect(page.getByRole('status')).toContainText('APPLICATION ALREADY RECEIVED');
    expect(await audioContexts(page)).toBe(1);
  });

  test('muting before the first press means no AudioContext is ever created', async ({ page }) => {
    await countAudioContexts(page);
    await page.goto(OFFICE);
    const menu = await openMenu(page);
    const sound = menu.getByRole('button', { name: 'Sound' });
    await expect(sound).toHaveAttribute('aria-pressed', 'true');
    await sound.click();
    await expect(sound).toHaveAttribute('aria-pressed', 'false');
    await expect(app(page)).toHaveAttribute('data-muted', 'true');
    await closeMenu(page);
    await prepareDesk(page);
    await stampWithKeyboard(page);
    expect(await audioContexts(page)).toBe(0);
  });
});

test.describe('comfort and accessibility settings', () => {
  test('the OS reduced-motion preference is honoured', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(OFFICE);
    await expect(app(page)).toHaveAttribute('data-reduced-motion', 'true');
    const menu = await openMenu(page);
    await expect(menu.getByRole('button', { name: 'Reduced motion' })).toHaveAttribute('aria-pressed', 'true');
    await context.close();
  });

  test('captions describe sounds when enabled', async ({ page }) => {
    await page.goto(OFFICE);
    const menu = await openMenu(page);
    await menu.getByRole('button', { name: 'Captions' }).click();
    await closeMenu(page);
    await prepareDesk(page);
    // Observe the transient caption while the stamp runs, before a slow renderer can outlive it.
    await Promise.all([
      expect(page.locator('.tqw-captions')).not.toBeEmpty(),
      stampWithKeyboard(page),
    ]);
  });
});

test.describe('text mode', () => {
  test('without WebGL the full office works in semantic HTML', async ({ page }) => {
    await disableWebGL(page);
    await page.goto(OFFICE);
    await expect(app(page)).toHaveAttribute('data-mode', 'text');
    await expect(page.locator('canvas')).toHaveCount(0);
    // The page's own h1 is UNHELD (the hero), so the room's is named (ADR 0003).
    await expect(page.getByRole('heading', { level: 1, name: 'The Certification Office' })).toBeVisible();
    const menu = await openMenu(page);
    await expect(menu.getByRole('button', { name: 'Text mode' })).toBeDisabled();
    await closeMenu(page);

    await stampButton(page).click();
    await expectStamps(page, 1);
    await page.getByRole('button', { name: 'Open drawer', exact: true }).click();
    await page.getByRole('button', { name: 'Mark inspection copy', exact: true }).click();
    await page.getByRole('button', { name: 'Pull hatch', exact: true }).click();
    await expect(app(page)).toHaveAttribute('data-play-step', 'resolved');
    await expect(page.getByRole('article', { name: 'Memo 001' })).toBeVisible();
  });

  test('?mode=text opens text mode and the toggle returns to 3D', async ({ page }) => {
    await page.goto(`${OFFICE}?mode=text`);
    await expect(app(page)).toHaveAttribute('data-mode', 'text');
    const menu = await openMenu(page);
    const toggle = menu.getByRole('button', { name: 'Text mode' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(app(page)).toHaveAttribute('data-mode', '3d');
  });

  test('waiting does not advance the Office story', async ({ page }) => {
    await page.clock.install();
    await page.goto(`${OFFICE}?mode=text`);
    await expect(app(page)).toHaveAttribute('data-memo', 'hidden');
    await page.clock.fastForward(21_000);
    await expect(app(page)).toHaveAttribute('data-play-step', 'ready');
    await expect(app(page)).toHaveAttribute('data-memo', 'hidden');
    await expect(page.getByRole('button', { name: /Memo 001/ })).toHaveCount(0);
  });
});

test.describe('privacy', () => {
  test('makes no cross-origin requests and stores only the Office archive', async ({ page, context, baseURL }) => {
    const foreign: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith(baseURL ?? '') && !url.startsWith('data:') && !url.startsWith('blob:')) {
        foreign.push(url);
      }
    });
    const connections: string[] = [];
    page.on('request', (request) => {
      if (['fetch', 'xhr', 'websocket', 'eventsource'].includes(request.resourceType())) {
        connections.push(`${request.resourceType()} ${request.url()}`);
      }
    });
    await page.goto(OFFICE);
    await prepareDesk(page);
    await stampWithKeyboard(page);
    expect(foreign).toEqual([]);
    expect(connections).toEqual([]);
    expect(await context.cookies()).toEqual([]);
    const storage = await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
      archive: JSON.parse(localStorage.getItem('unheld.v1') ?? '{}') as {
        found?: Record<string, { id: string; kind: string; title?: string }[]>;
      },
    }));
    expect(storage.local).toEqual(['unheld.v1']);
    expect(storage.session).toEqual([]);
    expect(storage.archive.found?.['certification-office']).toContainEqual({
      id: 'office-application-receipt', kind: 'line', title: 'Application receipt',
    });
  });

  test('public identity is UNHELD with The Quiet Works as the world', async ({ page }) => {
    await page.goto(OFFICE);
    await expect(page).toHaveTitle('The Certification Office — The Quiet Works — UNHELD');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://unheld.space/certification-office');
    // The brand is the hero's h1; the world's name is the game window's location line (ADR 0003).
    await expect(page.getByRole('heading', { level: 1, name: 'UNHELD' })).toHaveCount(1);
    await expect(page.locator('.tqw-game__location')).toHaveText('The Quiet Works · Certification Office');
  });

  test('Cloudflare _headers carries the same CSP as the page, plus a framing ban', async ({ page, request }) => {
    await page.goto(OFFICE);
    const meta = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    const headers = await (await request.get('/_headers')).text();
    const line = headers.split('\n').find((l) => l.trim().startsWith('Content-Security-Policy:'));
    expect(line?.trim()).toBe(`Content-Security-Policy: ${meta}; frame-ancestors 'none'`);
    expect(headers).toContain('X-Content-Type-Options: nosniff');
  });

  test('production build ships a same-origin Content-Security-Policy', async ({ page }) => {
    await page.goto(OFFICE);
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    // The artwork makes no runtime connections at all, not even to its own origin.
    expect(csp).toContain("connect-src 'none'");
  });
});
