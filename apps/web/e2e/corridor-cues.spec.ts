import { expect, test, type Page } from '@playwright/test';
import { CORRIDOR_PROPS } from '@tqw/engine';
import { framingOf, inside, project, visibleWidth, type Lens } from '../src/corridor/camera/framing.ts';
import { boardAnchor, propAnchor, propById, stationFor } from '../src/corridor/camera/stations.ts';
import { corridorBounds, FOV } from '../src/corridor/camera/viewpoints.ts';
import { LOBBY } from '../src/corridor/layout.ts';
import { readingOf } from '../src/corridor/world/props/reading.ts';
import { corridorDrawn, startPitch, startView, spineIs } from './corridor-view.ts';
import { door } from './helpers.ts';

/**
 * ADR 0004, the camera lane's half: the starting view framing the notice board and the corridor,
 * the cues that say what can be touched (the pointer cursor only on targets, the DOM verb label,
 * the one first hint, the "Things nearby" list and its reader), the board's whole surface as a
 * target, and the ambient scheduler (no frames except inside bounded windows, none under reduced
 * motion or while hidden). Props themselves are built by another lane; what is checked here is the
 * scene's behaviour around them, through the board, the doors and the list.
 */

// Software-rendered frames on a busy host take a quarter of a second, and glides run on simulated time.
test.describe.configure({ timeout: 480_000 });

const canvas = (page: Page) => page.locator('.tqw-corridor-canvas');

async function pose(page: Page): Promise<{ x: number; z: number; yaw: number; pitch: number }> {
  const el = canvas(page);
  const [x, z, yaw] = ((await el.getAttribute('data-pose')) ?? '0,0,0').split(',').map(Number);
  return { x: x!, z: z!, yaw: yaw!, pitch: Number((await el.getAttribute('data-pitch')) ?? 0) };
}

const frames = async (page: Page): Promise<number> => Number((await canvas(page).getAttribute('data-frames')) ?? 0);

async function framesOver(page: Page, ms: number): Promise<number> {
  const a = await frames(page);
  await page.waitForTimeout(ms);
  return (await frames(page)) - a;
}

/** The lens the page is drawn with, from what the scene publishes and the picture's size. */
async function lensOf(page: Page): Promise<Lens> {
  const box = (await canvas(page).boundingBox())!;
  return { vfovDeg: Number(await canvas(page).getAttribute('data-fov')), aspect: box.width / box.height };
}

/** Scrolls the landing to its end and waits for the starting view. */
async function toStartView(page: Page): Promise<void> {
  await page.goto('/');
  await spineIs(page, 'entrance');
  await corridorDrawn(page);
  // The game window remains sticky through the journey's 2.5 viewport end. Stay just inside it
  // so the cue layer is still visible and keyboard-accessible at the starting pose.
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2.55));
  await spineIs(page, 'corridor');
  const want = startView(page);
  await expect
    .poll(
      async () => {
        const p = await pose(page);
        return Math.abs(p.z - want.z) < 0.01 && Math.abs(p.x - want.x) < 0.01 && Math.abs(p.yaw - want.yaw) < 0.1;
      },
      { timeout: 30_000, intervals: [200] },
    )
    .toBe(true);
}

/** Waits until the camera pose is still; ambient life may keep drawing the world. */
async function quiet(page: Page, quietMs = 2000): Promise<void> {
  let last = await canvas(page).getAttribute('data-pose');
  let since = Date.now();
  while (Date.now() - since < quietMs) {
    await page.waitForTimeout(100);
    const now = await canvas(page).getAttribute('data-pose');
    if (now !== last) {
      last = now;
      since = Date.now();
    }
  }
}

/** Where a world point is on the page, in CSS pixels, from the published camera. */
async function screenOf(page: Page, point: readonly [number, number, number]): Promise<{ x: number; y: number }> {
  const p = await pose(page);
  const lens = await lensOf(page);
  const box = (await canvas(page).boundingBox())!;
  const at = project({ x: p.x, z: p.z, yawDeg: p.yaw, pitchDeg: p.pitch }, lens, point)!;
  return { x: box.x + ((at.x + 1) / 2) * box.width, y: box.y + ((1 - at.y) / 2) * box.height };
}

/** Door targets are published in surface-local CSS pixels, like a DOM canvas pointer event. */
async function screenTarget(page: Page, point: readonly [number, number]): Promise<{ x: number; y: number }> {
  const box = (await canvas(page).boundingBox())!;
  return { x: box.x + point[0], y: box.y + point[1] };
}

async function screenBoard(page: Page): Promise<{ x: number; y: number }> {
  const target = JSON.parse((await canvas(page).getAttribute('data-board-target')) ?? '[]') as [number, number];
  return screenTarget(page, target);
}

const cursor = (page: Page) => canvas(page).evaluate((el) => getComputedStyle(el).cursor);
const cue = (page: Page) => page.locator('.tqw-cue');

/** Activate the hint's button with the keyboard without scrolling the sticky scene out of view. */
async function dismissHint(page: Page): Promise<void> {
  const close = page.getByRole('button', { name: 'Dismiss' });
  await expect(close).toBeVisible();
  await close.evaluate((button: HTMLButtonElement) => button.focus({ preventScroll: true }));
  await page.keyboard.press('Enter');
}

/** Bring the resting corridor window under input before driving its scene controls. */
async function engage(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Enter The Quiet Works' }).click();
  await expect(page.locator('.tqw-site')).toHaveAttribute('data-engaged', 'true');
}

test.describe('the starting view', () => {
  test('frames the whole notice board and the corridor, from the live camera', async ({ page, isMobile }) => {
    await toStartView(page);
    await quiet(page);
    const p = await pose(page);
    const lens = await lensOf(page);
    expect(lens.vfovDeg).toBe(isMobile ? FOV.portrait : FOV.landscape);
    expect(p).toEqual({ ...startView(page), pitch: startPitch(page) });

    const view = { x: p.x, z: p.z, yawDeg: p.yaw, pitchDeg: p.pitch };
    // The board is built flat or swivelled toward the entrance; the view must hold it either way.
    for (const swivel of [0, LOBBY.board.swivelDeg]) {
      const { board, opening } = framingOf(view, lens, swivel);
      expect(board, `board at swivel ${swivel}`).not.toBeNull();
      expect(inside(board!, isMobile ? 0.03 : 0.1), `board ${JSON.stringify(board)}`).toBe(true);
      expect(opening, 'the corridor opening').not.toBeNull();
      // A phone's narrow picture holds most of the opening; a desktop's all of it.
      if (isMobile) expect(visibleWidth(opening!)).toBeGreaterThanOrEqual(0.7);
      else expect(inside(opening!, 0.04), `opening ${JSON.stringify(opening)}`).toBe(true);
    }
  });

  test('is where the walk-in ends: the starting view is not a second place', async ({ page }) => {
    await toStartView(page);
    await quiet(page);
    const here = await pose(page);
    expect(here).toEqual({ ...startView(page), pitch: startPitch(page) });
  });
});

test.describe('cues', () => {
  test('the pointer cursor is on the board and on doors only; the ordinary cursor everywhere else', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'a mouse');
    await toStartView(page);
    await quiet(page);
    const board = await screenBoard(page);
    const doors = JSON.parse((await canvas(page).getAttribute('data-door-targets')) ?? '{}') as Record<string, [number, number]>;
    const apartment = await screenTarget(page, doors['apartment']!);
    const size = page.viewportSize()!;

    await page.mouse.move(board.x, board.y);
    await expect.poll(() => cursor(page), { timeout: 15_000 }).toBe('pointer');
    await page.mouse.move(apartment.x, apartment.y);
    await expect.poll(() => cursor(page), { timeout: 15_000 }).toBe('pointer');

    // The floor, a bare wall, the ceiling and the far dark: none is a target.
    for (const [x, y] of [
      [size.width * 0.5, size.height * 0.92],
      [size.width * 0.04, size.height * 0.5],
      [size.width * 0.5, size.height * 0.12],
      [size.width * 0.66, size.height * 0.62],
    ] as const) {
      await page.mouse.move(x, y);
      await expect.poll(() => cursor(page), { timeout: 15_000, message: `at ${x},${y}` }).toBe('default');
    }
    // And never the grab hand, not even before a drag begins.
    expect(await cursor(page)).not.toBe('grab');
  });

  test('shows no label from afar, however long the pointer is on the board or a door: nothing floats over the scene', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'hover');
    await toStartView(page);
    await dismissHint(page);
    await quiet(page);
    const board = await screenBoard(page);
    await page.mouse.move(board.x, board.y);
    await expect(canvas(page)).toHaveAttribute('data-over', 'board', { timeout: 15_000 });
    const doors = JSON.parse((await canvas(page).getAttribute('data-door-targets')) ?? '{}') as Record<string, [number, number]>;
    const apartment = await screenTarget(page, doors['apartment']!);
    await page.mouse.move(apartment.x, apartment.y);
    await expect(canvas(page)).toHaveAttribute('data-over', 'door', { timeout: 15_000 });
    await page.waitForTimeout(2500);
    await expect(cue(page)).toHaveCount(0);
    // And no control of ours is on screen: the list for the keyboard is there, but takes no room.
    expect((await page.locator('.tqw-places').boundingBox())?.width ?? 0).toBeLessThanOrEqual(2);
    expect((await page.locator('.tqw-places').boundingBox())?.height ?? 0).toBeLessThanOrEqual(2);
    await expect(page.locator('.tqw-cues button:not(.tqw-places__item)')).toHaveCount(0);
  });

  test('shows the board\u2019s verb once the visitor has walked up to it and is looking at it, and takes it away when they turn off', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'a keyboard');
    await toStartView(page);
    await quiet(page);
    // Walk forward along the starting heading (a little left of the corridor's axis) until the board is about
    // 2.7 m away and 47 degrees round to the left. It is on the side wall, so the stage never shows it square on
    // (ADR 0007); from beside it (at z = 3) it would be out of any view the visitor can take.
    await engage(page);
    await page.keyboard.down('KeyW');
    await expect.poll(async () => (await pose(page)).z, { timeout: 240_000, intervals: [50] }).toBeLessThan(5.2);
    await page.keyboard.up('KeyW');
    await quiet(page, 3000);
    await expect(cue(page)).toHaveCount(0);
    // Turning toward the board: found, within reach and near the centre of view, after a moment's steadiness.
    await page.keyboard.down('KeyA');
    await expect(cue(page)).toHaveText('Read notices', { timeout: 180_000 });
    await page.keyboard.up('KeyA');
    await expect(cue(page)).toHaveCount(1);
    // Turning away again takes it with a short fade.
    await page.keyboard.down('KeyD');
    await expect(cue(page)).toHaveCount(0, { timeout: 180_000 });
    await page.keyboard.up('KeyD');
  });

  test('shows the first hint once, dismissible, and a reload (a new visit) shows it again', async ({ page }) => {
    const stored = () => page.evaluate(() => window.localStorage.length + window.sessionStorage.length);
    await toStartView(page);
    const before = await stored();
    const hint = page.getByText(CORRIDOR_PROPS.firstHint);
    await expect(hint).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.tqw-hint')).toHaveCount(1);
    await dismissHint(page);
    await expect(hint).toHaveCount(0);
    // Nothing is written to storage for it.
    expect(await stored()).toBe(before);
    await page.reload();
    await toStartView(page);
    await expect(page.getByText(CORRIDOR_PROPS.firstHint)).toBeVisible({ timeout: 15_000 });
  });

  test('a click on the board glides to it first, then opens the notice board; the verb is a button once framed', async ({
    page,
    isMobile,
  }) => {
    await toStartView(page);
    await quiet(page);
    await engage(page);
    const board = await screenBoard(page);
    await page.mouse.move(board.x, board.y);
    await expect(canvas(page)).toHaveAttribute('data-over', 'board', { timeout: 15_000 });
    if (isMobile) await page.touchscreen.tap(board.x, board.y);
    else await page.mouse.click(board.x, board.y);
    // Sent to the board: it turns to look at it from up the lobby along the chosen oblique line,
    // so the board on the side wall is seen obliquely, not square on).
    const station = stationFor(boardAnchor(), await lensOf(page), corridorBounds());
    await expect.poll(async () => (await pose(page)).yaw, { timeout: 180_000, intervals: [250] }).toBeLessThan(-30);
    await quiet(page, 3000);
    const there = await pose(page);
    expect(there.yaw).toBeCloseTo(station.yawDeg, 0);
    expect(Math.abs(there.x - station.x) + Math.abs(there.z - station.z)).toBeLessThan(0.05);
    await expect(page.locator('.tqw-site')).toHaveAttribute('data-board', 'false');
    const verb = page.getByRole('button', { name: 'Read notices' });
    await expect(verb).toBeVisible();
    await verb.click();
    await expect(page.getByRole('dialog', { name: 'Notice board' })).toBeVisible();
  });
});

test.describe('a built prop', () => {
  test('answers the pointer, a click takes the visitor to its station, and its label there opens the reader', async ({
    page,
    isMobile,
  }) => {
    const spec = propById('cricket-bat');
    const anchor = propAnchor(spec);
    await toStartView(page);
    await dismissHint(page);
    await engage(page);
    await quiet(page);
    const at = await screenOf(page, [anchor.x, anchor.y, anchor.z]);
    if (!isMobile) {
      await page.mouse.move(at.x, at.y);
      await expect(canvas(page)).toHaveAttribute('data-over', 'prop', { timeout: 30_000 });
      expect(await cursor(page)).toBe('pointer');
    }
    // From afar a click does not act: it takes the visitor to the place the prop is looked at from (ADR 0007: up
    // the corridor from it, the wall seen obliquely) and looks at it.
    if (isMobile) await page.touchscreen.tap(at.x, at.y);
    else await page.mouse.click(at.x, at.y);
    const station = stationFor(anchor, await lensOf(page), corridorBounds());
    await expect
      .poll(
        async () => {
          const p = await pose(page);
          return Math.hypot(p.x - station.x, p.z - station.z) < 0.05 && Math.abs(p.yaw - station.yawDeg) < 0.3;
        },
        { timeout: 300_000, intervals: [250] },
      )
      .toBe(true);
    await quiet(page, 3000);
    await expect(page.getByRole('region', { name: CORRIDOR_PROPS.verbs['cricket-bat'] })).toHaveCount(0);
    // There its verb is a button; pressing it does the action and opens the reader with what is written on the prop.
    const verb = page.getByRole('button', { name: CORRIDOR_PROPS.verbs['cricket-bat'] });
    await expect(verb).toBeVisible({ timeout: 60_000 });
    await verb.click();
    const reader = page.getByRole('region', { name: CORRIDOR_PROPS.verbs['cricket-bat'] });
    await expect(reader).toBeVisible({ timeout: 120_000 });
    for (const line of readingOf('cricket-bat').lines) await expect(reader).toContainText(line);
  });
});

test.describe('keyboard focus', () => {
  test('on a door shows its label as plain text and a steady 2 px ring around it in the scene', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a keyboard');
    await toStartView(page);
    await quiet(page);
    await engage(page);
    await page.keyboard.press('Tab');
    await door(page, 'The Certification Office', 'open').focus();
    await expect(cue(page)).toHaveText('The Certification Office, open the door', { timeout: 30_000 });
    // Plain text beside the ring, not a second button to tab to.
    expect(await cue(page).evaluate((el) => el.tagName)).toBe('DIV');
    const ring = page.locator('.tqw-cue-ring');
    await expect(ring).toHaveAttribute('data-placed', 'true', { timeout: 30_000 });
    const style = await ring.evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: s.borderTopWidth, style: s.borderTopStyle, animation: s.animationName, transition: s.transitionDuration };
    });
    expect(style.width).toBe('2px');
    expect(style.style).toBe('solid');
    // Steady: nothing animates it.
    expect(style.animation).toBe('none');
  });
});

test.describe('"Places and actions"', () => {
  const summary = (page: Page) => page.getByText('Places and actions', { exact: true });

  test('is in the page for the keyboard and screen readers, and takes no room until it has focus', async ({ page }) => {
    await toStartView(page);
    await dismissHint(page);
    await quiet(page);
    const places = page.locator('.tqw-places');
    expect((await places.boundingBox())?.width ?? 0).toBeLessThanOrEqual(2);
    expect((await places.boundingBox())?.height ?? 0).toBeLessThanOrEqual(2);
    await summary(page).focus();
    await expect.poll(async () => (await places.boundingBox())?.width ?? 0).toBeGreaterThan(80);
    await page.keyboard.press('Enter');
    const items = page.locator('.tqw-places__item');
    // The notice board and all twelve props, whatever the visitor is looking at.
    await expect(items).toHaveCount(13);
    const names = await items.allTextContents();
    expect(names).toContain('Read notices');
    for (const verb of Object.values(CORRIDOR_PROPS.verbs)) expect(names).toContain(verb);
  });

  test('is reached early with Tab, ahead of the scene\u2019s own controls', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a keyboard');
    await toStartView(page);
    await quiet(page);
    await page.locator('.tqw-hero__enter').evaluate((element) => (element as HTMLElement).focus({ preventScroll: true }));
    let reached = -1;
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => document.activeElement?.classList.contains('tqw-places__summary') === true)) {
        reached = i + 1;
        break;
      }
    }
    expect(reached, 'tab presses to reach it').toBeGreaterThan(0);
    expect(reached).toBeLessThanOrEqual(15);
  });

  test('takes the visitor to a prop and shows its label in the reader: one item glides there and acts', async ({ page }) => {
    await toStartView(page);
    await quiet(page);
    await engage(page);
    await summary(page).focus();
    await page.keyboard.press('Enter');
    const before = await pose(page);
    await page.getByRole('button', { name: CORRIDOR_PROPS.verbs['trophy-cabinet'] }).click();
    // It runs the action on arrival and the reader shows the cabinet's label and its inscriptions.
    const reader = page.getByRole('region', { name: CORRIDOR_PROPS.verbs['trophy-cabinet'] });
    await expect(reader).toBeVisible({ timeout: 180_000 });
    await expect(reader).toContainText(CORRIDOR_PROPS.labels['trophy-cabinet']);
    for (const line of CORRIDOR_PROPS.trophies) await expect(reader).toContainText(line);
    const after = await pose(page);
    // The visitor was turned to face it (and moved to it unless they were already within reach).
    expect(Math.abs(after.yaw - before.yaw) + Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(5);
    await reader.getByRole('button', { name: 'Close' }).click();
    await expect(reader).toHaveCount(0);
  });

  test('is operated with the keyboard alone: a focused item has a steady 2 px indicator, and Enter acts', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'a keyboard');
    await toStartView(page);
    await quiet(page);
    await engage(page);
    await summary(page).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    const focused = page.locator('.tqw-places__item:focus');
    await expect(focused).toHaveCount(1);
    expect(await focused.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe('2px');
    // Tab through the list to the football and act with Enter: the visitor is taken there.
    const football = CORRIDOR_PROPS.verbs['football'];
    for (let i = 0; i < 14 && (await focused.count()) > 0 && (await focused.textContent()) !== football; i += 1) {
      await page.keyboard.press('Tab');
    }
    await expect(focused).toHaveText(football);
    const before = await pose(page);
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => Math.hypot((await pose(page)).x - before.x, (await pose(page)).z - before.z), { timeout: 240_000, intervals: [250] })
      .toBeGreaterThan(1);
    // The focused control is still there: nothing took it away on the way.
    await expect(page.locator('.tqw-places__item:focus')).toHaveCount(1);
  });

  test('opens from a header control: the page can ask for it with an event', async ({ page }) => {
    await toStartView(page);
    await page.evaluate(() => document.dispatchEvent(new Event('tqw:open-places')));
    await expect(page.locator('.tqw-places__summary')).toBeFocused();
    await expect(page.locator('.tqw-places')).toHaveAttribute('open', '');
  });

  test('opens the notice board from the list', async ({ page }) => {
    await toStartView(page);
    await quiet(page);
    await engage(page);
    await summary(page).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Read notices' }).click();
    await expect(page.getByRole('dialog', { name: 'Notice board' })).toBeVisible({ timeout: 240_000 });
  });
});

test.describe('the ambient scheduler', () => {
  async function ask(page: Page, id: string, ms: number): Promise<void> {
    await canvas(page).evaluate(
      (el, detail) => el.dispatchEvent(new CustomEvent('tqw:ambient-window', { detail })),
      { id, ms },
    );
  }
  const open = async (page: Page): Promise<string[]> => {
    const raw = (await canvas(page).getAttribute('data-ambient')) ?? '';
    return raw === '' ? [] : raw.split(',');
  };

  /**
   * Notes every frame the scene draws, with the windows open when it was drawn. The world asks for windows of its own
   * (a cuff, a luggage tag), so the claim is not "no frames after mine": it is "no frame is drawn outside a window".
   */
  async function recordFrames(page: Page): Promise<void> {
    await canvas(page).evaluate((el) => {
      const w = window as unknown as { __frameLog: { frame: boolean; ambient: string }[] };
      w.__frameLog = [];
      new MutationObserver((records) => {
        for (const r of records) {
          if (r.attributeName === 'data-frames') w.__frameLog.push({ frame: true, ambient: el.getAttribute('data-ambient') ?? '' });
        }
      }).observe(el, { attributes: true, attributeFilter: ['data-frames'] });
    });
  }

  /**
   * A frame is explained when a window is open as it is drawn, or when it is the one that closes a window (the one right
   * after a frame drawn inside one). Anything else is a frame drawn for nothing.
   */
  async function frameAudit(page: Page): Promise<{ inWindow: number; unexplained: number }> {
    const log = await page.evaluate(() => (window as unknown as { __frameLog: { ambient: string }[] }).__frameLog);
    let previousOpen = false;
    let inWindow = 0;
    let unexplained = 0;
    for (const { ambient } of log) {
      const isOpen = ambient !== '';
      if (isOpen) inWindow += 1;
      else if (!previousOpen) unexplained += 1;
      previousOpen = isOpen;
    }
    return { inWindow, unexplained };
  }

  test('draws frames only inside a window, and none once it has closed', async ({ page }) => {
    await toStartView(page);
    await quiet(page, 3000);
    await recordFrames(page);
    await ask(page, 'lobby-fan', 2500);
    await expect.poll(async () => (await open(page)).includes('lobby-fan'), { timeout: 15_000 }).toBe(true);
    await expect.poll(async () => (await open(page)).includes('lobby-fan'), { timeout: 30_000 }).toBe(false);
    // Long enough for a stray frame to show itself.
    await page.waitForTimeout(5000);
    const audit = await frameAudit(page);
    // A window draws frames at its own cadence for as long as it is open: more than the one that opens it and the
    // one that closes it (which the scene draws for its own reasons).
    expect(audit.inWindow, 'frames drawn inside the window').toBeGreaterThanOrEqual(4);
    expect(audit.unexplained, 'frames drawn outside any window').toBe(0);
  });

  test('never has more than three windows open, and none lasts longer than six seconds', async ({ page }) => {
    await toStartView(page);
    await quiet(page, 3000);
    const requested = new Set(['a', 'b', 'c', 'd', 'e']);
    const ours = async (): Promise<string[]> => (await open(page)).filter((id) => requested.has(id));
    for (const id of ['a', 'b', 'c', 'd', 'e']) await ask(page, id, 60_000);
    // The world may hold a window of its own (a prop's cuff or tag): the cap is three in all.
    await expect.poll(async () => (await open(page)).length, { timeout: 10_000 }).toBe(3);
    const started = Date.now();
    let worst = 0;
    while ((await ours()).length > 0 && Date.now() - started < 20_000) {
      worst = Math.max(worst, (await open(page)).length);
      await page.waitForTimeout(250);
    }
    expect(worst).toBeLessThanOrEqual(3);
    // Asked for a minute, closed within six seconds (plus the cadence of one frame and the poll).
    expect(Date.now() - started).toBeLessThan(6000 + 2500);
    expect(await ours()).toEqual([]);
  });

  test('opens no window while the tab is hidden, and the frames stay at zero', async ({ page }) => {
    await toStartView(page);
    await quiet(page, 3000);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(500);
    await ask(page, 'fan', 3000);
    await page.waitForTimeout(500);
    expect(await open(page)).toEqual([]);
    expect(await framesOver(page, 2000)).toBe(0);
  });
});

test.describe('the ambient scheduler under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('opens no window at all and draws nothing', async ({ page }) => {
    await toStartView(page);
    await quiet(page, 3000);
    await canvas(page).evaluate((el) =>
      el.dispatchEvent(new CustomEvent('tqw:ambient-window', { detail: { id: 'lobby-fan', ms: 3000 } })),
    );
    await page.waitForTimeout(500);
    expect((await canvas(page).getAttribute('data-ambient')) ?? '').toBe('');
    expect(await framesOver(page, 2500)).toBe(0);
  });
});
