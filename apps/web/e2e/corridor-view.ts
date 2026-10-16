import { expect, type Page } from '@playwright/test';
import { START_VIEW } from '../src/corridor/layout.ts';
import { HERO_VIEW } from '../src/corridor/camera/viewpoints.ts';

/**
 * Where the corridor's camera stands at the two ends of the landing walk-in on this screen
 * (ADR 0004): the hero's first frame, and the starting view where free walking begins. A portrait
 * screen (taller than wide) has its own pair.
 */
export interface View {
  x: number;
  z: number;
  yaw: number;
}

const portrait = (page: Page): boolean => {
  const v = page.viewportSize()!;
  return v.height > v.width;
};

/** The raster software tier can take tens of seconds to finish its first baked world frame. */
export async function corridorDrawn(page: Page): Promise<void> {
  const surface = page.locator('.tqw-corridor-canvas');
  await expect(surface.locator('canvas')).toHaveAttribute('data-world', 'ready', { timeout: 90_000 });
  await expect(surface).toHaveAttribute('data-pose', /,/, { timeout: 90_000 });
}

/** The starting view for this screen, in the shape the specs read the published pose. */
export function startView(page: Page): View {
  const v = portrait(page) ? START_VIEW.portrait : START_VIEW.desktop;
  return { x: v.x, z: v.z, yaw: v.yawDeg };
}

export function startPitch(page: Page): number {
  return (portrait(page) ? START_VIEW.portrait : START_VIEW.desktop).pitchDeg;
}

/** The first frame of the landing for this screen. */
export function heroView(page: Page): View {
  const v = portrait(page) ? HERO_VIEW.portrait : HERO_VIEW.desktop;
  return { x: v.x, z: v.z, yaw: v.yawDeg };
}

/**
 * Waits for the spine's state with a patient timeout: on a busy host the software renderer draws a
 * frame in a second or more, and the hand-over, the doors and the chamber all wait on frames.
 */
export async function spineIs(page: Page, state: string, timeout = 90_000): Promise<void> {
  await expect(page.locator('.tqw-site')).toHaveAttribute('data-spine', state, { timeout });
}

/**
 * Frames the scene draws at the hero over `ms`, for tests whose subject is the hero's own cadence or
 * arc: they cannot say anything on a host whose software renderer draws under about two frames a
 * second, and they are skipped there, with the measured rate in the reason, rather than failing.
 */
export async function rendererDrawsAtLeast(page: Page, framesPerSecond: number, ms = 3000): Promise<{ ok: boolean; fps: number }> {
  const read = async () => Number((await page.locator('.tqw-corridor-canvas').getAttribute('data-frames')) ?? 0);
  const a = await read();
  await page.waitForTimeout(ms);
  const fps = ((await read()) - a) / (ms / 1000);
  return { ok: fps >= framesPerSecond, fps };
}

/**
 * Frames drawn over `ms` that nothing explains. The world asks for ambient windows of its own (a cuff, a luggage tag) a few
 * seconds into a visit, and frames drawn inside one are the scene's own life, so a frame counts here only when it is drawn
 * outside every window and is not the one that closes a window. An idle scene is one for which this is zero.
 */
export async function strayFramesOver(page: Page, ms: number): Promise<number> {
  await page.locator('.tqw-corridor-canvas').evaluate((el) => {
    const w = window as unknown as { __strayObserver?: MutationObserver; __strayLog: string[]; __strayStart: string };
    w.__strayObserver?.disconnect();
    w.__strayLog = [];
    w.__strayStart = el.getAttribute('data-ambient') ?? '';
    w.__strayObserver = new MutationObserver((records) => {
      for (const r of records) if (r.attributeName === 'data-frames') w.__strayLog.push(el.getAttribute('data-ambient') ?? '');
    });
    w.__strayObserver.observe(el, { attributes: true, attributeFilter: ['data-frames'] });
  });
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    const w = window as unknown as { __strayObserver?: MutationObserver; __strayLog: string[]; __strayStart: string };
    w.__strayObserver?.disconnect();
    let previousOpen = w.__strayStart !== '';
    let stray = 0;
    for (const ambient of w.__strayLog) {
      if (ambient === '' && !previousOpen) stray += 1;
      previousOpen = ambient !== '';
    }
    return stray;
  });
}
