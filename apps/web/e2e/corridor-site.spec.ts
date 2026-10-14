import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { entranceZ } from '../src/corridor/camera/entrance.ts';
import { ENTRANCE_KEYS, HANDOVER, HANDOVER_PORTRAIT_TURN_DEG } from '../src/corridor/layout.ts';
import { SITE_SCROLL } from '../src/timing.ts';
import { expectSpine, site } from './helpers.ts';

/**
 * ADR 0003, the camera's half: the hero's ambient drift, the walk-in over the page's scroll with
 * the hand-over at 65% of the run, drift frames only while the scene is on screen, and the engaged
 * touch gestures. (Resting in the game window needs the page shell that owns `engaged`; its
 * input rules are unit-tested against the bindings and the director.)
 */

const canvas = (page: Page) => page.locator('.tqw-corridor-canvas');

interface Sample {
  t: number;
  x: number;
  z: number;
  yaw: number;
}

async function pose(page: Page): Promise<Omit<Sample, 't'>> {
  const [x, z, yaw] = ((await canvas(page).getAttribute('data-pose')) ?? '0,0,0').split(',').map(Number);
  return { x: x!, z: z!, yaw: yaw! };
}

async function frames(page: Page): Promise<number> {
  return Number((await canvas(page).getAttribute('data-frames')) ?? 0);
}

/** Frames drawn over `ms`. */
async function framesOver(page: Page, ms: number): Promise<number> {
  const a = await frames(page);
  await page.waitForTimeout(ms);
  return (await frames(page)) - a;
}

/** Scrolls the page to `progress` of the walk-in run (2.5 viewport heights). */
async function scrollToProgress(page: Page, progress: number): Promise<void> {
  await page.evaluate(
    ([p, run]) => window.scrollTo(0, window.innerHeight * run! * p!),
    [progress, SITE_SCROLL.runViewports],
  );
}

async function recordPoses(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.querySelector('.tqw-corridor-canvas')!;
    const w = window as unknown as { __poses: { t: number; pose: string }[] };
    w.__poses = [{ t: performance.now(), pose: el.getAttribute('data-pose') ?? '' }];
    new MutationObserver(() =>
      w.__poses.push({ t: performance.now(), pose: el.getAttribute('data-pose') ?? '' }),
    ).observe(el, { attributes: true, attributeFilter: ['data-pose'] });
  });
}

async function recorded(page: Page): Promise<Sample[]> {
  const raw = await page.evaluate(() => (window as unknown as { __poses: { t: number; pose: string }[] }).__poses);
  return raw.map(({ t, pose: p }) => {
    const [x, z, yaw] = p.split(',').map(Number);
    return { t, x: x!, z: z!, yaw: yaw! };
  });
}

function handoverYaw(page: Page): number {
  const v = page.viewportSize()!;
  return v.height > v.width ? HANDOVER_PORTRAIT_TURN_DEG : 0;
}

/**
 * The visitor presses Enter on the game window. Arriving by scrolling captures nothing (ADR 0003);
 * the wheel and the keys are the window's only once it is engaged, which the page shell owns.
 */
async function engage(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Enter The Quiet Works' }).click();
  await expect(site(page)).toHaveAttribute('data-engaged', 'true');
}

async function hero(page: Page): Promise<void> {
  await page.goto('/');
  await expectSpine(page, 'entrance');
  // Baked geometry and its first visible draw gate pose telemetry; wait for the scene before
  // measuring or sending input so the assertions begin from a rendered camera state.
  await expect(page.locator('.tqw-corridor-canvas canvas')).toHaveAttribute('data-world', 'ready', { timeout: 60_000 });
  await expect(canvas(page)).toHaveAttribute('data-pose', /,/, { timeout: 60_000 });
}

test.describe('hero drift', () => {
  test('is one shallow lateral arc of 4 cm over 40 s: sinusoidal, no forward creep, no rise, yaw within 0.3 degrees', async ({
    page,
  }) => {
    await hero(page);
    await recordPoses(page);
    // The crest of the arc is a quarter period (10 s) in.
    await page.waitForTimeout(12_500);
    const samples = await recorded(page);
    const t0 = samples[0]!.t;
    expect(samples.length).toBeGreaterThan(40);
    // The arc began a moment before recording did: find how long, then hold it to a pure sine of 4 cm.
    const periodMs = SITE_SCROLL.ambient.periodS * 1000;
    let bestWorst = Infinity;
    for (let startedAgo = -500; startedAgo <= 4000; startedAgo += 20) {
      let worst = 0;
      for (const s of samples) {
        const expected = 0.04 * Math.sin((2 * Math.PI * (s.t - t0 + startedAgo)) / periodMs);
        worst = Math.max(worst, Math.abs(s.x - expected));
      }
      bestWorst = Math.min(bestWorst, worst);
    }
    expect(bestWorst, 'worst distance from a sine of 4 cm and 40 s').toBeLessThan(0.0015);
    let peak = 0;
    for (const s of samples) {
      expect(s.z).toBe(ENTRANCE_KEYS[0]!.z);
      expect(Math.abs(s.yaw)).toBeLessThanOrEqual(0.31);
      peak = Math.max(peak, Math.abs(s.x));
    }
    expect(peak).toBeLessThanOrEqual(0.0405);
    expect(peak).toBeGreaterThan(0.036);
    expect(await canvas(page).getAttribute('data-pitch')).toBe('0.0');
  });

  test('is drawn at about 15 frames a second, not every display frame', async ({ page }) => {
    await hero(page);
    await page.waitForTimeout(1000);
    const drawn = await framesOver(page, 3000);
    expect(drawn).toBeGreaterThanOrEqual(25);
    expect(drawn).toBeLessThanOrEqual(55);
  });

  test('blends out over the first 10% of scroll: half the arc at 5%, none from 10%, and then no frames at all', async ({
    page,
  }) => {
    await hero(page);
    await scrollToProgress(page, SITE_SCROLL.driftBlendOut / 2);
    await recordPoses(page);
    await page.waitForTimeout(11_000);
    const half = await recorded(page);
    const peak = Math.max(...half.map((s) => Math.abs(s.x)));
    expect(peak).toBeGreaterThan(0.012);
    expect(peak).toBeLessThan(0.0225);

    await scrollToProgress(page, SITE_SCROLL.driftBlendOut + 0.02);
    await expect.poll(async () => (await pose(page)).x, { timeout: 10_000 }).toBe(0);
    await page.waitForTimeout(800);
    expect(await framesOver(page, 1000)).toBe(0);
  });

  test('stops with the first scroll and never starts under reduced motion', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await hero(page);
    await page.waitForTimeout(1500);
    expect(await framesOver(page, 1500)).toBe(0);
    expect((await pose(page)).x).toBe(0);
    await context.close();
  });
});

test.describe('the walk-in over the page scroll', () => {
  test('reaches the hand-over at 65% of the run, still in the entrance, and holds it behind the veil', async ({
    page,
  }) => {
    await hero(page);
    const half = SITE_SCROLL.handoverAt / 2;
    await scrollToProgress(page, half);
    await expect
      .poll(async () => Math.abs((await pose(page)).z - entranceZ(0.5)) < 0.02, { timeout: 10_000 })
      .toBe(true);

    await scrollToProgress(page, SITE_SCROLL.handoverAt);
    await expect
      .poll(
        async () => {
          const p = await pose(page);
          return Math.abs(p.z - HANDOVER.z) < 0.01 && Math.abs(p.x) < 0.01 && Math.abs(p.yaw - handoverYaw(page)) < 0.1;
        },
        { timeout: 10_000 },
      )
      .toBe(true);
    await expectSpine(page, 'entrance');

    // Further scroll to 90%: the same view, still the entrance.
    await scrollToProgress(page, 0.9);
    await page.waitForTimeout(800);
    expect(await pose(page)).toEqual({ x: 0, z: HANDOVER.z, yaw: handoverYaw(page) });
    await expectSpine(page, 'entrance');
    expect(await framesOver(page, 1000)).toBe(0);
  });
});

test.describe('who owns the page input', () => {
  /** A cancelable wheel and key press at the window; whether the scene took them. */
  async function prevented(page: Page): Promise<{ wheel: boolean; key: boolean; arrow: boolean }> {
    return page.evaluate(() => {
      const wheel = new WheelEvent('wheel', { deltaY: 120, cancelable: true, bubbles: true });
      window.dispatchEvent(wheel);
      const press = (code: string) => {
        const e = new KeyboardEvent('keydown', { code, key: code, cancelable: true, bubbles: true });
        window.dispatchEvent(e);
        window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
        return e.defaultPrevented;
      };
      return { wheel: wheel.defaultPrevented, key: press('KeyW'), arrow: press('ArrowDown') };
    });
  }

  test('through the hero and the smoke the wheel and keys belong to the page: nothing is prevented', async ({
    page,
  }) => {
    await hero(page);
    expect(await prevented(page)).toEqual({ wheel: false, key: false, arrow: false });
    await scrollToProgress(page, 0.4);
    await page.waitForTimeout(300);
    expect(await prevented(page)).toEqual({ wheel: false, key: false, arrow: false });
    // And the page really scrolled over the scene, not only the event went unprevented.
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  });

  test("once engaged (the corridor, in this shell) the wheel and keys are the window's and the page holds still", async ({
    page,
  }) => {
    await hero(page);
    await scrollToProgress(page, 1);
    await expectSpine(page, 'corridor');
    await expect.poll(async () => Math.abs((await pose(page)).z - HANDOVER.z) < 0.01, { timeout: 10_000 }).toBe(true);
    // Arrived by scrolling and not yet engaged: still the page's.
    expect(await prevented(page)).toEqual({ wheel: false, key: false, arrow: false });
    await engage(page);
    expect(await prevented(page)).toEqual({ wheel: true, key: true, arrow: true });
  });
});

test.describe('drawing only while on screen', () => {
  test('a hidden tab draws nothing and the arc picks up where it was left', async ({ page }) => {
    await hero(page);
    await page.waitForTimeout(3000);
    const before = (await pose(page)).x;
    const hide = (hidden: boolean) =>
      page.evaluate((h) => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => (h ? 'hidden' : 'visible'),
        });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    await hide(true);
    await page.waitForTimeout(400);
    expect(await framesOver(page, 1500)).toBe(0);
    // Anything that would ask for a frame (a resize here) is refused while the tab is hidden.
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: size.width - 40, height: size.height });
    await page.waitForTimeout(600);
    expect(await framesOver(page, 1000)).toBe(0);
    await page.setViewportSize(size);
    await hide(false);
    await expect.poll(() => framesOver(page, 500), { timeout: 5000 }).toBeGreaterThan(3);
    // About 3.5 s of arc has passed on the page's clock; the arc has moved by well under that.
    expect(Math.abs((await pose(page)).x - before)).toBeLessThan(0.004);
  });

  test('scrolled past the game window the renderer draws nothing, even with a key held, and returns as it was left', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'a held key');
    await hero(page);
    await scrollToProgress(page, 1);
    await expectSpine(page, 'corridor');
    await expect.poll(async () => Math.abs((await pose(page)).z - HANDOVER.z) < 0.01, { timeout: 10_000 }).toBe(true);
    await engage(page);
    // Stand in for the sections below the game window: more page to scroll through.
    await page.evaluate(() => {
      const spacer = document.createElement('div');
      spacer.id = 'fixture-sections';
      spacer.style.height = '500vh';
      document.body.append(spacer);
    });
    await page.keyboard.down('KeyW');
    await expect.poll(async () => HANDOVER.z - (await pose(page)).z, { timeout: 10_000 }).toBeGreaterThan(0.4);
    expect(await framesOver(page, 400)).toBeGreaterThan(3);

    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 3.6));
    await page.waitForTimeout(600);
    const left = await pose(page);
    expect(await framesOver(page, 1500)).toBe(0);
    expect(await pose(page)).toEqual(left);
    // Anything that would ask for a frame (a resize here) is refused while the scene is off screen.
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: size.width - 40, height: size.height });
    await page.waitForTimeout(600);
    expect(await framesOver(page, 1000)).toBe(0);
    await page.setViewportSize(size);

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(async () => left.z - (await pose(page)).z, { timeout: 10_000 }).toBeGreaterThan(0.2);
    await page.keyboard.up('KeyW');
    // It resumed from where it stopped: no jump back to the start, none forward.
    expect((await pose(page)).z).toBeLessThan(left.z);
    expect((await pose(page)).z).toBeGreaterThan(left.z - 3);
    await expect(site(page)).toHaveAttribute('data-spine', 'corridor');
  });
});

test.describe('touch gestures while engaged', () => {
  async function cdp(page: Page): Promise<CDPSession> {
    return page.context().newCDPSession(page);
  }
  async function touch(session: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number) {
    await session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: x!, y: y! }],
    });
  }

  async function engagedHandover(page: Page): Promise<void> {
    await hero(page);
    await scrollToProgress(page, 1);
    await expectSpine(page, 'corridor');
    await expect.poll(async () => Math.abs((await pose(page)).z - HANDOVER.z) < 0.01, { timeout: 10_000 }).toBe(true);
    await page.waitForTimeout(500);
    await engage(page);
    await page.waitForTimeout(300);
  }

  test('wait 12 px before choosing an axis: a finger under it neither walks nor looks, one over it does', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'touch');
    await engagedHandover(page);
    const session = await cdp(page);
    const start = await pose(page);
    await touch(session, 'touchStart', 206, 650);
    await touch(session, 'touchMove', 206, 640); // 10 px up
    await page.waitForTimeout(400);
    expect(await pose(page)).toEqual(start);
    await touch(session, 'touchMove', 206, 625); // 25 px
    await expect.poll(async () => start.z - (await pose(page)).z, { timeout: 5000 }).toBeGreaterThan(0.02);
    await touch(session, 'touchEnd');

    const next = await pose(page);
    await touch(session, 'touchStart', 100, 500);
    await touch(session, 'touchMove', 110, 500); // 10 px across
    await page.waitForTimeout(300);
    expect((await pose(page)).yaw).toBe(next.yaw);
    await touch(session, 'touchMove', 135, 500); // 35 px
    await expect.poll(async () => (await pose(page)).yaw, { timeout: 5000 }).toBeLessThan(next.yaw - 0.5);
    await touch(session, 'touchEnd');
  });

  test('never switches modes mid-gesture: a swipe that starts up stays a walk, one that starts sideways stays a look', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'touch');
    await engagedHandover(page);
    const session = await cdp(page);

    // Up, then wide across: the yaw does not move.
    const a = await pose(page);
    await touch(session, 'touchStart', 300, 650);
    await touch(session, 'touchMove', 300, 620);
    for (let i = 1; i <= 10; i += 1) await touch(session, 'touchMove', 300 - i * 25, 620);
    await touch(session, 'touchEnd');
    await page.waitForTimeout(800);
    const afterWalk = await pose(page);
    expect(afterWalk.yaw).toBe(a.yaw);
    expect(a.z - afterWalk.z).toBeGreaterThan(0.05);

    // Sideways, then far up: the camera does not walk.
    await touch(session, 'touchStart', 100, 500);
    await touch(session, 'touchMove', 130, 500);
    for (let i = 1; i <= 10; i += 1) await touch(session, 'touchMove', 130, 500 - i * 30);
    await touch(session, 'touchEnd');
    await page.waitForTimeout(800);
    const afterLook = await pose(page);
    expect(afterLook.z).toBe(afterWalk.z);
    expect(afterLook.x).toBe(afterWalk.x);
    expect(afterLook.yaw).not.toBe(afterWalk.yaw);
  });
});
