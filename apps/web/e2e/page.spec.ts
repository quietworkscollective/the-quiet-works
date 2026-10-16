import { sceneTimeout } from './timeouts.ts';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { startView } from './corridor-view.ts';
import { closeMenu, expectSpine, openMenu, site } from './helpers.ts';
import { contrast, decodePng, luminance, parseColour } from './png.ts';

/**
 * ADR 0003 in a real browser: the page as one column (hero, smoke, game window, archive, details,
 * footer), the game window's engagement (arriving by scrolling never captures input; Enter, Leave,
 * Escape and Fullscreen), the hero over the live world, reduced motion, text mode, small screens and
 * zoom, the archive (found papers, export, import, Forget) and what the page stores.
 */

const ENTER = 'Enter The Quiet Works';
const OFFICE = '/certification-office';

const isDesktop = (info: TestInfo) => info.project.name === 'desktop';
const canvas = (page: Page) => page.locator('.tqw-corridor-canvas');
const heroEnter = (page: Page) => page.getByRole('link', { name: ENTER });
const windowEnter = (page: Page) => page.getByRole('button', { name: ENTER });
const leaveButton = (page: Page) => page.getByRole('button', { name: 'Leave', exact: true });

/** Baked textures, model resources and lettering prepare before the first world frame. */
async function worldReady(page: Page): Promise<void> {
  await expect(canvas(page).locator('canvas')).toHaveAttribute('data-world', 'ready', { timeout: sceneTimeout(30_000) });
}

async function pose(page: Page): Promise<{ x: number; z: number; yaw: number }> {
  const [x, z, yaw] = ((await canvas(page).getAttribute('data-pose')) ?? '0,0,0').split(',').map(Number);
  return { x: x!, z: z!, yaw: yaw! };
}

/**
 * The camera's pose once it has finished arriving: the hand-over pose the scene publishes as its resting place. A
 * pose that merely stopped changing is not enough, because a busy machine draws frames far apart and the camera's
 * easing advances a frame at a time.
 */
async function settledPose(page: Page): Promise<{ x: number; z: number; yaw: number }> {
  // The pose is published to three decimals: arrived is exactly the hand-over (0.204 is still on its way).
  await expect.poll(async () => Math.abs((await pose(page)).z - startView(page).z) < 0.0005, { timeout: sceneTimeout(30_000) }).toBe(true);
  return pose(page);
}

/** The scroll position at which the game window's top reaches the top of the viewport. */
function gameTop(page: Page): Promise<number> {
  return page.evaluate(() => {
    const section = document.getElementById('game')!;
    const window_ = section.querySelector<HTMLElement>('.tqw-game__window');
    return section.offsetTop + section.offsetHeight - (window_?.offsetHeight ?? window.innerHeight);
  });
}

const scrollY = (page: Page): Promise<number> => page.evaluate(() => window.scrollY);
const rootOverflow = (page: Page): Promise<string> => page.evaluate(() => document.documentElement.style.overflow);

async function frames(page: Page, n = 2): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        const step = (left: number) => (left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
        step(count);
      }),
    n,
  );
}

async function fontsReady(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

async function scrollToProgress(page: Page, progress: number): Promise<void> {
  const top = await gameTop(page);
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(top * progress));
  await frames(page);
}

/** Native scrolling to the game window's top: the visitor has arrived, and nothing has been pressed. */
async function arriveByScrolling(page: Page): Promise<void> {
  await page.goto('/');
  await expectSpine(page, 'entrance');
  await worldReady(page);
  await expect(canvas(page)).toHaveAttribute('data-pose', /,/);
  await page.evaluate((y) => window.scrollTo(0, y), await gameTop(page));
  await expectSpine(page, 'corridor');
  await expect(site(page)).toHaveAttribute('data-engaged', 'false');
}

/** Arrives and then presses Enter: the visitor is in. */
async function engageWindow(page: Page): Promise<void> {
  await arriveByScrolling(page);
  await windowEnter(page).click();
  await expect(site(page)).toHaveAttribute('data-engaged', 'true');
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scrollWidth, 'the page scrolls sideways').toBeLessThanOrEqual(innerWidth);
}

/** Every box of these selectors lies inside the screen's width. */
async function within(page: Page, selectors: readonly string[]): Promise<void> {
  const width = await page.evaluate(() => document.documentElement.clientWidth);
  for (const selector of selectors) {
    for (const element of await page.locator(selector).all()) {
      const box = await element.boundingBox();
      if (!box || box.width === 0) continue;
      expect(box.x, `${selector} starts left of the screen`).toBeGreaterThanOrEqual(-0.5);
      expect(box.x + box.width, `${selector} runs off the right of the screen`).toBeLessThanOrEqual(width + 0.5);
    }
  }
}

// ----------------------------------------------------------------------------------- the hero

test.describe('the hero', () => {
  test('is UNHELD at the exhibition size, set in Plex Sans 700, with .space small under the D and the tagline below', async ({ page }, info) => {
    await page.goto('/');
    await expectSpine(page, 'entrance');
    await fontsReady(page);
    const desktop = isDesktop(info);

    const name = await page.locator('.tqw-hero__word').evaluate((word) => {
      const s = getComputedStyle(word);
      return { size: parseFloat(s.fontSize), weight: s.fontWeight, family: s.fontFamily, tracking: parseFloat(s.letterSpacing), colour: s.color };
    });
    expect(name.size).toBeCloseTo(desktop ? 136 : 73.340944, 0);
    expect(name.weight).toBe('700');
    expect(name.family).toContain('"IBM Plex Sans"');
    expect(name.tracking).toBeCloseTo(-0.025 * name.size, 1);
    expect(name.colour).toBe('rgb(238, 233, 223)');
    expect(await page.getByRole('heading', { level: 1, name: 'UNHELD' }).count()).toBe(1);

    const space = await page.locator('.tqw-hero__space').evaluate((el) => {
      const s = getComputedStyle(el);
      return { size: parseFloat(s.fontSize), weight: s.fontWeight, colour: s.color };
    });
    expect(space.size).toBeCloseTo(desktop ? 20 : 16.08382, 0);
    expect(space.weight).toBe('400');
    expect(space.colour).toBe('rgb(189, 189, 180)');

    const tagline = await page.locator('.tqw-hero__tagline').evaluate((el) => {
      const s = getComputedStyle(el);
      return { size: parseFloat(s.fontSize), family: s.fontFamily };
    });
    expect(tagline.size).toBeCloseTo(desktop ? 28 : 22.125708, 0);
    expect(tagline.family).toContain('Newsreader');

    // The D's right edge and .space's right edge line up; .space sits under it; the tagline under both. Measured once
    // the word has finished sliding to the centre as UN arrives: mid-slide it is offset from .space by design.
    await page.evaluate(async () => {
      const slide = document.getAnimations().find((a) => (a as CSSAnimation).animationName === 'tqw-recentre');
      if (slide) await slide.finished;
    });
    const geometry = await page.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector('.tqw-hero__word')!);
      const word = range.getBoundingClientRect();
      const space = document.querySelector('.tqw-hero__space')!.getBoundingClientRect();
      const tagline = document.querySelector('.tqw-hero__tagline')!.getBoundingClientRect();
      return { wordRight: word.right, wordBottom: word.bottom, spaceRight: space.right, spaceTop: space.top, spaceBottom: space.bottom, taglineTop: tagline.top };
    });
    expect(Math.abs(geometry.wordRight - geometry.spaceRight), '.space is right-aligned with the D').toBeLessThanOrEqual(name.size * 0.06);
    expect(geometry.spaceTop).toBeGreaterThanOrEqual(geometry.wordBottom - name.size * 0.3);
    expect(geometry.taglineTop).toBeGreaterThan(geometry.spaceBottom);
  });

  test('sits with its visual centre near 43% of the way down, centred across the page', async ({ page }) => {
    await page.goto('/');
    await fontsReady(page);
    const box = await page.evaluate(() => {
      const top = document.querySelector('.tqw-hero__name')!.getBoundingClientRect();
      const bottom = (document.querySelector('.tqw-hero__details') ?? document.querySelector('.tqw-hero__tagline'))!.getBoundingClientRect();
      return { centreY: (top.top + bottom.bottom) / 2, height: window.innerHeight, centreX: (top.left + top.right) / 2, width: document.documentElement.clientWidth };
    });
    expect(box.centreY / box.height).toBeGreaterThan(0.38);
    expect(box.centreY / box.height).toBeLessThan(0.48);
    expect(Math.abs(box.centreX - box.width / 2)).toBeLessThan(box.width * 0.04);
  });

  test('shows one quiet line of live details, a scroll cue and a way straight in, over the live world', async ({ page }) => {
    await page.goto('/');
    await expectSpine(page, 'entrance');
    await expect(page.locator('.tqw-hero__details')).toHaveText('1 door open');
    await expect(page.getByRole('button', { name: 'Scroll to The Quiet Works' })).toBeVisible();
    await expect(heroEnter(page)).toBeVisible();
    // The world is the page's one renderer, behind the hero (R-4): one WebGL canvas, in the game window.
    await expect(page.locator('.tqw-corridor-canvas canvas')).toHaveCount(1);
    await expect(page.locator('.tqw-game__window .tqw-corridor-canvas')).toHaveCount(1);
    await expect(canvas(page)).toHaveAttribute('data-phase', 'entrance');
    await worldReady(page);
    await expect(canvas(page)).toHaveAttribute('data-pose', /,/);
  });

  test('the first frame shows only what ADR 0003 puts there: the lockup, the cue, the way in, and the menu', async ({ page }, info) => {
    await page.goto('/');
    await expectSpine(page, 'entrance');
    // The heading is checked by its name (the word whole; its letters are decoration), the rest by what shows.
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('UNHELD');
    const shown = await page.locator('.tqw-hero').evaluate((hero) =>
      [...hero.querySelectorAll('p, button, a')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none';
        })
        .map((el) => el.textContent?.replace(/\s+/g, ' ').trim()),
    );
    const menu = isDesktop(info) ? ['Notice board', 'Menu'] : ['Menu'];
    expect(shown).toEqual([...menu, 'A space for everything we carry.', '1 door open', 'Scroll to The Quiet Works', ENTER]);
  });

  test('menu: Notice board and Menu at the top right with 44 px targets; a phone shows Menu alone', async ({ page }, info) => {
    await page.goto('/');
    const items = await page.locator('.tqw-hero__menu .tqw-menu__item').evaluateAll((els) =>
      els
        .filter((el) => el.getBoundingClientRect().width > 0)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { label: el.textContent, w: r.width, h: r.height, right: r.right, top: r.top, size: parseFloat(getComputedStyle(el).fontSize) };
        }),
    );
    expect(items.map((i) => i.label)).toEqual(isDesktop(info) ? ['Notice board', 'Menu'] : ['Menu']);
    for (const item of items) {
      expect(item.h, `${item.label} is shorter than 44 px`).toBeGreaterThanOrEqual(43.5);
      expect(item.size).toBe(isDesktop(info) ? 15 : 16);
      expect(item.top).toBeLessThan(80);
    }
    const heroRight = await page.locator('.tqw-hero').evaluate((el) => el.getBoundingClientRect().right);
    expect(Math.abs(items[items.length - 1]!.right - (heroRight - (isDesktop(info) ? 64 : 24)))).toBeLessThanOrEqual(1);
  });

  test('the scroll cue carries the visitor on to the smoke, not into the world', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Scroll to The Quiet Works' }).click();
    await expect.poll(() => scrollY(page)).toBeGreaterThan(200);
    await expectSpine(page, 'entrance');
    await expect(site(page)).toHaveAttribute('data-engaged', 'false');
  });

  test('draws one primary-text focus ring on the way in', async ({ page }) => {
    await page.goto('/');
    // Reached by keyboard, so the ring is the focus-visible one.
    for (let i = 0; i < 15 && !(await heroEnter(page).evaluate((el) => el === document.activeElement)); i += 1) await page.keyboard.press('Tab');
    await expect(heroEnter(page)).toBeFocused();
    const ring = await heroEnter(page).evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: s.outlineWidth, colour: s.outlineColor };
    });
    expect(ring).toEqual({ style: 'solid', width: '2px', colour: 'rgb(238, 233, 223)' });
  });
});

test.describe('the hero text holds its contrast over the live world', () => {
  /**
   * The real frame, not a worst-case colour: every piece of text is made transparent so only what is
   * behind it is left, the pixels in its box are read from a screenshot, and the lightest of them is
   * the worst case for light text. Sampled at three moments, so a slow drift cannot slip under it.
   */
  test('4.5 : 1 for text, 3 : 1 for large type, at rest and over time', async ({ page }) => {
    await page.goto('/');
    await expectSpine(page, 'entrance');
    await fontsReady(page);
    await worldReady(page);
    await expect(canvas(page)).toHaveAttribute('data-pose', /,/);
    await page.waitForTimeout(800);

    const targets = ['.tqw-hero__word', '.tqw-hero__space', '.tqw-hero__tagline', '.tqw-hero__details', '.tqw-hero__menu .tqw-menu__item', '.tqw-hero__cue span', '.tqw-hero__enter'];
    interface Target {
      selector: string;
      colour: readonly [number, number, number];
      large: boolean;
      rect: { left: number; right: number; top: number; bottom: number };
    }
    const read = async (): Promise<Target[]> => {
      const found: Target[] = [];
      for (const selector of targets) {
        for (const element of await page.locator(selector).all()) {
          const info = await element.evaluate((el) => {
            const s = getComputedStyle(el);
            const range = document.createRange();
            range.selectNodeContents(el);
            const r = range.getBoundingClientRect();
            return { colour: s.color, size: parseFloat(s.fontSize), weight: Number(s.fontWeight), rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } };
          });
          if (info.rect.right - info.rect.left < 2) continue;
          found.push({ selector, colour: parseColour(info.colour), large: info.size >= 24 || (info.size >= 18.66 && info.weight >= 700), rect: info.rect });
        }
      }
      return found;
    };
    const items = await read();
    expect(items.length).toBeGreaterThanOrEqual(7);
    // Through the CSSOM: the page's own policy (style-src 'self') rightly refuses an injected stylesheet.
    await page.evaluate(() => {
      for (const el of document.querySelectorAll<HTMLElement | SVGElement>('.tqw-hero, .tqw-hero *')) {
        el.style.setProperty('color', 'transparent', 'important');
        el.style.setProperty('text-shadow', 'none', 'important');
        el.style.setProperty('text-decoration-color', 'transparent', 'important');
        if (el instanceof SVGElement) el.style.setProperty('visibility', 'hidden', 'important');
      }
    });

    for (const moment of [0, 1200, 1200]) {
      await page.waitForTimeout(moment);
      const raster = decodePng(await page.screenshot({ scale: 'css' }));
      for (const { selector, colour, large, rect } of items) {
        const lums: Array<{ lum: number; px: readonly [number, number, number] }> = [];
        for (let y = Math.floor(rect.top) - 2; y <= Math.ceil(rect.bottom) + 2; y += 2) {
          for (let x = Math.floor(rect.left) - 2; x <= Math.ceil(rect.right) + 2; x += 2) {
            const px = raster.at(x, y);
            lums.push({ lum: luminance(px), px });
          }
        }
        lums.sort((a, b) => a.lum - b.lum);
        // The 99.5th percentile: the lightest the text's own ground gets, without one stray pixel deciding it.
        const lightest = lums[Math.min(lums.length - 1, Math.floor(lums.length * 0.995))]!.px;
        const minimum = large ? 3 : 4.5;
        expect(contrast(colour, lightest), `${selector} at ${moment} ms`).toBeGreaterThanOrEqual(minimum);
      }
    }
  });
});

// ----------------------------------------------------------------------------------- the lockup's motion

/** Every animation the hero is running, paused and set to `ms` of its own clock: a frame exactly that far into the timeline. */
async function seekHero(page: Page, ms: number): Promise<void> {
  await page.evaluate((time) => {
    for (const animation of document.getAnimations()) {
      const target = (animation.effect as KeyframeEffect | null)?.target;
      if (target instanceof Element && target.closest('.tqw-hero')) {
        animation.pause();
        animation.currentTime = time;
      }
    }
  }, ms);
}

async function heroArrives(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => document.querySelector('.tqw-hero')?.getAttribute('data-arrive') === 'run');
}

const letterOpacity = (page: Page, nth: number): Promise<number> =>
  page.locator('.tqw-hero__letter').nth(nth).locator('.tqw-hero__arrive').evaluate((el) => Number(getComputedStyle(el).opacity));
const opacityOf = (page: Page, selector: string): Promise<number> => page.locator(selector).evaluate((el) => Number(getComputedStyle(el).opacity));

test.describe('the hero\'s word moves, and means it (the word is about being let go)', () => {
  test('reads "UNHELD" whole to assistive technology, whatever the letters do', async ({ page }) => {
    await heroArrives(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('UNHELD');
    expect(await page.locator('.tqw-hero__word').getAttribute('aria-hidden')).toBe('true');
    await seekHero(page, 1000);
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('UNHELD');
  });

  test('arrives on its timeline: HELD first and still, UN from the left at 700 ms, .space, the tagline and the details after', async ({ page }) => {
    await heroArrives(page);
    // 300 ms: HELD is up (or on its way) and UN, .space, the tagline and the details are not there yet.
    await seekHero(page, 300);
    for (const nth of [2, 3, 4, 5]) expect(await letterOpacity(page, nth), `HELD letter ${nth}`).toBeGreaterThan(0.4);
    for (const nth of [0, 1]) expect(await letterOpacity(page, nth), `UN letter ${nth}`).toBe(0);
    expect(await opacityOf(page, '.tqw-hero__space')).toBe(0);
    // HELD is perfectly still: no rest offset yet.
    const stillHeld = await page
      .locator('.tqw-hero__letter')
      .nth(3)
      .locator('.tqw-hero__arrive')
      .evaluate((el) => {
        const transform = getComputedStyle(el).transform;
        return transform === 'none' || new DOMMatrix(transform).isIdentity;
      });
    expect(stillHeld).toBe(true);
    // The word is held off-centre by half of UN's width, so HELD sits on the centre.
    const lead = await page.locator('.tqw-hero__word').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
    expect(lead).toBeLessThan(-20);

    // 1000 ms: UN is arriving (part-way, blurred) and the word is part-way home.
    await seekHero(page, 1000);
    const un = await letterOpacity(page, 0);
    expect(un).toBeGreaterThan(0.05);
    expect(un).toBeLessThan(0.99);
    const blur = await page.locator('.tqw-hero__letter').nth(0).locator('.tqw-hero__arrive').evaluate((el) => getComputedStyle(el).filter);
    expect(blur).toMatch(/blur/);
    const mid = await page.locator('.tqw-hero__word').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
    expect(mid).toBeGreaterThan(lead);
    expect(mid).toBeLessThanOrEqual(0);

    // 1900 / 2200 / 2500 ms: .space, then the tagline, then the details, each in turn and by opacity alone.
    await seekHero(page, 1900);
    expect(await opacityOf(page, '.tqw-hero__space')).toBeGreaterThan(0);
    expect(await opacityOf(page, '.tqw-hero__tagline')).toBe(0);
    await seekHero(page, 2200);
    expect(await opacityOf(page, '.tqw-hero__tagline')).toBeGreaterThan(0);
    expect(await opacityOf(page, '.tqw-hero__details')).toBe(0);
    await seekHero(page, 2500);
    expect(await opacityOf(page, '.tqw-hero__details')).toBeGreaterThan(0);
    await seekHero(page, 3200);
    for (const selector of ['.tqw-hero__space', '.tqw-hero__tagline', '.tqw-hero__details']) expect(await opacityOf(page, selector), selector).toBe(1);
    for (let nth = 0; nth < 6; nth += 1) expect(await letterOpacity(page, nth), `letter ${nth}`).toBe(1);
  });

  test('is released at 1.25 s: each letter settles on its own small offset, none the same', async ({ page }) => {
    await heroArrives(page);
    await seekHero(page, 2700);
    const rests = await page.locator('.tqw-hero__arrive').evaluateAll((els) =>
      els.map((el) => {
        const m = new DOMMatrix(getComputedStyle(el).transform);
        return { x: Math.round(m.m41 * 100) / 100, y: Math.round(m.m42 * 100) / 100, rotate: Math.round(Math.atan2(m.b, m.a) * (180 / Math.PI) * 100) / 100 };
      }),
    );
    expect(new Set(rests.map((r) => `${r.x},${r.y},${r.rotate}`)).size).toBe(6);
    for (const rest of rests) {
      expect(Math.abs(rest.x)).toBeLessThanOrEqual(2);
      expect(Math.abs(rest.y)).toBeLessThanOrEqual(2);
      expect(Math.abs(rest.rotate)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(rest.x) + Math.abs(rest.y)).toBeGreaterThan(0.2);
    }
  });

  test('then breathes, very slowly: never more than 2 px or 0.35 degrees from where it rests, never in unison', async ({ page }) => {
    await heroArrives(page);
    const stats = await page.evaluate(() => {
      const glyphs = [...document.querySelectorAll<HTMLElement>('.tqw-hero__glyph')];
      const rows = glyphs.map((glyph) => {
        const animation = glyph.getAnimations().find((a) => (a as CSSAnimation).animationName === 'tqw-breathe')!;
        const delay = Number(animation.effect!.getTiming().delay);
        const period = Number(animation.effect!.getTiming().duration);
        let maxY = 0;
        let maxRotate = 0;
        const atQuarter: number[] = [];
        for (let t = delay; t <= delay + period * 2; t += period / 80) {
          animation.pause();
          animation.currentTime = t;
          const m = new DOMMatrix(getComputedStyle(glyph).transform);
          maxY = Math.max(maxY, Math.abs(m.m42));
          maxRotate = Math.max(maxRotate, Math.abs(Math.atan2(m.b, m.a) * (180 / Math.PI)));
          if (Math.abs(t - (delay + period * 0.25)) < period / 160) atQuarter.push(m.m42);
        }
        return { maxY, maxRotate, period, quarter: atQuarter[0] ?? 0 };
      });
      return rows;
    });
    expect(stats).toHaveLength(6);
    for (const row of stats) {
      expect(row.maxY).toBeLessThanOrEqual(2);
      expect(row.maxRotate).toBeLessThanOrEqual(0.35 + 0.01);
      expect(row.maxY, 'it really moves').toBeGreaterThan(0.8);
      expect(row.period).toBeGreaterThanOrEqual(9000);
      expect(row.period).toBeLessThanOrEqual(13000);
    }
    expect(new Set(stats.map((r) => r.period)).size, 'six different periods').toBe(6);
    expect(new Set(stats.map((r) => Math.round(r.quarter * 100))).size, 'six different strokes at the same moment').toBeGreaterThan(3);
  });

  test('is let go into the smoke as the visitor scrolls, upward and apart, and comes back as they scroll back', async ({ page }) => {
    await heroArrives(page);
    await seekHero(page, 3200);
    const read = () =>
      page.locator('.tqw-hero__letter').evaluateAll((els) =>
        els.map((el) => {
          const m = new DOMMatrix(getComputedStyle(el).transform);
          return { x: m.m41, y: m.m42, opacity: Number(getComputedStyle(el).opacity) };
        }),
      );
    const rest = await read();
    for (const letter of rest) expect(letter).toEqual({ x: 0, y: 0, opacity: 1 });
    await scrollToProgress(page, 0.1);
    const mid = await read();
    // Upward (each at its own rate, between 6 and 18 px at full release) and apart (left letters left, right letters right).
    for (const letter of mid) expect(letter.y).toBeLessThan(0);
    expect(new Set(mid.map((l) => Math.round(l.y * 10))).size).toBe(6);
    expect(mid[0]!.x).toBeLessThan(mid[1]!.x);
    expect(mid[1]!.x).toBeLessThan(mid[4]!.x);
    expect(mid[4]!.x).toBeLessThan(mid[5]!.x);
    expect(mid[0]!.x).toBeLessThan(0);
    expect(mid[5]!.x).toBeGreaterThan(0);
    await scrollToProgress(page, 0.2);
    const full = await read();
    for (const [index, letter] of full.entries()) {
      expect(letter.y, `letter ${index}`).toBeLessThanOrEqual(-6);
      expect(letter.y, `letter ${index}`).toBeGreaterThanOrEqual(-18.01);
      expect(letter.opacity, 'fading with the veil').toBeLessThan(1);
    }
    // Reversible: scrolling back to the top puts the word back, exactly.
    await scrollToProgress(page, 0);
    for (const letter of await read()) expect(letter).toEqual({ x: 0, y: 0, opacity: 1 });
  });

  test('gathers back for a moment when the wordmark is touched: the breath halves, then returns', async ({ page }, info) => {
    test.skip(!isDesktop(info), 'a mouse');
    test.setTimeout(150_000);
    await heroArrives(page);
    const lockup = page.locator('.tqw-hero__lockup');
    const reach = () =>
      page.evaluate(() => {
        const glyphs = [...document.querySelectorAll<HTMLElement>('.tqw-hero__glyph')];
        let max = 0;
        for (const glyph of glyphs) {
          const animation = glyph.getAnimations().find((a) => (a as CSSAnimation).animationName === 'tqw-breathe')!;
          const delay = Number(animation.effect!.getTiming().delay);
          const period = Number(animation.effect!.getTiming().duration);
          animation.pause();
          animation.currentTime = delay + period * 0.25;
          max = Math.max(max, Math.abs(new DOMMatrix(getComputedStyle(glyph).transform).m42));
        }
        return max;
      });
    const calm = await reach();
    expect(calm).toBeGreaterThan(1);
    // The breath eases to half while the wordmark is held. The easing advances with the frames the page draws, so
    // on a busy machine one hold can end before a frame has shown it: touch it again until it is seen.
    await expect
      .poll(
        async () => {
          await page.mouse.move(5, 5);
          await lockup.hover();
          await page.waitForTimeout(450);
          // Held, or this touch was not seen yet: try again rather than measure a breath that was never gathered.
          if ((await lockup.getAttribute('data-held')) !== 'true') return Number.POSITIVE_INFINITY;
          return reach();
        },
        { timeout: 60_000, intervals: [0] },
      )
      .toBeLessThan(calm * 0.65);
    await page.mouse.move(5, 5);
    await expect(lockup).toHaveAttribute('data-held', 'false', { timeout: 4000 });
    await page.waitForTimeout(900);
    expect(await reach()).toBeGreaterThan(calm * 0.9);
    // It is not a control: no pointer cursor, no role, no tab stop.
    expect(await lockup.evaluate((el) => getComputedStyle(el).cursor)).not.toBe('pointer');
    expect(await lockup.getAttribute('tabindex')).toBeNull();
  });

  test('makes no frames while the hero is off screen: every animation is paused, and they run again on the way back', async ({ page }) => {
    await heroArrives(page);
    const states = () =>
      page.evaluate(() => {
        const mine = document.getAnimations().filter((a) => {
          const target = (a.effect as KeyframeEffect | null)?.target;
          return target instanceof Element && target.closest('.tqw-hero');
        });
        return { count: mine.length, running: mine.filter((a) => a.playState === 'running').length };
      });
    await expect.poll(async () => (await states()).running).toBeGreaterThan(5);
    await scrollToProgress(page, 1);
    await expect(page.locator('.tqw-hero')).toHaveAttribute('data-visible', 'false');
    const away = await states();
    expect(away.count).toBeGreaterThan(10);
    expect(away.running).toBe(0);
    await scrollToProgress(page, 0);
    await expect(page.locator('.tqw-hero')).toHaveAttribute('data-visible', 'true');
    await expect.poll(async () => (await states()).running).toBeGreaterThan(5);
  });

  test('moves only by transform and opacity: the page is never laid out again for it', async ({ page }) => {
    await heroArrives(page);
    const properties = await page.evaluate(() => {
      const found = new Set<string>();
      for (const animation of document.getAnimations()) {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        if (!(target instanceof Element) || !target.closest('.tqw-hero')) continue;
        for (const frame of (animation.effect as KeyframeEffect).getKeyframes()) {
          for (const key of Object.keys(frame)) if (!['offset', 'easing', 'composite', 'computedOffset'].includes(key)) found.add(key);
        }
      }
      return [...found].sort();
    });
    expect(properties.length).toBeGreaterThan(0);
    for (const property of properties) expect(['opacity', 'transform', 'translate', 'filter'], property).toContain(property);
  });
});

test.describe('the hero\'s word, with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('is the whole lockup at once, faded in over 200 ms, and perfectly still', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.tqw-hero')).toHaveAttribute('data-motion', 'still');
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('UNHELD');
    const fade = await page.locator('.tqw-hero__lockup').evaluate((el) => {
      const running = el.getAnimations().map((a) => ({ name: (a as CSSAnimation).animationName, duration: Number(a.effect!.getTiming().duration) }));
      return running;
    });
    // Exactly the one fade, 200 ms (an empty list would pass an every()): the page's own rule outranks the blanket
    // reduced-motion rule that would otherwise leave nothing to run.
    expect(fade).toEqual([{ name: 'tqw-fade-in', duration: 200 }]);
    await page.waitForTimeout(500);
    for (const selector of ['.tqw-hero__letter', '.tqw-hero__arrive', '.tqw-hero__glyph']) {
      for (const el of await page.locator(selector).all()) {
        expect(await el.evaluate((node) => getComputedStyle(node).transform), selector).toBe('none');
        expect(await el.evaluate((node) => Number(getComputedStyle(node).opacity)), selector).toBe(1);
      }
    }
    for (const selector of ['.tqw-hero__space', '.tqw-hero__tagline', '.tqw-hero__details', '.tqw-hero__lockup']) {
      expect(await opacityOf(page, selector), selector).toBe(1);
    }
    // Nothing is running any more: no frames for the word at all.
    const running = await page.evaluate(() =>
      document.getAnimations().filter((a) => {
        const target = (a.effect as KeyframeEffect | null)?.target;
        return target instanceof Element && target.closest('.tqw-hero') && a.playState === 'running';
      }).length,
    );
    expect(running).toBe(0);
  });

  test('does not let the word go into the smoke: scrolling moves the page and nothing else', async ({ page }) => {
    await page.goto('/');
    await scrollToProgress(page, 0.5);
    const letters = await page.locator('.tqw-hero__letter').evaluateAll((els) => els.map((el) => [getComputedStyle(el).transform, Number(getComputedStyle(el).opacity)]));
    for (const [transform, opacity] of letters) {
      expect(transform).toBe('none');
      expect(opacity).toBe(1);
    }
  });
});

// ----------------------------------------------------------------------------------- the poster

test.describe('the hero\'s poster', () => {
  const HOLD = /CorridorScene-[\w-]+\.js$/;

  test('is there from the first paint, before the 3D scene has loaded, and dissolves once the live scene has drawn', async ({ page }, info) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(HOLD, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto('/');
    const poster = page.locator('.tqw-poster');
    await expect(poster).toHaveCount(1);
    await expect(poster).toHaveAttribute('data-ready', 'false');
    const image = poster.locator('img');
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    // The right still for the screen: the portrait one on a phone, the landscape one on a desktop.
    expect(await image.evaluate((img: HTMLImageElement) => img.currentSrc)).toContain(isDesktop(info) ? 'poster-hero-1440x900.webp' : 'poster-hero-412x915.webp');
    expect(await poster.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);
    await expect(site(page)).toHaveAttribute('data-scene-ready', 'false');
    // It is not black behind the hero: the poster covers the world's whole window.
    const covers = await page.evaluate(() => {
      const window_ = document.querySelector('.tqw-game__window')!.getBoundingClientRect();
      const poster_ = document.querySelector('.tqw-poster')!.getBoundingClientRect();
      return { dw: Math.abs(window_.width - poster_.width), dh: Math.abs(window_.height - poster_.height) };
    });
    expect(covers.dw).toBeLessThanOrEqual(1);
    expect(covers.dh).toBeLessThanOrEqual(1);

    release();
    await expect(site(page)).toHaveAttribute('data-scene-ready', 'true', { timeout: sceneTimeout(30_000) });
    await expect(poster).toHaveAttribute('data-ready', 'true');
    // Dissolved over 400 ms, then removed.
    expect(await poster.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0.4s');
    await expect(poster).toHaveCount(0, { timeout: 5000 });
    await expect(canvas(page)).toBeAttached();
  });

  test('is fetched at once and at high priority, before the script has run', async ({ page }, info) => {
    await page.goto('/');
    const links = await page.locator('head link[rel="preload"][as="image"]').evaluateAll((els) =>
      els.map((el) => ({ href: el.getAttribute('href'), media: el.getAttribute('media'), priority: el.getAttribute('fetchpriority') })),
    );
    expect(links).toEqual([
      { href: '/poster-hero-1440x900.webp', media: '(orientation: landscape)', priority: 'high' },
      { href: '/poster-hero-412x915.webp', media: '(orientation: portrait)', priority: 'high' },
    ]);
    void info;
  });

  test('is two WebP stills under 180 KB each, served from the site itself', async ({ request }) => {
    for (const file of ['poster-hero-1440x900.webp', 'poster-hero-412x915.webp']) {
      const response = await request.get(`/${file}`);
      expect(response.ok(), file).toBe(true);
      expect(response.headers()['content-type'], file).toContain('image/webp');
      expect((await response.body()).length, file).toBeLessThan(180_000);
    }
  });

  test('is not there when the visit begins in a room: nothing covers the chamber', async ({ page }) => {
    await page.goto(OFFICE);
    await expectSpine(page, 'chamber');
    await expect(page.locator('.tqw-poster')).toHaveCount(0);
  });

  test('is not there in text mode, which has no world to wait for', async ({ page }) => {
    await page.goto('/?mode=text');
    await expect(page.locator('.tqw-poster')).toHaveCount(0);
    await expect(site(page)).toHaveAttribute('data-scene-ready', 'false');
  });

  test('dissolves over the short dissolve under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(HOLD, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto('/');
    const poster = page.locator('.tqw-poster');
    await expect(poster).toHaveCount(1);
    expect(await poster.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0.12s');
    release();
    await expect(poster).toHaveCount(0, { timeout: sceneTimeout(30_000) });
  });
});

// ----------------------------------------------------------------------------------- the door seam

test.describe('the door\'s seam: a room is never shown before it is ready', () => {
  // A room is a real scene: on a machine with other work on it a frame can take seconds, and a 400 ms
  // crossfade only advances when frames are drawn. Generous budgets, the assertions unchanged.
  test.describe.configure({ timeout: 150_000 });
  const OFFICE_CHUNK = /\/assets\/certification-office-[\w-]+\.js$/;
  const FADED_IN = { timeout: 60_000 };

  /** Records, every animation frame, the chamber host's opacity and whether it has said it is ready. */
  async function recordHost(page: Page): Promise<void> {
    await page.evaluate(() => {
      const w = window as unknown as { __host: Array<[number, string | null]> };
      w.__host = [];
      const tick = () => {
        const host = document.querySelector<HTMLElement>('.tqw-chamber-host');
        if (host) w.__host.push([Number(getComputedStyle(host).opacity), host.getAttribute('data-ready')]);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }
  const recorded = (page: Page) => page.evaluate(() => (window as unknown as { __host: Array<[number, string | null]> }).__host);

  test('arriving at a room by its URL: hidden, out of reach and behind a coal veil until it is ready, then in', async ({ page }) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(OFFICE_CHUNK, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(OFFICE);
    const host = page.locator('.tqw-chamber-host');
    await expect(host).toHaveCount(1);
    await expect(host).toHaveAttribute('data-ready', 'false');
    expect(await host.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(0);
    expect(await host.getAttribute('inert')).not.toBeNull();
    const veil = page.locator('.tqw-seam-veil');
    await expect(veil).toHaveAttribute('data-held', 'true');
    expect(await veil.evaluate((el) => [Number(getComputedStyle(el).opacity), getComputedStyle(el).backgroundColor])).toEqual([1, 'rgb(23, 25, 24)']);
    await page.waitForTimeout(800);
    expect(await host.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(0);

    await recordHost(page);
    release();
    await expectSpine(page, 'chamber');
    await expect(host).toHaveAttribute('data-ready', 'true');
    await expect.poll(() => host.evaluate((el) => Number(getComputedStyle(el).opacity)), FADED_IN).toBe(1);
    await expect(veil).toHaveAttribute('data-held', 'false');
    // Not one frame showed any of the room before it said it was ready.
    const frames = await recorded(page);
    expect(frames.length).toBeGreaterThan(5);
    expect(frames.filter(([opacity, ready]) => opacity > 0 && ready !== 'true')).toEqual([]);
  });

  test('walking in through the door: the doorway is held, then a coal veil once the seam has passed, then the room crossfades in', async ({ page }) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(OFFICE_CHUNK, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto('/');
    await heroEnter(page).click();
    await expectSpine(page, 'corridor');
    await worldReady(page);
    await page.getByRole('button', { name: 'The Certification Office, open the door' }).focus();
    await page.keyboard.press('Enter');
    await expectSpine(page, 'threshold');
    // The room may prepare behind the closed doorway, but it is hidden and out of reach.
    const host = page.locator('.tqw-chamber-host');
    await expect(host).toHaveCount(1);
    await expect(host).toHaveAttribute('data-seam', 'false');
    await expect(host).toHaveAttribute('data-ready', 'false');
    expect(await host.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(0);
    await expect(page.locator('.tqw-seam-veil')).toHaveCount(0);
    await expect(canvas(page)).toBeAttached();
    await page.waitForTimeout(700);
    await expectSpine(page, 'threshold');
    expect(await host.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(0);
    await expect(host).toHaveAttribute('data-seam', 'false');

    await recordHost(page);
    release();
    await expectSpine(page, 'chamber');
    await expect.poll(() => host.evaluate((el) => Number(getComputedStyle(el).opacity)), FADED_IN).toBe(1);
    const frames = await recorded(page);
    expect(frames.filter(([opacity, ready]) => opacity > 0 && ready !== 'true')).toEqual([]);
  });

  test('crosses over the seam: the room is part-way visible for a moment, not cut in', async ({ page }) => {
    // Freeze the native CSS timeline before loading so a slow frame cannot skip the fade.
    const animationClock = await page.context().newCDPSession(page);
    await animationClock.send('Animation.enable');
    await animationClock.send('Animation.setPlaybackRate', { playbackRate: 0 });
    try {
      await page.goto(OFFICE);
      await recordHost(page);
      await expectSpine(page, 'chamber');
      const host = page.locator('.tqw-chamber-host');
      for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
        await host.evaluate((element, fraction) => {
          const transition = element.getAnimations().find(animation =>
            animation instanceof CSSTransition && animation.transitionProperty === 'opacity');
          if (!transition?.effect) return;
          transition.pause();
          transition.currentTime = Number(transition.effect.getComputedTiming().duration) * fraction;
        }, progress);
        await frames(page);
      }
      await expect.poll(async () => (await recorded(page)).some(([opacity]) => opacity === 1), FADED_IN).toBe(true);
      const opacities = (await recorded(page)).map(([opacity]) => opacity);
      expect(opacities.some((o) => o > 0 && o < 1), 'a crossfade, not a cut').toBe(true);
      // Never brighter, then dimmer: a single rise.
      const rising = opacities.filter((o) => o > 0);
      for (let i = 1; i < rising.length; i += 1) expect(rising[i]!).toBeGreaterThanOrEqual(rising[i - 1]! - 0.001);
    } finally {
      await animationClock.send('Animation.setPlaybackRate', { playbackRate: 1 });
      await animationClock.detach();
    }
  });

  test('under reduced motion the room comes in over the short dissolve, and is still never seen early', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(OFFICE);
    const host = page.locator('.tqw-chamber-host');
    await expect(host).toHaveCount(1);
    expect(await host.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0.12s');
    await expect(host).toHaveAttribute('data-ready', 'true', { timeout: sceneTimeout(30_000) });
    await expect.poll(() => host.evaluate((el) => Number(getComputedStyle(el).opacity)), FADED_IN).toBe(1);
  });

  test('text mode has no half-built room to hide: the room is simply there', async ({ page }) => {
    await page.goto(`${OFFICE}?mode=text`);
    const host = page.locator('.tqw-chamber-host');
    await expect(host).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('.tqw-seam-veil')).toHaveCount(0);
    expect(await host.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);
  });
});

// ----------------------------------------------------------------------------------- sections

test.describe('the page is one column of sections', () => {
  test('the hero and game fill their viewports, then content-height archive, details and footer follow in order', async ({ page }) => {
    await page.goto('/');
    await expectSpine(page, 'entrance');
    const layout = await page.evaluate(() => {
      const at = (selector: string) => {
        const r = document.querySelector(selector)!.getBoundingClientRect();
        return { top: r.top + window.scrollY, height: r.height, minHeight: getComputedStyle(document.querySelector(selector)!).minHeight };
      };
      return { hero: at('.tqw-hero'), game: at('#game'), archive: at('#archive'), details: at('#details'), footer: at('footer.tqw-footer'), vh: window.innerHeight };
    });
    const { vh } = layout;
    expect(layout.hero.height).toBeGreaterThanOrEqual(vh - 1);
    for (const section of [layout.archive, layout.details, layout.footer]) {
      expect(section.minHeight).toBe('0px');
      expect(section.height).toBeGreaterThan(0);
    }
    // The window's section spans the hero and the smoke run; every other section follows it, edge to edge.
    expect(layout.game.top).toBe(0);
    expect(Math.abs(layout.game.height - vh * 3.5)).toBeLessThanOrEqual(1);
    expect(Math.abs(layout.archive.top - (layout.game.top + layout.game.height))).toBeLessThanOrEqual(1);
    expect(Math.abs(layout.details.top - (layout.archive.top + layout.archive.height))).toBeLessThanOrEqual(1);
    expect(Math.abs(layout.footer.top - (layout.details.top + layout.details.height))).toBeLessThanOrEqual(1);
  });

  test('the smoke run is two and a half viewports before the window, and the window comes to rest in the last of them', async ({ page }) => {
    await page.goto('/');
    const vh = await page.evaluate(() => window.innerHeight);
    expect(Math.abs((await gameTop(page)) - vh * 2.5)).toBeLessThanOrEqual(1);
    const pinned = await page.evaluate(() => {
      const w = document.querySelector('.tqw-game__window')!;
      const before = w.getBoundingClientRect().top;
      window.scrollTo(0, 400);
      return { before, during: w.getBoundingClientRect().top };
    });
    // Sticky: it does not travel with the scroll, so the world stays behind the hero and the smoke.
    expect(pinned.before).toBe(0);
    expect(pinned.during).toBe(0);
  });

  test('scrolling is native: it never snaps, jumps or eases on its own', async ({ page }) => {
    await page.goto('/');
    const top = await gameTop(page);
    await page.evaluate((y) => window.scrollTo(0, y), Math.round(top * 0.37));
    const resting = await scrollY(page);
    await page.waitForTimeout(700);
    expect(await scrollY(page)).toBe(resting);
    for (const selector of ['html', 'body']) {
      const style = await page.locator(selector).evaluate((el) => ({ snap: getComputedStyle(el).scrollSnapType, behavior: getComputedStyle(el).scrollBehavior }));
      expect(style, selector).toEqual({ snap: 'none', behavior: 'auto' });
    }
  });

  test('the smoke veil is clear at the top and at the window, and fully covering through the middle of the run', async ({ page }) => {
    await page.goto('/');
    const veil = page.locator('.tqw-veil');
    for (const [progress, coverage] of [
      [0, '0.000'],
      [0.2, '0.150'],
      [0.7, '1.000'],
      [0.8, '1.000'],
      [1, '0.000'],
    ] as const) {
      await scrollToProgress(page, progress);
      await expect(veil, `at ${progress}`).toHaveAttribute('data-coverage', coverage);
    }
  });

  test('the veil makes its texture once, from one 256 px image, and never touches the network for it', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto('/');
    await expect(page.locator('.tqw-veil')).toHaveAttribute('data-textured', 'true');
    const source = await page.locator('.tqw-veil').evaluate((el) => (el as HTMLElement).style.getPropertyValue('--tqw-smoke'));
    expect(source).toMatch(/^url\("blob:/);
    const size = await page.evaluate(
      (url) =>
        new Promise<[number, number]>((resolve) => {
          const image = new Image();
          image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
          image.src = url.slice(5, -2);
        }),
      source,
    );
    expect(size).toEqual([256, 256]);
    expect(requests.filter((url) => /smoke|noise/i.test(url))).toEqual([]);
  });

  test('the controls appear as the smoke clears: out of sight and out of the tab order before, in view at the window', async ({ page }) => {
    await page.goto('/');
    await scrollToProgress(page, 0.5);
    await expect(windowEnter(page)).toBeHidden();
    await expect(page.locator('.tqw-game__window')).toHaveAttribute('data-chrome', 'off');
    await scrollToProgress(page, 1);
    await expect(windowEnter(page)).toBeVisible();
    await expect(page.locator('.tqw-game__window')).toHaveAttribute('data-chrome', 'on');
  });
});

// ----------------------------------------------------------------------------------- engagement

test.describe('the game window: resting', () => {
  test('arriving by scrolling shows the strip and the Enter control, and captures nothing', async ({ page }) => {
    await arriveByScrolling(page);
    await expect(page.locator('.tqw-game__title')).toHaveText('The Quiet Works');
    await expect(page.getByRole('button', { name: 'Fullscreen' })).toBeVisible();
    await expect(windowEnter(page)).toBeVisible();
    await expect(page.getByText('Enter to walk. Leave to scroll the page.')).toBeVisible();
    await expect(leaveButton(page)).toHaveCount(0);
    expect(await rootOverflow(page)).not.toBe('hidden');
    expect(await page.evaluate(() => document.querySelector('.tqw-game__window')!.getAttribute('data-engaged'))).toBe('false');
  });

  test('a real wheel scrolls through the hand-over and on down the page: scrolling never takes the page', async ({ page }, info) => {
    test.skip(!isDesktop(info), 'a mouse wheel');
    await page.goto('/');
    await worldReady(page);
    await expect(canvas(page)).toHaveAttribute('data-pose', /,/);
    await page.mouse.move(720, 450);
    for (let i = 0; i < 40; i += 1) {
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(40);
      if ((await site(page).getAttribute('data-spine')) === 'corridor') break;
    }
    await expectSpine(page, 'corridor');
    await expect(site(page)).toHaveAttribute('data-engaged', 'false');
    const y = await scrollY(page);
    await page.mouse.wheel(0, 500);
    await expect.poll(() => scrollY(page)).toBeGreaterThan(y);
    await expect(site(page)).toHaveAttribute('data-engaged', 'false');
  });

  test('the walking keys belong to the page: W does not walk, and the arrow keys still scroll', async ({ page }, info) => {
    test.skip(!isDesktop(info), 'a keyboard');
    await arriveByScrolling(page);
    const before = await settledPose(page);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyW');
    expect(await pose(page)).toEqual(before);
    const y = await scrollY(page);
    // A key press is one event and a busy machine can lose the race with the compositor's scroll: press until it lands.
    await expect
      .poll(
        async () => {
          await page.keyboard.press('ArrowDown');
          await page.waitForTimeout(250);
          return scrollY(page);
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(y);
    expect(await pose(page)).toEqual(before);
  });

  test('no move pad is offered to a finger while resting, and the scene never holds the page\'s touch', async ({ page }, info) => {
    test.skip(isDesktop(info), 'touch');
    await arriveByScrolling(page);
    await expect(page.getByRole('group', { name: 'Movement' })).toBeHidden();
    expect(await canvas(page).evaluate((el) => getComputedStyle(el).touchAction)).toBe('pan-y');
    await expect(page.getByText('Page · swipe to scroll')).toBeVisible();
  });

  test('chambers and the corridor\'s door buttons are out of reach until engaged', async ({ page }) => {
    await arriveByScrolling(page);
    expect(await page.locator('.tqw-corridor').getAttribute('inert')).not.toBeNull();
    await windowEnter(page).click();
    await expect(site(page)).toHaveAttribute('data-engaged', 'true');
    expect(await page.locator('.tqw-corridor').getAttribute('inert')).toBeNull();
  });
});

test.describe('the game window: engaging', () => {
  test('the Enter control engages: the page is held, the strip says Leave, and focus moves to it', async ({ page }) => {
    await arriveByScrolling(page);
    const top = await gameTop(page);
    await windowEnter(page).click();
    await expect(site(page)).toHaveAttribute('data-engaged', 'true');
    expect(await rootOverflow(page)).toBe('hidden');
    await expect(leaveButton(page)).toBeVisible();
    await expect(leaveButton(page)).toBeFocused();
    await expect(leaveButton(page)).toHaveAttribute('aria-keyshortcuts', 'Escape');
    await expect(page.locator('.tqw-game__location')).toHaveText('The Quiet Works · Corridor');
    await expect(windowEnter(page)).toHaveCount(0);
    expect(Math.abs((await scrollY(page)) - top)).toBeLessThanOrEqual(2);
  });

  test('engaged, the wheel walks and the page does not scroll; W walks', async ({ page }, info) => {
    test.skip(!isDesktop(info), 'a mouse wheel and a keyboard');
    await engageWindow(page);
    const y = await scrollY(page);
    const start = await settledPose(page);
    await page.mouse.move(720, 450);
    await page.mouse.wheel(0, 300);
    await expect.poll(async () => start.z - (await pose(page)).z).toBeGreaterThan(0.2);
    expect(await scrollY(page)).toBe(y);
    const mid = await pose(page);
    await page.keyboard.down('KeyW');
    await expect.poll(async () => mid.z - (await pose(page)).z).toBeGreaterThan(0.5);
    await page.keyboard.up('KeyW');
    expect(await scrollY(page)).toBe(y);
  });

  test('engaged on a phone, the move pad appears and the mode line says Walking', async ({ page }, info) => {
    test.skip(isDesktop(info), 'touch');
    await engageWindow(page);
    await expect(page.getByRole('button', { name: 'Walk forward' })).toBeVisible();
    await expect(page.getByText('Walking · swipe to move')).toBeVisible();
    expect(await canvas(page).evaluate((el) => getComputedStyle(el.closest('.tqw-game__window')!).touchAction)).toBe('none');
  });

  test('the hero\'s direct link goes straight in: to the window, engaged, in the corridor', async ({ page }) => {
    await page.goto('/');
    await heroEnter(page).click();
    await expectSpine(page, 'corridor');
    await expect(site(page)).toHaveAttribute('data-engaged', 'true');
    await expect(page).toHaveURL(/\/$/);
    const top = await gameTop(page);
    await expect.poll(async () => Math.abs((await scrollY(page)) - top)).toBeLessThanOrEqual(2);
    await expect(leaveButton(page)).toBeVisible();
  });

  test('the skip link lands on the window with the Enter control in focus, and engages nothing', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to The Quiet Works' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expectSpine(page, 'corridor');
    await expect(windowEnter(page)).toBeFocused();
    await expect(site(page)).toHaveAttribute('data-engaged', 'false');
    const top = await gameTop(page);
    expect(Math.abs((await scrollY(page)) - top)).toBeLessThanOrEqual(2);
  });

  test('a chamber\'s URL arrives at the window already engaged, with the hero above and out of sight', async ({ page }) => {
    await page.goto(OFFICE);
    await expectSpine(page, 'chamber');
    await expect(site(page)).toHaveAttribute('data-engaged', 'true');
    const top = await gameTop(page);
    expect(Math.abs((await scrollY(page)) - top)).toBeLessThanOrEqual(2);
    await expect(leaveButton(page)).toBeVisible();
    await expect(page.locator('.tqw-game__window .tqw-chamber-host')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'UNHELD' })).not.toBeInViewport();
    await expect(page.getByRole('button', { name: 'Return to the corridor' })).toBeVisible();
  });

  test('choosing a room from the notice board takes the visitor to the window and engages it', async ({ page }) => {
    await page.goto('/');
    await (await openMenu(page)).getByRole('button', { name: 'Notice board' }).click();
    await page.getByRole('dialog', { name: 'Notice board' }).getByRole('button', { name: 'Go in: The Certification Office' }).click();
    await expectSpine(page, 'chamber');
    await expect(site(page)).toHaveAttribute('data-engaged', 'true');
    const top = await gameTop(page);
    expect(Math.abs((await scrollY(page)) - top)).toBeLessThanOrEqual(2);
  });

  test('walking into a door by the keyboard engages and keeps the visitor at the window', async ({ page }) => {
    await page.goto('/');
    await heroEnter(page).click();
    await expectSpine(page, 'corridor');
    await page.getByRole('button', { name: 'The Certification Office, open the door' }).focus();
    await page.keyboard.press('Enter');
    await expectSpine(page, 'chamber');
    await expect(site(page)).toHaveAttribute('data-engaged', 'true');
  });
});

test.describe('the game window: leaving', () => {
  test('Leave hands scrolling back to the page and puts focus back on Enter', async ({ page }, info) => {
    await engageWindow(page);
    await leaveButton(page).click();
    await expect(site(page)).toHaveAttribute('data-engaged', 'false');
    expect(await rootOverflow(page)).toBe('');
    await expect(windowEnter(page)).toBeVisible();
    await expect(windowEnter(page)).toBeFocused();
    if (isDesktop(info)) {
      const y = await scrollY(page);
      await page.mouse.move(720, 450);
      await page.mouse.wheel(0, 400);
      await expect.poll(() => scrollY(page)).toBeGreaterThan(y + 200);
    }
  });

  test('Escape leaves too', async ({ page }) => {
    await engageWindow(page);
    await page.keyboard.press('Escape');
    await expect(site(page)).toHaveAttribute('data-engaged', 'false');
    expect(await rootOverflow(page)).toBe('');
    await expectSpine(page, 'corridor');
  });

  test('Escape while only resting does nothing at all', async ({ page }) => {
    await arriveByScrolling(page);
    const y = await scrollY(page);
    await page.keyboard.press('Escape');
    await expect(site(page)).toHaveAttribute('data-engaged', 'false');
    await expectSpine(page, 'corridor');
    expect(await scrollY(page)).toBe(y);
  });

  test('a dialog closes first: Escape shuts the Menu and the window keeps its hold, the next Escape leaves', async ({ page }) => {
    await engageWindow(page);
    const menu = await openMenu(page);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(site(page)).toHaveAttribute('data-engaged', 'true');
    expect(await rootOverflow(page)).toBe('hidden');
    await page.keyboard.press('Escape');
    await expect(site(page)).toHaveAttribute('data-engaged', 'false');
  });

  test('the notice board is a dialog too: Escape closes it and the window stays engaged', async ({ page }) => {
    await engageWindow(page);
    await (await openMenu(page)).getByRole('button', { name: 'Notice board' }).click();
    const board = page.getByRole('dialog', { name: 'Notice board' });
    await expect(board).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(board).toBeHidden();
    await expect(site(page)).toHaveAttribute('data-engaged', 'true');
    await page.keyboard.press('Escape');
    await expect(site(page)).toHaveAttribute('data-engaged', 'false');
  });

  test('Leave inside a room keeps the room: the page is released, the chamber stays, and it cannot be reached until Enter', async ({ page }) => {
    await page.goto(OFFICE);
    await expectSpine(page, 'chamber');
    await leaveButton(page).click();
    await expect(site(page)).toHaveAttribute('data-engaged', 'false');
    await expectSpine(page, 'chamber');
    expect(await page.locator('.tqw-chamber-host').getAttribute('inert')).not.toBeNull();
    await expect(page).toHaveURL(/\/certification-office$/);
    await windowEnter(page).click();
    await expect(site(page)).toHaveAttribute('data-engaged', 'true');
    expect(await page.locator('.tqw-chamber-host').getAttribute('inert')).toBeNull();
  });

  test('"Return to the corridor" leaves the room, and is a different thing from Leave', async ({ page }) => {
    await page.goto(OFFICE);
    await expectSpine(page, 'chamber');
    await page.getByRole('button', { name: 'Return to the corridor' }).click();
    await expectSpine(page, 'corridor');
    await expect(page).toHaveURL(/\/$/);
    await expect(site(page)).toHaveAttribute('data-engaged', 'true');
  });
});

test.describe('the game window: scrolling back', () => {
  test('scrolling back above the window returns to the entrance, with a margin so a nudge does not flicker', async ({ page }) => {
    await arriveByScrolling(page);
    const top = await gameTop(page);
    await page.evaluate((y) => window.scrollTo(0, y), top - 10);
    await frames(page, 4);
    await expectSpine(page, 'corridor');
    await page.evaluate((y) => window.scrollTo(0, y), top - 80);
    await expectSpine(page, 'entrance');
    await page.evaluate((y) => window.scrollTo(0, y), top);
    await expectSpine(page, 'corridor');
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectSpine(page, 'entrance');
  });

  test('a visitor deeper in the page is not pulled back by scrolling up through the lower sections', async ({ page }) => {
    await arriveByScrolling(page);
    await page.locator('#details').scrollIntoViewIfNeeded();
    await expectSpine(page, 'corridor');
    await page.evaluate(() => document.querySelector('#archive')!.scrollIntoView());
    await expectSpine(page, 'corridor');
  });

  test('engaged, scrolling cannot return to the entrance: the window holds the page', async ({ page }) => {
    await engageWindow(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await frames(page, 4);
    await expectSpine(page, 'corridor');
    await expect(site(page)).toHaveAttribute('data-engaged', 'true');
  });

  test('a chamber is never interrupted by scrolling', async ({ page }) => {
    await page.goto(OFFICE);
    await expectSpine(page, 'chamber');
    await leaveButton(page).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await frames(page, 4);
    await expectSpine(page, 'chamber');
  });
});

test.describe('the game window: fullscreen', () => {
  async function fullscreenElementClass(page: Page): Promise<string | null> {
    return page.evaluate(() => document.fullscreenElement?.className ?? null);
  }

  test('takes the game window itself, offers Exit fullscreen, and leaving by that control releases the hold', async ({ page }) => {
    await engageWindow(page);
    test.skip(!(await page.evaluate(() => document.fullscreenEnabled)), 'this browser cannot do fullscreen');
    await page.getByRole('button', { name: 'Fullscreen' }).click();
    await expect.poll(() => fullscreenElementClass(page)).toContain('tqw-game__window');
    await expect(page.getByRole('button', { name: 'Exit fullscreen' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fullscreen', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Exit fullscreen' }).click();
    await expect.poll(() => fullscreenElementClass(page)).toBeNull();
    await expect(site(page)).toHaveAttribute('data-engaged', 'false');
    await expect(page.getByRole('button', { name: 'Fullscreen' })).toBeVisible();
  });

  test('leaving fullscreen by the browser\'s own route also releases the window', async ({ page }) => {
    await engageWindow(page);
    test.skip(!(await page.evaluate(() => document.fullscreenEnabled)), 'this browser cannot do fullscreen');
    await page.getByRole('button', { name: 'Fullscreen' }).click();
    await expect.poll(() => fullscreenElementClass(page)).toContain('tqw-game__window');
    await expect(site(page)).toHaveAttribute('data-engaged', 'true');
    // The browser's own exit (Escape, a system gesture): the page was never asked.
    await page.evaluate(() => document.exitFullscreen());
    await expect(site(page)).toHaveAttribute('data-engaged', 'false');
    await expect(page.getByRole('button', { name: 'Fullscreen' })).toBeVisible();
  });

  test('Leave while fullscreen comes out of fullscreen too, so the page is not left hidden behind it', async ({ page }) => {
    await engageWindow(page);
    test.skip(!(await page.evaluate(() => document.fullscreenEnabled)), 'this browser cannot do fullscreen');
    await page.getByRole('button', { name: 'Fullscreen' }).click();
    await expect.poll(() => fullscreenElementClass(page)).toContain('tqw-game__window');
    await leaveButton(page).click();
    await expect.poll(() => fullscreenElementClass(page)).toBeNull();
    await expect(site(page)).toHaveAttribute('data-engaged', 'false');
  });
});

// ----------------------------------------------------------------------------------- menu

test.describe('the menu', () => {
  test('lists the places and holds Settings; Escape closes it and focus returns to what opened it', async ({ page }) => {
    await page.goto('/');
    const opener = page.locator('.tqw-hero__menu').getByRole('button', { name: 'Menu' });
    await opener.click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('navigation', { name: 'Pages' }).getByRole('link')).toHaveText(['About', 'Credits', 'Privacy']);
    await expect(menu.getByRole('button', { name: 'Notice board' })).toBeVisible();
    await expect(menu.getByRole('group', { name: 'Settings' }).getByRole('button')).toHaveCount(4);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('the menu opens a page and closes itself first', async ({ page }) => {
    await page.goto('/');
    const menu = await openMenu(page);
    await menu.getByRole('link', { name: 'Credits' }).click();
    await expect(page).toHaveURL(/\/credits$/);
    await expect(menu).toBeHidden();
    await expect(page.getByRole('dialog', { name: 'Credits' })).toBeVisible();
  });

  test('mute stays directly reachable once sound is on: not in the Menu, and not before then', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Sound' })).toHaveCount(0);
    await heroEnter(page).click();
    await expect(site(page)).toHaveAttribute('data-engaged', 'true');
    const sound = page.locator('.tqw-game__strip').getByRole('button', { name: 'Sound' });
    await expect(sound).toBeVisible();
    await expect(sound).toHaveAttribute('aria-pressed', 'true');
    await sound.click();
    await expect(sound).toHaveAttribute('aria-pressed', 'false');
    const menu = await openMenu(page);
    await expect(menu.getByRole('button', { name: 'Sound' })).toHaveAttribute('aria-pressed', 'false');
    await closeMenu(page);
  });

  test('toggling reduced motion in the Menu collapses the smoke run live', async ({ page }) => {
    await page.goto('/');
    const vh = await page.evaluate(() => window.innerHeight);
    expect(Math.abs((await gameTop(page)) - vh * 2.5)).toBeLessThanOrEqual(1);
    const menu = await openMenu(page);
    await menu.getByRole('button', { name: 'Reduced motion' }).click();
    await closeMenu(page);
    await expect(site(page)).toHaveAttribute('data-reduced-motion', 'true');
    expect(Math.abs((await gameTop(page)) - vh)).toBeLessThanOrEqual(1);
  });
});

// ----------------------------------------------------------------------------------- reduced motion

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the smoke run collapses to one viewport: the window is one screen down', async ({ page }) => {
    await page.goto('/');
    await expectSpine(page, 'entrance');
    const vh = await page.evaluate(() => window.innerHeight);
    expect(Math.abs((await gameTop(page)) - vh)).toBeLessThanOrEqual(1);
    expect(await page.locator('.tqw-site').evaluate((el) => (el as HTMLElement).style.getPropertyValue('--tqw-run'))).toBe('1');
    await page.evaluate((y) => window.scrollTo(0, y), vh);
    await expectSpine(page, 'corridor');
    await expect(site(page)).toHaveAttribute('data-engaged', 'false');
  });

  test('the veil is plain coal with a 120 ms dissolve: no texture, no moving layers', async ({ page }) => {
    await page.goto('/');
    const veil = page.locator('.tqw-veil');
    await expect(veil).toHaveAttribute('data-reduced', 'true');
    await expect(veil).not.toHaveAttribute('data-textured', 'true');
    for (const layer of await page.locator('.tqw-veil__layer').all()) expect(await layer.evaluate((el) => getComputedStyle(el).display)).toBe('none');
    const backing = await page.locator('.tqw-veil__backing').evaluate((el) => {
      const s = getComputedStyle(el);
      return { duration: s.transitionDuration, property: s.transitionProperty, colour: s.backgroundColor };
    });
    expect(backing).toEqual({ duration: '0.12s', property: 'opacity', colour: 'rgb(23, 25, 24)' });
  });

  test('the hero has no drift and the scrim fade is gone', async ({ page }) => {
    await page.goto('/');
    expect(await page.locator('.tqw-hero__lockup').evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    expect(await page.locator('.tqw-game__scrim').evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
  });

  test('a newly found paper is not faded in', async ({ page }) => {
    await page.goto('/');
    await importArchive(page, { 'certification-office': [{ id: 'memo-a', kind: 'memo' }] });
    expect(await page.locator('.tqw-paper[data-state="found"]').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });
});

// ----------------------------------------------------------------------------------- text mode

test.describe('text mode: the sections in reading order', () => {
  test('hero, then the corridor prose and the door list, then the archive, the details and the footer; no window, no smoke, no canvas', async ({ page }) => {
    await page.goto('/?mode=text');
    await expect(page.getByRole('heading', { level: 1, name: 'The corridor' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.locator('.tqw-game__window')).toHaveCount(0);
    await expect(page.locator('.tqw-veil')).toHaveCount(0);
    await expect(windowEnter(page)).toHaveCount(0);
    const order = await page.evaluate(() => {
      const top = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().top + window.scrollY;
      return [top('.tqw-hero'), top('#game'), top('.tqw-text-corridor nav[aria-label="Doors"]'), top('#archive'), top('#details'), top('footer.tqw-footer')];
    });
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(order.length);
    expect(await scrollY(page)).toBe(0);
    await expect(site(page)).toHaveAttribute('data-engaged', 'false');
  });

  test('the hero\'s way in scrolls to the corridor prose and engages nothing', async ({ page }) => {
    await page.goto('/?mode=text');
    await heroEnter(page).click();
    await expect(page.getByRole('heading', { level: 1, name: 'The corridor' })).toBeInViewport();
    await expect(site(page)).toHaveAttribute('data-engaged', 'false');
    expect(await rootOverflow(page)).toBe('');
  });

  test('a chamber\'s URL in text mode holds nothing: there is no window to engage, so the page scrolls', async ({ page }) => {
    await page.goto(`${OFFICE}?mode=text`);
    await expect(page.locator('.tqw-app[data-mode="text"]')).toBeVisible();
    await expect(site(page)).toHaveAttribute('data-engaged', 'false');
    expect(await rootOverflow(page)).toBe('');
    await page.evaluate(() => document.querySelector('#details')!.scrollIntoView());
    expect(await scrollY(page)).toBeGreaterThan(300);
  });

  test('the page scrolls whatever Escape does: nothing is held', async ({ page }) => {
    await page.goto('/?mode=text');
    await page.keyboard.press('Escape');
    expect(await rootOverflow(page)).toBe('');
    await page.evaluate(() => document.querySelector('#details')!.scrollIntoView());
    expect(await scrollY(page)).toBeGreaterThan(300);
  });
});

// ----------------------------------------------------------------------------------- small screens

test.describe('small screens and zoom', () => {
  const SIZES = [
    { name: '320 px wide', width: 320, height: 640 },
    { name: '200% zoom on a laptop (640 x 360 CSS px)', width: 640, height: 360 },
  ] as const;

  for (const size of SIZES) {
    test(`${size.name}: every section fits, nothing scrolls sideways, and the sections grow rather than clip`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/');
      await fontsReady(page);
      await noHorizontalScroll(page);
      await within(page, ['.tqw-hero__name', '.tqw-hero__tagline', '.tqw-hero__details', '.tqw-hero__cue', '.tqw-hero__enter', '.tqw-hero__menu']);
      for (const selector of ['.tqw-archive', '#details', 'footer.tqw-footer']) {
        await page.locator(selector).scrollIntoViewIfNeeded();
        await noHorizontalScroll(page);
        await within(page, [`${selector} h2`, `${selector} p`, `${selector} a`, `${selector} button`]);
        const grows = await page.locator(selector).evaluate((el) => ({ content: el.scrollHeight, box: el.getBoundingClientRect().height }));
        expect(grows.content, `${selector} clips its content`).toBeLessThanOrEqual(grows.box + 1);
      }
      await scrollToProgress(page, 1);
      await expect(windowEnter(page)).toBeInViewport();
      await expect(page.getByRole('button', { name: 'Menu' }).first()).toBeAttached();
    });

    test(`${size.name}: the way in and the menu are reachable by keyboard from the first screen`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/');
      await heroEnter(page).focus();
      await expect(heroEnter(page)).toBeFocused();
      await page.locator('.tqw-hero__menu').getByRole('button', { name: 'Menu' }).focus();
      await page.keyboard.press('Enter');
      const menu = page.getByRole('dialog', { name: 'Menu' });
      await expect(menu).toBeVisible();
      const [scrollWidth, clientWidth] = await menu.evaluate((el) => [el.scrollWidth, el.clientWidth]);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  }

  test('the archive\'s papers are three across on a desktop, two on a phone and one at 320 px', async ({ page }, info) => {
    await page.goto('/');
    await importArchive(page, {
      'certification-office': [
        { id: 'office-application-receipt', kind: 'line', title: 'Application receipt' },
        { id: 'office-inspection-copy', kind: 'memo', title: 'Inspection copy' },
        { id: 'office-empty-authority-bay', kind: 'payoff', title: 'The empty authority bay' },
      ],
    });
    const columns = async () =>
      page.locator('.tqw-archive__items').first().evaluate((list) => {
        const lefts = [...list.children].map((c) => Math.round(c.getBoundingClientRect().left));
        const first = Math.round(list.children[0]!.getBoundingClientRect().top);
        return new Set(lefts.filter((_, i) => Math.round(list.children[i]!.getBoundingClientRect().top) === first)).size;
      });
    expect(await columns()).toBe(isDesktop(info) ? 3 : 2);
    await page.setViewportSize({ width: 320, height: 640 });
    expect(await columns()).toBe(1);
  });
});

// ----------------------------------------------------------------------------------- archive

interface DiscoveryFile {
  [chamber: string]: Array<{ id: string; kind: 'memo' | 'secret' | 'payoff' | 'line'; title?: string }>;
}

/** Imports an archive through the page's own file input, as a visitor restoring one would. */
async function importArchive(page: Page, found: DiscoveryFile): Promise<void> {
  const text = JSON.stringify({ version: 1, found, recognitions: [] });
  await page.locator('.tqw-archive input[type="file"]').setInputFiles({ name: 'unheld-discoveries.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.locator('.tqw-archive__message')).toHaveText(/Imported/);
}

const papers = (page: Page) => page.locator('.tqw-archive .tqw-paper[data-state="found"]');

test.describe('the archive', () => {
  test('an empty archive has no room groups or unopened inventory', { tag: '@fast' }, async ({ page }) => {
    await page.goto('/');
    const archive = page.locator('#archive');
    await expect(archive.getByRole('heading', { level: 2, name: 'Your archive' })).toBeAttached();
    await expect(archive.locator('.tqw-archive__room')).toHaveCount(0);
    await expect(papers(page)).toHaveCount(0);
    await expect(archive.locator('.tqw-archive__room-count, .tqw-archive__sealed, .tqw-archive__sealed-row')).toHaveCount(0);
    expect(await archive.locator('progress, meter, [role="progressbar"], svg, canvas').count()).toBe(0);
    expect(await archive.innerText()).not.toMatch(/\b(?:count|counts|total|totals|sealed|slot|slots|not yet open|more rooms will appear)\b|\b\d+\s*(?:of|\/)\s*\d+\b/i);
  });

  test('Office findings show their authored titles without unopened inventory', { tag: '@fast' }, async ({ page }) => {
    await page.goto('/');
    await importArchive(page, {
      'certification-office': [
        { id: 'office-inspection-copy', kind: 'memo', title: 'Inspection copy' },
        { id: 'office-duck-requisition', kind: 'secret', title: 'Duck Requisition' },
        { id: 'office-mystery-resolved', kind: 'payoff', title: 'Certification Office — mystery resolved' },
      ],
    });
    const archive = page.locator('#archive');
    await expect(archive.locator('.tqw-archive__room')).toHaveCount(1);
    await expect(papers(page)).toHaveCount(3);
    await expect(papers(page).locator('.tqw-paper__title')).toHaveText([
      'Inspection copy',
      'Duck Requisition',
      'Certification Office — mystery resolved',
    ]);
    const office = archive.locator('.tqw-archive__room[data-room="certification-office"]');
    await expect(office).toHaveCount(1);
    await expect(archive.locator('.tqw-archive__room-count, .tqw-archive__sealed, .tqw-archive__sealed-row')).toHaveCount(0);
    expect(await archive.innerText()).not.toMatch(/office-inspection-copy|office-duck-requisition|office-mystery-resolved|\b(?:count|counts|total|totals|sealed|slot|slots)\b|\b\d+\s*(?:of|\/)\s*\d+\b/i);
  });

  test('importing replaces the archive, and the hero does not call it this visit\'s discovery', { tag: '@fast' }, async ({ page }) => {
    await page.goto('/');
    await importArchive(page, { 'certification-office': [{ id: 'memo-a', kind: 'memo' }] });
    await expect(page.locator('.tqw-hero__details')).toHaveText('1 door open');
  });

  test('a file that is not an archive changes nothing, and says so', { tag: '@fast' }, async ({ page }) => {
    await page.goto('/');
    await importArchive(page, { 'certification-office': [{ id: 'memo-a', kind: 'memo' }] });
    await page.locator('.tqw-archive input[type="file"]').setInputFiles({ name: 'nope.json', mimeType: 'application/json', buffer: Buffer.from('{"version":9}') });
    await expect(page.locator('.tqw-archive__message')).toHaveText(/could not be read/);
    await expect(papers(page)).toHaveCount(1);
  });

  test('export saves unheld-discoveries.json with its authored title and no other fields', { tag: '@fast' }, async ({ page }) => {
    await page.goto('/');
    await importArchive(page, { 'certification-office': [
      { id: 'office-empty-authority-bay', kind: 'payoff', title: 'The empty authority bay' },
    ] });
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export discoveries' }).click()]);
    expect(download.suggestedFilename()).toBe('unheld-discoveries.json');
    const body = JSON.parse(await readFile((await download.path())!, 'utf8')) as { version: number; found: DiscoveryFile };
    expect(body.version).toBe(1);
    expect(body.found['certification-office']).toEqual([
      { id: 'office-empty-authority-bay', kind: 'payoff', title: 'The empty authority bay' },
    ]);
    await expect(page.locator('.tqw-archive__message')).toHaveText('Saved as unheld-discoveries.json.');
  });

  test('Forget everything asks first, names what it does, defaults to Cancel, and only the confirmation forgets', { tag: '@fast' }, async ({ page }) => {
    await page.goto('/');
    await importArchive(page, { 'certification-office': [{ id: 'memo-a', kind: 'memo' }, { id: 'memo-b', kind: 'memo' }] });
    await page.locator('#archive').getByRole('button', { name: 'Forget everything' }).click();
    const dialog = page.getByRole('dialog', { name: 'Forget everything?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('cannot be undone');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'Export first' })).toBeVisible();

    // Cancel, and Escape, keep everything.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(papers(page)).toHaveCount(2);
    await page.locator('#archive').getByRole('button', { name: 'Forget everything' }).click();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(papers(page)).toHaveCount(2);

    await page.locator('#archive').getByRole('button', { name: 'Forget everything' }).click();
    await dialog.getByRole('button', { name: 'Forget everything' }).click();
    await expect(dialog).toBeHidden();
    await expect(papers(page)).toHaveCount(0);
    await expect(page.locator('#archive .tqw-archive__room')).toHaveCount(0);
    await expect(page.locator('.tqw-archive__message')).toHaveText('Forgotten. This device remembers nothing.');
    await expect(page.locator('#archive .tqw-archive__room-count, #archive .tqw-archive__sealed, #archive .tqw-archive__sealed-row')).toHaveCount(0);
  });

  test('the Forget dialog is a dialog: Escape closing it does not release the game window', async ({ page }) => {
    await engageWindow(page);
    // Pressed in place: scrolling the held page to the button would be the visitor leaving the window.
    await page.locator('#archive').getByRole('button', { name: 'Forget everything', exact: true }).evaluate((button) => (button as HTMLButtonElement).click());
    const dialog = page.getByRole('dialog', { name: 'Forget everything?' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(site(page)).toHaveAttribute('data-engaged', 'true');
  });
});

// ----------------------------------------------------------------------------------- details and footer

test.describe('the details and the footer', () => {
  test('the details say what UNHELD is, how it grows, how to contribute and what stays on the device, and link the contribution guide', async ({ page }) => {
    await page.goto('/');
    const details = page.locator('#details');
    await expect(details.getByRole('heading', { level: 2 })).toHaveText('What UNHELD is, and how it grows');
    await expect(details.getByRole('heading', { level: 3 })).toHaveText(['How it grows', 'How to contribute', 'What stays on your device']);
    await expect(details.getByRole('link', { name: 'Read the contribution guide' })).toHaveAttribute('href',
      'https://github.com/quietworkscollective/the-quiet-works/blob/main/docs/commons/AGENT_DOSSIER.md');
    await expect(details.getByRole('link')).toHaveCount(1);
    await page.locator('footer.tqw-footer').getByRole('link', { name: 'Privacy' }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('dialog', { name: 'Privacy' })).toBeVisible();
  });

  test('the footer is a colophon without a detached menu, links About, Credits, Privacy and Licences, and signs the copyright', { tag: '@fast' }, async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer.tqw-footer');
    await expect(footer.getByRole('navigation', { name: 'Footer menu' })).toHaveCount(0);
    await expect(footer.getByRole('navigation', { name: 'Footer links' }).getByRole('link')).toHaveText(['About', 'Credits', 'Privacy', 'Agents', 'Licences']);
    await expect(footer.getByRole('link', { name: 'Licences' })).toHaveAttribute('href', '/third-party-notices.txt');
    await expect(footer).toContainText('© 2026 Siri (Asiri) Dalugoda');
    expect(await footer.locator('.tqw-footer__trivia').count()).toBe(0);
  });

  test('the About page names its maker and links his own site; the link is followed only when pressed', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto('/about');
    const about = page.getByRole('dialog', { name: 'About UNHELD' });
    await expect(about).toContainText('UNHELD is made by Siri (Asiri) Dalugoda.');
    const link = about.getByRole('link', { name: 'dalugoda.com' });
    await expect(link).toHaveAttribute('href', 'https://dalugoda.com/');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    // The immediate-danger line stays last, after the maker.
    await expect(about.locator('.tqw-page__article p').last()).toContainText('immediate danger');
    await expect(about.locator('.tqw-page__article p').nth(-2)).toContainText('UNHELD is made by Siri (Asiri) Dalugoda.');
    // The third-party list belongs to the Credits page alone.
    await expect(about.getByRole('region', { name: 'Third-party assets' })).toHaveCount(0);
    // A link, never a request: nothing is fetched from it.
    expect(requests.filter((url) => url.includes('dalugoda.com'))).toEqual([]);
  });

  test('Credits name him in full, and the footer signs the same name', { tag: '@fast' }, async ({ page }) => {
    await page.goto('/credits');
    await expect(page.getByRole('dialog', { name: 'Credits' })).toContainText('an independent artwork by Siri (Asiri) Dalugoda');
    await expect(page.getByRole('dialog', { name: 'Credits' })).toContainText('© 2026 Siri (Asiri) Dalugoda');
  });

  test('Credits list the third-party models and surfaces by provider, each linked to its own page, and fetch none of them', async ({ page }) => {
    const catalogue = JSON.parse(await readFile(new URL('../src/assets/third-party.json', import.meta.url), 'utf8')) as {
      assets: Array<{ title: string; author: string; source: string }>;
    };
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto('/credits');
    const credits = page.getByRole('dialog', { name: 'Credits' });
    const section = credits.getByRole('region', { name: 'Third-party assets' });
    await expect(section).toBeVisible();
    await expect(section.getByRole('heading', { level: 3 })).toHaveText(['Poly Haven', 'ambientCG']);
    // Every asset in the catalogue, once, as a plain link to the page it came from.
    const links = section.getByRole('link');
    await expect(links).toHaveCount(catalogue.assets.length);
    const found = await links.evaluateAll((anchors) => anchors.map((a) => [a.getAttribute('href'), a.getAttribute('rel'), a.getAttribute('target')]));
    expect(found.map(([href]) => href).sort()).toEqual(catalogue.assets.map((asset) => asset.source).sort());
    for (const [, rel, target] of found) {
      expect(rel).toBe('noopener noreferrer');
      expect(target).toBeNull();
    }
    // Title, author and licence read together on one line.
    const desk = catalogue.assets.find((asset) => asset.source.endsWith('/metal_office_desk'))!;
    const line = section.getByRole('listitem').filter({ has: page.getByRole('link', { name: desk.title, exact: true }) });
    await expect(line).toContainText(`by ${desk.author}`);
    await expect(line).toContainText('CC0 1.0 Universal');
    // The project's own models are named as CC BY 4.0, after the lists, and the asset region follows the grouped Credits sections.
    await expect(section.locator('p').last()).toContainText('CC BY 4.0');
    expect(await credits.evaluate((dialog) => dialog.querySelector('.tqw-page__assets')!.previousElementSibling!.classList.contains('tqw-page__credits'))).toBe(true);
    // Links, never requests: nothing is fetched from any provider.
    expect(requests.filter((url) => /polyhaven|ambientcg|creativecommons/.test(url))).toEqual([]);
  });

  test('the Credits page lists them inside its column, at 320 px too', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/credits');
    const credits = page.getByRole('dialog', { name: 'Credits' });
    await expect(credits.getByRole('region', { name: 'Third-party assets' })).toBeVisible();
    expect(await credits.evaluate((dialog) => dialog.scrollWidth - dialog.clientWidth), 'the Credits page scrolls sideways').toBeLessThanOrEqual(0);
    await credits.getByRole('region', { name: 'Third-party assets' }).locator('li').last().scrollIntoViewIfNeeded();
    await expect(credits.getByRole('navigation', { name: 'Site' })).toBeVisible();
  });

  test('the footer has one rule', async ({ page }) => {
    await page.goto('/');
    const rules = await page.locator('footer.tqw-footer, footer.tqw-footer *').evaluateAll((els) =>
      els.filter((el) => ['Top', 'Bottom'].some((side) => parseFloat(getComputedStyle(el).getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0)).length,
    );
    expect(rules).toBe(1);
  });
});

// ----------------------------------------------------------------------------------- privacy

test.describe('what the page stores and sends', () => {
  test('nothing is stored before a discovery and no cookie is ever set; nothing leaves the device', async ({ page, context, baseURL }) => {
    const foreign: string[] = [];
    const connections: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith(baseURL ?? '') && !url.startsWith('data:') && !url.startsWith('blob:')) foreign.push(url);
      if (['fetch', 'xhr', 'websocket', 'eventsource', 'ping'].includes(request.resourceType())) connections.push(`${request.resourceType()} ${url}`);
    });
    await page.goto('/');
    // The whole tour: scroll through the smoke, engage, leave, open the menu, the board and a page.
    await scrollToProgress(page, 0.5);
    await scrollToProgress(page, 1);
    await windowEnter(page).click();
    await expect(site(page)).toHaveAttribute('data-engaged', 'true');
    await page.keyboard.press('Escape');
    await (await openMenu(page)).getByRole('link', { name: 'About' }).click();
    await expect(page.getByRole('dialog', { name: 'About UNHELD' })).toBeVisible();
    await page.keyboard.press('Escape');
    // Before any discovery the device holds nothing at all.
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie.length])).toEqual([0, 0, 0]);
    expect(await page.evaluate(async () => (await indexedDB.databases?.())?.length ?? 0)).toBe(0);
    expect(await context.cookies()).toEqual([]);
    expect(foreign).toEqual([]);
    expect(connections).toEqual([]);
  });

  test('the first discovery writes the one versioned key, unheld.v1: identity, kind and authored title only', async ({ page, context }) => {
    await page.goto('/');
    const stored = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])));
    expect(await stored()).toEqual({});
    await importArchive(page, { 'certification-office': [
      { id: 'office-empty-authority-bay', kind: 'payoff', title: 'The empty authority bay' },
    ] });
    const written = await stored();
    expect(Object.keys(written)).toEqual(['unheld.v1']);
    expect(JSON.parse(written['unheld.v1']!)).toEqual({
      version: 1,
      found: { 'certification-office': [{ id: 'office-empty-authority-bay', kind: 'payoff', title: 'The empty authority bay' }] },
      recognitions: [],
    });
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
    expect(await context.cookies()).toEqual([]);
  });

  test('what was found is remembered across a reload, and the hero does not call it this visit\'s', async ({ page }) => {
    await page.goto('/');
    await importArchive(page, { 'certification-office': [{ id: 'memo-a', kind: 'memo' }, { id: 'memo-b', kind: 'memo' }] });
    await page.reload();
    await expect(papers(page)).toHaveCount(2);
    await expect(page.locator('#archive .tqw-archive__room')).toHaveCount(1);
    await expect(page.locator('#archive .tqw-archive__room-count, #archive .tqw-archive__sealed, #archive .tqw-archive__sealed-row')).toHaveCount(0);
    await expect(page.locator('.tqw-hero__details')).toHaveText('1 door open');
  });

  test('Forget everything removes the key: the device holds nothing again, across a reload', async ({ page }) => {
    await page.goto('/');
    await importArchive(page, { 'certification-office': [{ id: 'memo-a', kind: 'memo' }] });
    await page.locator('#archive').getByRole('button', { name: 'Forget everything' }).click();
    await page.getByRole('dialog', { name: 'Forget everything?' }).getByRole('button', { name: 'Forget everything' }).click();
    await expect(papers(page)).toHaveCount(0);
    expect(await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)])).toEqual([]);
    await page.reload();
    await expect(papers(page)).toHaveCount(0);
    await expect(page.locator('#archive .tqw-archive__room')).toHaveCount(0);
  });

  test('a damaged key is ignored and the page still loads with an empty archive', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('unheld.v1', '{"version":9,"found":'));
    await page.goto('/');
    await expect(papers(page)).toHaveCount(0);
    await expect(page.locator('#archive .tqw-archive__room')).toHaveCount(0);
  });

  test('a browser that refuses storage still gets a working archive for the visit', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('denied', 'SecurityError');
        },
      });
    });
    await page.goto('/');
    await importArchive(page, { 'certification-office': [{ id: 'memo-a', kind: 'memo' }] });
    await expect(papers(page)).toHaveCount(1);
  });

  test('the content security policy still allows no connections and only blob images for the smoke', async ({ page }) => {
    await page.goto('/');
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toMatch(/img-src[^;]*blob:/);
  });
});
