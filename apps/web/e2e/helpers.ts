import { sceneTimeout } from './timeouts.ts';
import { expect, type Locator, type Page } from '@playwright/test';

export const app = (page: Page): Locator => page.locator('.tqw-app');

export function stampButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Hold to stamp the form' });
}

export async function expectStamps(page: Page, n: number): Promise<void> {
  await expect(app(page)).toHaveAttribute('data-stamps', String(n));
}

/**
 * The room has said it is ready. Until then its host is invisible and inert (the door's seam never shows a
 * half-built room), so nothing in it can be focused or pressed; a test that acts on the room waits for this first.
 */
export async function roomReady(page: Page): Promise<void> {
  await expect(page.locator('.tqw-chamber-host')).toHaveAttribute('data-ready', 'true', { timeout: sceneTimeout(45_000) });
}

/** One full stamp through the keyboard path: Space down (contact), Space up (lift). */
export async function stampWithKeyboard(page: Page, key: 'Space' | 'Enter' = 'Space'): Promise<void> {
  await roomReady(page);
  await approachDesk(page);
  const before = Number(await app(page).getAttribute('data-stamps'));
  await stampButton(page).focus();
  await page.keyboard.down(key);
  await expect(app(page)).toHaveAttribute('data-pressing', 'true');
  await page.keyboard.up(key);
  await expectStamps(page, before + 1);
}

/** Wait for the 3D scene to publish where its stamp handle sits on screen. */
export async function stampTarget(page: Page): Promise<{ x: number; y: number }> {
  const canvas = page.locator('.tqw-canvas');
  await expect(canvas).toHaveAttribute('data-stamp-target', /^\d+(\.\d+)?,\d+(\.\d+)?$/);
  const raw = await canvas.getAttribute('data-stamp-target');
  const [x, y] = (raw ?? '').split(',').map(Number);
  return { x: x!, y: y! };
}

/** Makes every WebGL context request fail, as on a device without WebGL. */
export async function disableWebGL(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (/webgl/i.test(type)) return null;
      return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
}

/** Counts AudioContext constructions on window.__audioContexts. */
export async function countAudioContexts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __audioContexts: number; AudioContext: typeof AudioContext };
    w.__audioContexts = 0;
    const Original = w.AudioContext;
    w.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        w.__audioContexts += 1;
      }
    };
  });
}

export async function audioContexts(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __audioContexts: number }).__audioContexts);
}

/** The core shell, carrying the spine's state as data attributes. */
export const site = (page: Page): Locator => page.locator('.tqw-site');

/**
 * Entering a chamber includes the door choreography and the chamber's first 3D frame, which
 * software WebGL in CI renders slowly; that phase gets a longer wait than the others.
 */
export async function expectSpine(page: Page, phase: 'entrance' | 'corridor' | 'threshold' | 'chamber'): Promise<void> {
  // Chamber entry can include both the door fallback and the room's readiness fallback on software WebGL.
  const timeout = phase === 'chamber' ? sceneTimeout(60_000) : phase === 'corridor' ? sceneTimeout(25_000) : undefined;
  await expect(site(page)).toHaveAttribute('data-spine', phase, timeout ? { timeout } : {});
}

/** A door's DOM equivalent, by chamber title. */
export function door(page: Page, title: string, status: 'open' | 'sealed'): Locator {
  return page.getByRole('button', { name: `${title}, ${status === 'open' ? 'open the door' : 'not yet open'}` });
}

/**
 * Opens (or tries) a door the way a keyboard visitor does in the 3D corridor: focus its DOM
 * equivalent, then Enter. Over the 3D view those buttons are only visible on focus; pointer
 * visitors use the doors in the scene.
 */
export async function activateDoor(page: Page, title: string, status: 'open' | 'sealed'): Promise<void> {
  await door(page, title, status).focus();
  await page.keyboard.press('Enter');
}

/**
 * The Menu panel (ADR 0003 moved Settings there from the header): opens it if it is shut and
 * returns it. In the game window the strip's Menu button is the one in view; in text mode there is no
 * strip, so the hero's is used.
 */
export async function openMenu(page: Page): Promise<Locator> {
  const menu = page.getByRole('dialog', { name: 'Menu' });
  if (await menu.isVisible()) return menu;
  const strip = page.locator('.tqw-game__strip').getByRole('button', { name: 'Menu' });
  await ((await strip.isVisible()) ? strip : page.getByRole('button', { name: 'Menu' }).first()).click();
  await expect(menu).toBeVisible();
  return menu;
}

/** Closes the Menu panel from its own button and waits for it to be gone. */
export async function closeMenu(page: Page): Promise<void> {
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await menu.getByRole('button', { name: 'Close the menu' }).click();
  await expect(menu).toBeHidden();
}

/** The Office station is reached before pointer/touch press tests operate the physical handle. */
export async function approachDesk(page: Page): Promise<void> {
  const places = page.locator('.tqw-places');
  const summary = places.locator(':scope > summary');
  const wasOpen = await places.evaluate((node: HTMLDetailsElement) => node.open);
  if (!wasOpen) {
    await summary.focus();
    await summary.click();
  }
  await page.getByRole('button', { name: 'Approach the desk', exact: true }).click();
  await expect(app(page)).toHaveAttribute('data-station', 'desk');
  if (!wasOpen) await summary.click();
}
