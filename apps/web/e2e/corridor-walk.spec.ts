import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { SPINE_TIMING } from '../src/timing.ts';
import {
  CHAMBER_SLOTS,
  CORRIDOR,
  ENTRANCE_KEYS,
  HANDOVER,
  HANDOVER_PORTRAIT_TURN_DEG,
} from '../src/corridor/layout.ts';
import { audioContexts, countAudioContexts, door, expectSpine, site } from './helpers.ts';

/**
 * TQW-002 camera lane: the landing walk-in, free walking, looking, door selection and opening,
 * the return, touch, reduced motion and the demand-driven frame loop. The scene publishes what
 * these read on `.tqw-corridor-canvas`: data-pose ("x,z,yawDeg"), data-pitch, data-door-targets
 * (CSS px centres of the doors in view) and data-frames (frames drawn so far).
 */

const OFFICE = 'certification-office';
const OFFICE_TITLE = 'The Certification Office';
type Id = 'certification-office' | 'apartment' | 'tomorrow-engine' | 'great-atrium';

const canvas = (page: Page) => page.locator('.tqw-corridor-canvas');

// Twenty observed simulation frames per second retain the doorway's sampling and pace guards.
const DOOR_FRAME_MS = 50;
const doorwayClocks = new WeakSet<Page>();
const doorwayTest = test.extend({
  page: async ({ page }, runTest) => {
    await page.clock.install();
    try {
      await runTest(page);
    } finally {
      doorwayClocks.delete(page);
      if (!page.isClosed()) await page.clock.resume();
    }
  },
});

async function advanceDoorwayClock(page: Page, ms: number): Promise<void> {
  for (let advanced = 0; advanced < ms; advanced += DOOR_FRAME_MS) {
    await page.clock.fastForward(Math.min(DOOR_FRAME_MS, ms - advanced));
  }
}

/** Camera assertions begin after baked geometry and the first visible draw have finished preparing. */
async function waitForWorld(page: Page): Promise<void> {
  await expect(canvas(page).locator('canvas')).toHaveAttribute('data-world', 'ready', { timeout: 30_000 });
}

async function pose(page: Page): Promise<{ x: number; z: number; yaw: number }> {
  const raw = (await canvas(page).getAttribute('data-pose')) ?? '0,0,0';
  const [x, z, yaw] = raw.split(',').map(Number);
  return { x: x!, z: z!, yaw: yaw! };
}

async function pitch(page: Page): Promise<number> {
  return Number((await canvas(page).getAttribute('data-pitch')) ?? 0);
}

/** Frames drawn over `ms`. */
async function framesOver(page: Page, ms: number): Promise<number> {
  const before = await frames(page);
  await page.waitForTimeout(ms);
  return (await frames(page)) - before;
}

async function frames(page: Page): Promise<number> {
  return Number((await canvas(page).getAttribute('data-frames')) ?? 0);
}

async function targets(page: Page): Promise<Partial<Record<Id, [number, number]>>> {
  return JSON.parse((await canvas(page).getAttribute('data-door-targets')) ?? '{}');
}

/** Waits until no frame has been drawn for `quietMs`: the camera and doors are at rest. */
async function settle(page: Page, quietMs = 500): Promise<void> {
  if (doorwayClocks.has(page)) {
    let last = await frames(page);
    let quiet = 0;
    while (quiet < quietMs) {
      await advanceDoorwayClock(page, DOOR_FRAME_MS);
      const now = await frames(page);
      quiet = now === last ? quiet + DOOR_FRAME_MS : 0;
      last = now;
    }
    return;
  }
  // A quiet polling window cannot precede the queued input frame and its next simulation step.
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  let last = await frames(page);
  let since = Date.now();
  while (Date.now() - since < quietMs) {
    await page.waitForTimeout(50);
    const now = await frames(page);
    if (now !== last) {
      last = now;
      since = Date.now();
    }
  }
}

/** The view of a door, from layout: 1.4 m from the wall, facing it. */
function frameOf(id: Id): { x: number; z: number; yaw: number } {
  const slot = CHAMBER_SLOTS.find((s) => s.chamber === id)!;
  const side = slot.side === 'right' ? 1 : -1;
  return { x: side * (CORRIDOR.width / 2 - 1.4), z: slot.z, yaw: side * 90 };
}

function expectPose(
  actual: { x: number; z: number; yaw: number },
  want: { x: number; z: number; yaw: number },
  tol = 0.02,
): void {
  expect(Math.abs(actual.x - want.x)).toBeLessThanOrEqual(tol);
  expect(Math.abs(actual.z - want.z)).toBeLessThanOrEqual(tol);
  expect(Math.abs(actual.yaw - want.yaw)).toBeLessThanOrEqual(0.2);
}

const near = (
  a: { x: number; z: number; yaw: number },
  b: { x: number; z: number; yaw: number },
  tol = 0.02,
  yawTol = 0.2,
): boolean => Math.abs(a.x - b.x) <= tol && Math.abs(a.z - b.z) <= tol && Math.abs(a.yaw - b.yaw) <= yawTol;

/** Waits for the published pose to reach `want`. */
async function expectPoseSoon(
  page: Page,
  want: { x: number; z: number; yaw: number },
  timeout = 60_000,
  tol = 0.02,
  yawTol = 0.2,
): Promise<void> {
  await expect.poll(async () => {
    if (doorwayClocks.has(page)) await advanceDoorwayClock(page, DOOR_FRAME_MS);
    return near(await pose(page), want, tol, yawTol);
  }, { timeout, intervals: [100] }).toBe(true);
}

/** The yaw the hand-over view has on this screen: turned toward the Office door in portrait, straight otherwise. */
function handoverYaw(page: Page): number {
  const v = page.viewportSize()!;
  return v.height > v.width ? HANDOVER_PORTRAIT_TURN_DEG : 0;
}

/**
 * The visitor presses Enter on the game window (ADR 0003). Arriving at the window by scrolling never
 * captures input: until this, the wheel and the walking keys belong to the page.
 */
async function engage(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Enter The Quiet Works' }).click();
  await expect(site(page)).toHaveAttribute('data-engaged', 'true');
  await settle(page);
}

/** Native scroll along the measured journey; 1 places the game window at the viewport top. */
async function scrollToProgress(page: Page, progress: number): Promise<void> {
  await page.evaluate((p) => {
    const section = document.getElementById('game')!;
    const window_ = section.querySelector<HTMLElement>('.tqw-game__window')!;
    const top = section.offsetTop + section.offsetHeight - window_.offsetHeight;
    window.scrollTo(0, Math.round(top * p));
  }, progress);
}

/**
 * Native scrolling to the end of the landing: the hand-over. The walking tests that follow need the
 * window's input, so by default the visitor then presses Enter (that click is a deliberate gesture,
 * so it unlocks audio; pass `engage: false` to stay resting, as the audio tests do).
 */
async function scrollToHandOver(page: Page, { engage: engaged = true }: { engage?: boolean } = {}): Promise<void> {
  await page.goto('/');
  await waitForWorld(page);
  await expectSpine(page, 'entrance');
  await expect(canvas(page)).toHaveAttribute('data-pose', /,/);
  await scrollToProgress(page, 1);
  await expectSpine(page, 'corridor');
  await expectPoseSoon(page, { x: 0, z: HANDOVER.z, yaw: handoverYaw(page) }, 10_000);
  await settle(page);
  if (engaged) await engage(page);
}

async function tap(page: Page, isMobile: boolean, x: number, y: number): Promise<void> {
  if (isMobile) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/**
 * Brings `id`'s door well into view by looking toward it. A portrait phone's view is narrow (about
 * 28 degrees across) and turned toward the Office door at the hand-over, so a door on the other
 * wall needs a turn of the head first, as for a visitor. "Well" means clear of the screen edge,
 * where a tap would not land on it.
 */
async function bringIntoView(page: Page, id: Id): Promise<void> {
  const width = page.viewportSize()!.width;
  const visible = async () => {
    if (doorwayClocks.has(page)) await advanceDoorwayClock(page, DOOR_FRAME_MS);
    const at = (await targets(page))[id];
    return at !== undefined && at[0] > 48 && at[0] < width - 48;
  };
  if (await visible()) return;
  const side = CHAMBER_SLOTS.find((s) => s.chamber === id)!.side;
  const key = side === 'left' ? 'KeyA' : 'KeyD';
  await page.keyboard.down(key);
  await expect.poll(visible, { timeout: 15_000, intervals: [20] }).toBe(true);
  await page.keyboard.up(key);
  await settle(page);
}

async function clickDoor(page: Page, isMobile: boolean, id: Id): Promise<void> {
  const at = (await targets(page))[id];
  expect(at, `${id} is on screen`).toBeDefined();
  await tap(page, isMobile, at![0], at![1]);
}

interface Sample {
  t: number;
  x: number;
  z: number;
  yaw: number;
}

/** Records every change of the published pose, with a timestamp, from now on. */
async function recordPoses(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.querySelector('.tqw-corridor-canvas')!;
    const w = window as unknown as { __poses: { t: number; pose: string }[] };
    const sample = () => {
      const time = el.getAttribute('data-pose-time');
      if (time === null || time.trim() === '' || !Number.isFinite(Number(time))) {
        throw new Error('A recorded pose requires a finite frame timestamp');
      }
      return { t: Number(time), pose: el.getAttribute('data-pose') ?? '' };
    };
    w.__poses = [sample()];
    new MutationObserver(() => w.__poses.push(sample())).observe(el, {
      attributes: true,
      attributeFilter: ['data-pose'],
    });
  });
}

async function recorded(page: Page): Promise<Sample[]> {
  const raw = await page.evaluate(() => (window as unknown as { __poses: { t: number; pose: string }[] }).__poses);
  return raw.map(({ t, pose: p }) => {
    const [x, z, yaw] = p.split(',').map(Number);
    return { t, x: x!, z: z!, yaw: yaw! };
  });
}

/** Fastest ground speed over any window of at least `windowMs` between recorded poses, m/s. */
function peakSpeed(samples: readonly Sample[], windowMs = 150): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    for (let j = i + 1; j < samples.length; j += 1) {
      const a = samples[i]!;
      const b = samples[j]!;
      if (b.t - a.t >= windowMs) {
        peak = Math.max(peak, Math.hypot(b.x - a.x, b.z - a.z) / ((b.t - a.t) / 1000));
        break;
      }
    }
  }
  return peak;
}

/** The middle of the view, bottom edge: floor a few metres ahead. */
function floorSpot(page: Page): { x: number; y: number } {
  const v = page.viewportSize()!;
  return { x: v.width / 2, y: v.height - 24 };
}

test.describe('landing walk-in', () => {
  test('scrolling walks the camera along the entrance keys, back and forth, and lands on the hand-over', { tag: '@extended' }, async ({
    page,
  }) => {
    await page.goto('/');
    await waitForWorld(page);
    await expectSpine(page, 'entrance');
    await expectPoseSoon(page, { x: 0, z: ENTRANCE_KEYS[0]!.z, yaw: 0 }, 10_000, 0.05, 0.35);

    let last = (await pose(page)).z;
    // The hand-over is reached at 65% of the run, so 55% is most of the way there.
    for (const f of [0.1, 0.25, 0.4, 0.55]) {
      await scrollToProgress(page, f);
      await settle(page);
      const z = (await pose(page)).z;
      expect(z).toBeLessThan(last);
      last = z;
      expect((await pose(page)).yaw).toBeCloseTo(0, 1);
      expect((await pose(page)).x).toBeCloseTo(0, 2);
    }
    // Reverse scrolling walks back: no one-way door.
    await scrollToProgress(page, 0.25);
    await settle(page);
    expect((await pose(page)).z).toBeGreaterThan(last);

    await scrollToProgress(page, 1);
    await expectSpine(page, 'corridor');
    await expectPoseSoon(page, { x: 0, z: HANDOVER.z, yaw: handoverYaw(page) }, 10_000);
  });

  test('at the hand-over the view is straight on desktop and turned 12 degrees toward the Office door in portrait', { tag: '@extended' }, async ({
    page,
    isMobile,
  }) => {
    await page.goto('/');
    await waitForWorld(page);
    await expectSpine(page, 'entrance');
    await expectPoseSoon(page, { x: 0, z: ENTRANCE_KEYS[0]!.z, yaw: 0 }, 10_000, 0.05, 0.35);
    // The turn is the settle beat only (the last tenth of the walk-in, 58% to 65% of the run): before
    // it the view looks straight down the axis.
    for (const f of [0.2, 0.4, 0.5]) {
      await scrollToProgress(page, f);
      await settle(page);
      expect((await pose(page)).yaw).toBeCloseTo(0, 1);
    }
    // Part-way through the beat a portrait phone is part-way through the turn; desktop has none.
    await scrollToProgress(page, 0.62);
    await settle(page);
    const beat = (await pose(page)).yaw;
    if (isMobile) {
      expect(beat).toBeGreaterThan(5);
      expect(beat).toBeLessThan(HANDOVER_PORTRAIT_TURN_DEG);
    } else {
      expect(beat).toBeCloseTo(0, 1);
    }

    await scrollToProgress(page, 1);
    await expectSpine(page, 'corridor');
    await expectPoseSoon(page, { x: 0, z: HANDOVER.z, yaw: isMobile ? HANDOVER_PORTRAIT_TURN_DEG : 0 }, 10_000);
    await settle(page);
    // Exactly the contract's numbers, and (the point of the turn) the lit Office door is on screen.
    expect(await pose(page)).toEqual({ x: 0, z: HANDOVER.z, yaw: isMobile ? HANDOVER_PORTRAIT_TURN_DEG : 0 });
    const office = (await targets(page))[OFFICE];
    expect(office, 'the Office door is in view at the hand-over').toBeDefined();
    expect(office![0]).toBeGreaterThan(0);
    expect(office![0]).toBeLessThan(page.viewportSize()!.width);
  });

  test('the walk-in is a function of scroll alone: it stops when the scroll stops', { tag: '@extended' }, async ({ page }) => {
    await page.goto('/');
    await waitForWorld(page);
    await scrollToProgress(page, 0.48);
    await expect(canvas(page)).toHaveAttribute('data-pose', /,/);
    await settle(page);
    const rested = await pose(page);
    await page.waitForTimeout(1500);
    expect(await pose(page)).toEqual(rested);
  });

  test('real wheel scrolling on desktop walks the camera in and hands over; the wheel then scrolls the page on, it does not walk', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'a mouse wheel');
    await page.goto('/');
    await waitForWorld(page);
    await page.mouse.move(720, 450);
    for (let i = 0; i < 30; i += 1) {
      await page.mouse.wheel(0, 150);
      await page.waitForTimeout(60);
      if ((await site(page).getAttribute('data-spine')) === 'corridor') break;
    }
    await expectSpine(page, 'corridor');
    await expectPoseSoon(page, { x: 0, z: HANDOVER.z, yaw: handoverYaw(page) }, 10_000);
    // ADR 0003: arriving by scroll never captures input. Another notch scrolls the page on, past the
    // game window, and the camera stays where the hand-over left it.
    const before = await pose(page);
    const y = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 100);
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 }).toBeGreaterThan(y + 50);
    await settle(page);
    expect(await pose(page)).toEqual(before);
    await expect(site(page)).toHaveAttribute('data-engaged', 'false');
  });

  test('the field of view is 48 degrees on desktop and 58 on a portrait phone, and does not change at the hand-over', { tag: '@extended' }, async ({
    page,
    isMobile,
  }) => {
    await page.goto('/');
    await waitForWorld(page);
    const want = isMobile ? '58' : '48';
    await expect(canvas(page)).toHaveAttribute('data-fov', want);
    await scrollToProgress(page, 1);
    await expectSpine(page, 'corridor');
    await settle(page);
    await expect(canvas(page)).toHaveAttribute('data-fov', want);
  });
});

test.describe('free walking and looking', () => {
  test('W and S and the arrows walk, never faster than 1.1 m/s, and stop within a few centimetres', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'a keyboard');
    await scrollToHandOver(page);
    const start = await pose(page);
    await recordPoses(page);
    await page.keyboard.down('KeyW');
    await expect.poll(async () => start.z - (await pose(page)).z, { timeout: 15_000 }).toBeGreaterThan(1.2);
    await page.keyboard.up('KeyW');
    const released = (await pose(page)).z;
    await settle(page);
    const forward = await pose(page);
    expect(start.z - forward.z).toBeGreaterThan(1.2);
    // The stop takes 180 ms and a few centimetres: it does not coast on.
    expect(released - forward.z).toBeLessThan(0.1);
    expect(forward.x).toBe(0);
    expect(forward.yaw).toBe(0);
    // However slowly the software renderer draws, the walk never exceeds the walking pace.
    expect(peakSpeed(await recorded(page), 200)).toBeLessThanOrEqual(1.12);

    await page.keyboard.down('ArrowDown');
    await expect.poll(async () => (await pose(page)).z, { timeout: 15_000 }).toBeGreaterThan(forward.z + 1);
    await page.keyboard.up('ArrowDown');
    await settle(page);
    expect((await pose(page)).z).toBeGreaterThan(forward.z + 1);

    await page.keyboard.down('ArrowUp');
    await expect.poll(async () => (await pose(page)).z, { timeout: 15_000 }).toBeLessThan(forward.z + 0.5);
    await page.keyboard.up('ArrowUp');
    await settle(page);
  });

  test('A and D and the arrows turn, never faster than 75 degrees a second, without moving the camera', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'a keyboard');
    await scrollToHandOver(page);
    const start = await pose(page);
    await recordPoses(page);
    await page.keyboard.down('KeyD');
    await expect.poll(async () => (await pose(page)).yaw, { timeout: 15_000, intervals: [20] }).toBeGreaterThan(50);
    await page.keyboard.up('KeyD');
    const released = (await pose(page)).yaw;
    await settle(page);
    const right = await pose(page);
    // Stopping coasts a few degrees at most (180 ms).
    expect(right.yaw - released).toBeLessThan(8);
    expect(right.yaw).toBeGreaterThan(50);
    expect(right.x).toBe(start.x);
    expect(right.z).toBe(start.z);
    const samples = await recorded(page);
    let fastest = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const j = samples.findIndex((s, k) => k > i && s.t - samples[i]!.t >= 200);
      if (j > 0)
        fastest = Math.max(
          fastest,
          Math.abs(samples[j]!.yaw - samples[i]!.yaw) / ((samples[j]!.t - samples[i]!.t) / 1000),
        );
    }
    expect(fastest).toBeLessThanOrEqual(76);

    await page.keyboard.down('ArrowLeft');
    await expect.poll(async () => (await pose(page)).yaw, { timeout: 15_000, intervals: [20] }).toBeLessThan(0);
    await page.keyboard.up('ArrowLeft');
    await settle(page);
    expect((await pose(page)).yaw).toBeLessThan(0);
  });

  test('the walls hold the visitor 0.35 m off, and they slide along instead of sticking', { tag: '@extended' }, async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'a keyboard');
    await scrollToHandOver(page);
    await page.keyboard.down('KeyD');
    await expect.poll(async () => (await pose(page)).yaw, { timeout: 15_000, intervals: [20] }).toBeGreaterThan(83);
    await page.keyboard.up('KeyD');
    await settle(page);
    const facing = (await pose(page)).yaw;
    expect(facing).toBeGreaterThan(80);
    expect(facing).toBeLessThan(105);
    await page.keyboard.down('KeyW');
    await expect
      .poll(async () => (await pose(page)).x, { timeout: 60_000 })
      .toBeGreaterThan(CORRIDOR.width / 2 - CORRIDOR.wallMargin - 0.05);
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyW');
    await settle(page);
    const p = await pose(page);
    expect(p.x).toBeLessThanOrEqual(CORRIDOR.width / 2 - CORRIDOR.wallMargin + 0.001);
    expect(p.x).toBeGreaterThan(CORRIDOR.width / 2 - CORRIDOR.wallMargin - 0.05);
  });

  test('a wheel notch in the corridor walks about 0.35 m, and the opposite notch walks back', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'a mouse wheel');
    await scrollToHandOver(page);
    await page.mouse.move(720, 450);
    const start = (await pose(page)).z;
    await page.mouse.wheel(0, 100);
    await settle(page);
    const moved = start - (await pose(page)).z;
    expect(moved).toBeGreaterThan(0.25);
    expect(moved).toBeLessThan(0.45);
    await page.mouse.wheel(0, -100);
    await settle(page);
    expect(Math.abs((await pose(page)).z - start)).toBeLessThan(0.1);
  });

  test('dragging looks around without moving the camera, and is not a click on the floor', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'a mouse drag');
    await scrollToHandOver(page);
    const start = await pose(page);
    await page.mouse.move(720, 700);
    await page.mouse.down();
    await page.mouse.move(920, 700, { steps: 8 });
    await page.mouse.move(920, 640, { steps: 4 });
    await page.mouse.up();
    await settle(page);
    const looked = await pose(page);
    // Dragging right turns the view left (the world follows the pointer); 200 px is about 10 degrees.
    expect(looked.yaw).toBeLessThan(-6);
    expect(looked.yaw).toBeGreaterThan(-16);
    expect(looked.x).toBe(start.x);
    expect(looked.z).toBe(start.z);
    expect(await pitch(page)).toBeLessThan(0);
    await page.mouse.move(720, 400);
    await page.mouse.down();
    await page.mouse.move(720, 900, { steps: 10 });
    await page.mouse.up();
    expect(Math.abs(await pitch(page))).toBeLessThanOrEqual(25.05);
    expect((await pose(page)).z).toBe(start.z);
  });

  test('clicking the floor glides there and leaves the view alone', async ({ page, isMobile }) => {
    await scrollToHandOver(page);
    const start = await pose(page);
    // The bottom of the picture is the floor a few metres ahead.
    const spot = floorSpot(page);
    await tap(page, isMobile, spot.x, spot.y);
    await expect.poll(async () => (await pose(page)).z, { timeout: 15_000 }).toBeLessThan(start.z - 1);
    await settle(page, 800);
    const end = await pose(page);
    expect(end.z).toBeLessThan(start.z - 1);
    expect(end.yaw).toBe(start.yaw);
    expect(Math.abs(end.x)).toBeLessThanOrEqual(CORRIDOR.width / 2 - CORRIDOR.wallMargin);
  });
});

test.describe('doors', () => {
  // A glide is seconds of simulated time; a busy machine draws frames slowly and the simulation follows.
  test.describe.configure({ timeout: 150_000 });
  test('a click glides to frame the door and a second click opens it and reaches the chamber', async ({
    page,
    isMobile,
  }) => {
    await scrollToHandOver(page);
    await bringIntoView(page, OFFICE);
    await recordPoses(page);
    await clickDoor(page, isMobile, OFFICE);
    await expect(site(page)).toHaveAttribute('data-focus', OFFICE);
    await expect(site(page)).toHaveAttribute('data-spine', 'corridor');
    const frame = frameOf(OFFICE);
    await expectPoseSoon(page, frame);
    await settle(page);

    // It glided rather than cut: many poses on the way, turning gradually, never faster than 0.8 m/s.
    const samples = await recorded(page);
    expect(samples.length).toBeGreaterThan(8);
    expect(peakSpeed(samples)).toBeLessThanOrEqual(0.82);
    expect(samples.some((s) => Math.abs(s.yaw) > 5 && Math.abs(s.yaw) < 85)).toBe(true);
    expectPose(await pose(page), frame);
    expect(await pitch(page)).toBeLessThan(-8);

    // The door is now mid-view; the second click opens it.
    await clickDoor(page, isMobile, OFFICE);
    await expectSpine(page, 'threshold');
    await expectSpine(page, 'chamber');
    await expect(page).toHaveURL(/\/certification-office$/);
  });

  doorwayTest('opening walks the camera 1.6 m through the doorway over 1.4 s, with the view held on the door', async ({
    page,
    isMobile,
  }) => {
    // The chamber's first render blocks a software-rendered main thread for seconds, which is not
    // what this test is about: hold its code back so the choreography runs unobstructed.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/assets\/certification-office-[\w-]+\.js$/, async (route) => {
      await held;
      await route.continue();
    });
    await scrollToHandOver(page);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    doorwayClocks.add(page);
    await bringIntoView(page, OFFICE);
    await clickDoor(page, isMobile, OFFICE);
    const frame = frameOf(OFFICE);
    await expectPoseSoon(page, frame);
    await settle(page);
    await recordPoses(page);
    await clickDoor(page, isMobile, OFFICE);
    await expectSpine(page, 'threshold');
    await Promise.all([
      expect.poll(async () => (await pose(page)).x, { timeout: 8000 }).toBeCloseTo(frame.x + 1.6, 2),
      advanceDoorwayClock(page, SPINE_TIMING.handleTurnMs + SPINE_TIMING.latchMs
        + SPINE_TIMING.entryDelayMs + SPINE_TIMING.entryMs + 2 * DOOR_FRAME_MS),
    ]);
    await settle(page, 800);
    const samples = await recorded(page);
    const through = samples.filter((s) => s.x > frame.x + 0.001);
    expect(through.length).toBeGreaterThan(10);
    // Straight through the door: x only ever grows, the view never turns, and the pace stays calm.
    for (let i = 1; i < through.length; i += 1) expect(through[i]!.x).toBeGreaterThanOrEqual(through[i - 1]!.x - 1e-6);
    for (const s of samples) {
      expect(Math.abs(s.yaw - 90)).toBeLessThan(0.1);
      expect(Math.abs(s.z - frame.z)).toBeLessThan(0.002);
    }
    expect(peakSpeed(through)).toBeLessThan(1.7);
    const walk = through.at(-1)!.t - through[0]!.t;
    expect(walk).toBeGreaterThan(1100);
    expect(walk).toBeLessThan(1700);
    // The visitor waits in the doorway, door open, until the chamber arrives behind the jamb.
    await expectSpine(page, 'threshold');
    doorwayClocks.delete(page);
    await page.clock.resume();
    release();
    await expectSpine(page, 'chamber');
  });

  test('Tab to a door frames it: the view glides there and the list marks it', async ({ page }) => {
    await scrollToHandOver(page);
    await door(page, 'The Apartment', 'sealed').focus();
    await expect(site(page)).toHaveAttribute('data-focus', 'apartment');
    await expect.poll(async () => (await pose(page)).yaw, { timeout: 60_000 }).toBeCloseTo(-90, 0);
    await settle(page);
    expectPose(await pose(page), frameOf('apartment'));
    await expect(door(page, 'The Apartment', 'sealed')).toHaveAttribute('aria-current', 'true');
    // And on to the next door in corridor order.
    await door(page, 'The Tomorrow Engine', 'sealed').focus();
    await expect
      .poll(async () => (await pose(page)).z, { timeout: 60_000 })
      .toBeCloseTo(frameOf('tomorrow-engine').z, 1);
    await settle(page);
    expectPose(await pose(page), frameOf('tomorrow-engine'));
  });

  test('a sealed door rattles when tried and the visitor stays in the corridor in front of it', async ({
    page,
    isMobile,
  }) => {
    await scrollToHandOver(page);
    await bringIntoView(page, 'apartment');
    await clickDoor(page, isMobile, 'apartment');
    await expect.poll(async () => (await pose(page)).yaw, { timeout: 60_000 }).toBeCloseTo(-90, 0);
    await settle(page);
    const at = await pose(page);
    const before = await frames(page);
    await clickDoor(page, isMobile, 'apartment');
    // The rattle is a short animation: it draws frames, then the scene goes quiet again.
    await expect.poll(() => frames(page), { timeout: 3000 }).toBeGreaterThan(before + 2);
    await settle(page);
    await expectSpine(page, 'corridor');
    await expect(site(page)).toHaveAttribute('data-focus', 'apartment');
    await expect(page).toHaveURL(/\/$/);
    expect(await pose(page)).toEqual(at);
  });

  test('coming back from the Office stands the visitor in front of its door, facing it', async ({ page }) => {
    await scrollToHandOver(page);
    await door(page, OFFICE_TITLE, 'open').focus();
    await page.keyboard.press('Enter');
    await expectSpine(page, 'chamber');
    await page.goBack();
    await expectSpine(page, 'corridor');
    await expect.poll(async () => (await pose(page)).yaw).toBeCloseTo(90, 0);
    await settle(page);
    expectPose(await pose(page), frameOf(OFFICE));
    // The door has closed behind them and the scene is at rest.
    const before = await frames(page);
    await page.waitForTimeout(1000);
    expect(await frames(page)).toBe(before);
  });

  test('hovering a door with a mouse lifts its attention and then the scene is quiet again', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'hover');
    await scrollToHandOver(page);
    const at = (await targets(page))[OFFICE]!;
    const before = await frames(page);
    await page.mouse.move(at[0], at[1], { steps: 4 });
    await expect.poll(() => frames(page)).toBeGreaterThan(before);
    await expect(canvas(page)).toHaveAttribute('data-over', 'door');
    await settle(page);
    const settled = await frames(page);
    await page.waitForTimeout(800);
    expect(await frames(page)).toBe(settled);
  });
});

test.describe('the frame loop', () => {
  // A glide is seconds of simulated time; a busy machine draws frames slowly and the simulation follows.
  test.describe.configure({ timeout: 150_000 });
  test('draws no frames at all while nothing moves: landing, corridor, after a walk, after a glide', { tag: '@extended' }, async ({
    page,
  }) => {
    const quiet = async (label: string) => {
      await settle(page);
      const a = await frames(page);
      await page.waitForTimeout(1000);
      const b = await frames(page);
      expect(b - a, `idle frames over 1 s: ${label}`).toBe(0);
    };
    await page.goto('/');
    await waitForWorld(page);
    await expect(canvas(page)).toHaveAttribute('data-pose', /,/);
    // The hero is the one place the scene moves by itself: a slow arc, drawn at 15 frames a second.
    await page.waitForTimeout(500);
    const drift = await framesOver(page, 2000);
    expect(drift).toBeGreaterThan(10);
    expect(drift).toBeLessThanOrEqual(45);
    await scrollToProgress(page, 0.4);
    await quiet('mid walk-in, scroll stopped');
    await scrollToProgress(page, 1);
    await expectSpine(page, 'corridor');
    await quiet('hand-over');
    await engage(page);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(500);
    await page.keyboard.up('KeyW');
    await quiet('after walking');
    await door(page, 'The Apartment', 'sealed').focus();
    await expect.poll(async () => (await pose(page)).yaw, { timeout: 60_000 }).toBeCloseTo(-90, 0);
    await quiet('after a glide');
  });

  test('a still scene costs nothing even with the pointer moving over it', { tag: '@extended' }, async ({ page, isMobile }) => {
    test.skip(isMobile, 'a mouse');
    await scrollToHandOver(page);
    const a = await frames(page);
    for (let i = 0; i < 20; i += 1) await page.mouse.move(100 + i * 10, 700);
    await page.waitForTimeout(800);
    expect(await frames(page)).toBe(a);
  });
});

test.describe('gestures', () => {
  test('walking by scroll, wheel and drag never unlocks audio; a click or a key press does', async ({
    page,
    isMobile,
  }) => {
    await countAudioContexts(page);
    await scrollToHandOver(page, { engage: false });
    expect(await audioContexts(page)).toBe(0);
    if (!isMobile) {
      await page.mouse.move(720, 450);
      await page.mouse.wheel(0, 100);
      await settle(page);
      expect(await audioContexts(page)).toBe(0);
    }
    // The wheel scrolled the page on, so the window is partly out of view; bring it back to tap its floor.
    await page.evaluate(() => {
      const section = document.getElementById('game')!;
      const window_ = section.querySelector<HTMLElement>('.tqw-game__window')!;
      window.scrollTo(0, section.offsetTop + section.offsetHeight - window_.offsetHeight);
    });
    const spot = floorSpot(page);
    await tap(page, isMobile, spot.x, spot.y);
    await expect.poll(() => audioContexts(page)).toBeGreaterThan(0);
  });

  test('a deliberate key press unlocks audio: Enter on the game window does, a walking key at rest is the page\'s and does not', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'a keyboard');
    await countAudioContexts(page);
    await scrollToHandOver(page, { engage: false });
    expect(await audioContexts(page)).toBe(0);
    // Resting, the walking keys never reach the scene (ADR 0003), so they cannot be its gesture.
    await page.keyboard.press('KeyW');
    await page.waitForTimeout(300);
    expect(await audioContexts(page)).toBe(0);
    await page.getByRole('link', { name: 'Enter The Quiet Works' }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => audioContexts(page)).toBeGreaterThan(0);
    await expect(site(page)).toHaveAttribute('data-engaged', 'true');
  });
});

test.describe('touch', () => {
  async function cdp(page: Page): Promise<CDPSession> {
    return page.context().newCDPSession(page);
  }
  async function touch(
    session: CDPSession,
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    x?: number,
    y?: number,
  ): Promise<void> {
    await session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: x!, y: y! }],
    });
  }

  test('shows forward and back buttons of at least 48 px, named for assistive tech; desktop has none', async ({
    page,
    isMobile,
  }) => {
    await scrollToHandOver(page);
    const forward = page.getByRole('button', { name: 'Walk forward' });
    const back = page.getByRole('button', { name: 'Walk back' });
    if (!isMobile) {
      await expect(forward).toHaveCount(0);
      return;
    }
    await expect(forward).toBeVisible();
    await expect(back).toBeVisible();
    for (const button of [forward, back]) {
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(48);
      expect(box.height).toBeGreaterThanOrEqual(48);
    }
  });

  test('holding the forward button walks; letting go stops; back walks back', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch');
    await scrollToHandOver(page);
    const session = await cdp(page);
    const start = await pose(page);
    const box = (await page.getByRole('button', { name: 'Walk forward' }).boundingBox())!;
    await touch(session, 'touchStart', box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(async () => start.z - (await pose(page)).z, { timeout: 15_000 }).toBeGreaterThan(0.9);
    await touch(session, 'touchEnd');
    await settle(page);
    const forward = await pose(page);
    expect(forward.yaw).toBe(start.yaw);
    // The portrait hand-over looks 12 degrees right of the axis, and walking goes where one looks.
    expect(forward.x).toBeGreaterThan(start.x + 0.1);
    // Letting go stops it: nothing more happens.
    await page.waitForTimeout(600);
    expect(await pose(page)).toEqual(forward);
    const back = (await page.getByRole('button', { name: 'Walk back' }).boundingBox())!;
    await touch(session, 'touchStart', back.x + back.width / 2, back.y + back.height / 2);
    await expect.poll(async () => (await pose(page)).z, { timeout: 15_000 }).toBeGreaterThan(forward.z + 0.9);
    await touch(session, 'touchEnd');
    await settle(page);
  });

  test('on the landing a finger swipe scrolls the page natively and the camera walks with it', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'touch');
    await page.goto('/');
    await waitForWorld(page);
    await expectSpine(page, 'entrance');
    await expect(canvas(page)).toHaveAttribute('data-pose', /,/);
    const start = await pose(page);
    const session = await cdp(page);
    await session.send('Input.synthesizeScrollGesture', {
      x: 206,
      y: 650,
      yDistance: -700,
      speed: 1200,
      gestureSourceType: 'touch',
    });
    await settle(page);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
    expect((await pose(page)).z).toBeLessThan(start.z - 0.3);
    await expectSpine(page, 'entrance');
  });

  test('a vertical swipe walks, a horizontal drag looks without moving, a tap on the floor glides', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'touch');
    await scrollToHandOver(page);
    const session = await cdp(page);
    const start = await pose(page);
    // Finger up: forward, like scrolling down.
    await touch(session, 'touchStart', 206, 650);
    for (let i = 1; i <= 10; i += 1) await touch(session, 'touchMove', 206, 650 - i * 20);
    await touch(session, 'touchEnd');
    await settle(page);
    const swiped = await pose(page);
    expect(start.z - swiped.z).toBeGreaterThan(0.4);
    expect(swiped.yaw).toBe(start.yaw);

    await touch(session, 'touchStart', 100, 500);
    for (let i = 1; i <= 8; i += 1) await touch(session, 'touchMove', 100 + i * 15, 500);
    await touch(session, 'touchEnd');
    await settle(page);
    const looked = await pose(page);
    expect(looked.yaw).toBeLessThan(swiped.yaw - 5);
    expect(looked.z).toBe(swiped.z);
    expect(looked.x).toBe(swiped.x);
  });
});

test.describe('reduced motion switched on during the visit', () => {
  test('the Reduced motion toggle turns glides into cuts at once', async ({ page }) => {
    await scrollToHandOver(page);
    // Settings moved into the Menu (ADR 0003): open it from the game window's strip, toggle, close it.
    await page.locator('.tqw-game__strip').getByRole('button', { name: 'Menu' }).click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await menu.getByRole('button', { name: 'Reduced motion' }).click();
    await expect(menu.getByRole('button', { name: 'Reduced motion' })).toHaveAttribute('aria-pressed', 'true');
    await menu.getByRole('button', { name: 'Close the menu' }).click();
    await expect(menu).toBeHidden();
    await recordPoses(page);
    await door(page, 'The Apartment', 'sealed').focus();
    await expectPoseSoon(page, frameOf('apartment'), 10_000);
    await page.waitForTimeout(500);
    // One cut to the door's view, no glide on the way.
    expect(await recorded(page)).toHaveLength(2);
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the landing is one static view and the hand-over is a cut, never a walk', { tag: '@extended' }, async ({ page }) => {
    await page.goto('/');
    await waitForWorld(page);
    await expectSpine(page, 'entrance');
    await expectPoseSoon(page, { x: 0, z: ENTRANCE_KEYS[0]!.z, yaw: 0 }, 10_000, 0.05, 0.35);
    await recordPoses(page);
    // Reduced motion collapses the smoke run (ADR 0003): part-way along the measured journey,
    // the page has scrolled and the camera has not moved.
    await scrollToProgress(page, 0.6);
    await page.waitForTimeout(500);
    expect(await recorded(page)).toHaveLength(1);
    await scrollToProgress(page, 1);
    await expectSpine(page, 'corridor');
    await expectPoseSoon(page, { x: 0, z: HANDOVER.z, yaw: handoverYaw(page) }, 10_000);
    await page.waitForTimeout(500);
    // The landing view, then the hand-over view: a cut, with nothing in between.
    expect(await recorded(page)).toHaveLength(2);
  });

  test('focusing a door cuts to its view: one pose change, with a 120 ms dissolve over it', { tag: '@extended' }, async ({ page }) => {
    await scrollToHandOver(page);
    await recordPoses(page);
    await page.evaluate(() => {
      const overlay = document.querySelector<HTMLCanvasElement>('canvas.tqw-dissolve')!;
      const w = window as unknown as { __fade: number[] };
      w.__fade = [];
      const tick = () => {
        w.__fade.push(Number(getComputedStyle(overlay).opacity));
        if (w.__fade.length < 60) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await door(page, 'The Apartment', 'sealed').focus();
    await expectPoseSoon(page, frameOf('apartment'), 10_000);
    await page.waitForTimeout(600);
    const seen = await recorded(page);
    expect(seen).toHaveLength(2);
    expectPose(seen[1]!, frameOf('apartment'));
    const fade = await page.evaluate(() => (window as unknown as { __fade: number[] }).__fade);
    expect(Math.max(...fade)).toBeGreaterThan(0.5);
    expect(fade.at(-1)).toBe(0);
  });

  test('walking keys step between views instead of travelling', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a keyboard');
    await scrollToHandOver(page);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(600);
    await page.keyboard.up('KeyW');
    await expect(site(page)).toHaveAttribute('data-focus', OFFICE);
    await expectPoseSoon(page, frameOf(OFFICE), 10_000);
    await page.keyboard.press('ArrowDown');
    await expect(site(page)).toHaveAttribute('data-focus', '');
    await expectPoseSoon(page, { x: 0, z: HANDOVER.z, yaw: handoverYaw(page) }, 10_000);
  });

  test('opening a door goes straight through: the chamber appears with no walk', async ({ page }) => {
    await scrollToHandOver(page);
    await door(page, OFFICE_TITLE, 'open').focus();
    await page.keyboard.press('Enter');
    await expectSpine(page, 'chamber');
    await expect(page).toHaveURL(/\/certification-office$/);
  });

  test('the walk buttons on a phone become next and previous view', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch');
    await scrollToHandOver(page);
    await expect(page.getByRole('button', { name: 'Next view' })).toBeVisible();
    await page.getByRole('button', { name: 'Next view' }).tap();
    await expect(site(page)).toHaveAttribute('data-focus', OFFICE);
    await page.getByRole('button', { name: 'Previous view' }).tap();
    await expect(site(page)).toHaveAttribute('data-focus', '');
  });
});
