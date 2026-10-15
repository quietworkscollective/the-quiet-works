import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { activateDoor, door, expectSpine, openMenu, roomReady, site } from './helpers.ts';
import { decodePng } from './png.ts';

/**
 * UNHELD's brand assets, the door plaque, the notice board, the site pages and text mode in a real
 * browser. The hero, the game window, the archive, the details and the footer (ADR 0003) are in
 * page.spec.ts; the landing and the header this file once measured no longer exist.
 */

const isDesktop = (info: TestInfo) => info.project.name === 'desktop';

/** The host has a timer fallback; only the Office scene publishes completed resource preparation. */
async function officePrepared(page: Page): Promise<void> {
  await expect(page.locator('.tqw-chamber-host .tqw-canvas')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await roomReady(page);
}

async function styleOf(page: Page, selector: string, properties: readonly string[]): Promise<Record<string, string>> {
  return page
    .locator(selector)
    .first()
    .evaluate((el, props) => {
      const computed = getComputedStyle(el);
      return Object.fromEntries(props.map((p) => [p, computed.getPropertyValue(p)]));
    }, properties);
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scrollWidth, 'the page scrolls sideways').toBeLessThanOrEqual(innerWidth);
}

/**
 * Fixed layers (the landing, the door plaque) and dialogs that scroll inside themselves never widen
 * the document, so `noHorizontalScroll` cannot see them overflow. This looks at the boxes instead.
 */
async function within(page: Page, selectors: readonly string[]): Promise<void> {
  const width = await page.evaluate(() => window.innerWidth);
  for (const selector of selectors) {
    for (const element of await page.locator(selector).all()) {
      const box = await element.boundingBox();
      if (!box || box.width === 0) continue;
      expect(box.x, `${selector} starts left of the screen`).toBeGreaterThanOrEqual(-0.5);
      expect(box.x + box.width, `${selector} runs off the right of the screen`).toBeLessThanOrEqual(width + 0.5);
    }
  }
}

async function dialogDoesNotScrollSideways(page: Page): Promise<void> {
  const [scrollWidth, clientWidth] = await page.locator('dialog[open]').evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(scrollWidth, 'the dialog has content wider than itself').toBeLessThanOrEqual(clientWidth);
}

test.describe('brand assets', () => {
  test('the page names its icon, touch icon, manifest and theme colour', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg');
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('type', 'image/svg+xml');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#151a20');
  });

  test('the icons are served as what they claim to be, at the sizes they claim', async ({ request }) => {
    const svg = await request.get('/favicon.svg');
    expect(svg.ok()).toBe(true);
    expect(svg.headers()['content-type']).toContain('image/svg+xml');
    expect(await svg.text()).toContain('viewBox="0 0 16 16"');

    const touch = decodePng(await (await request.get('/apple-touch-icon.png')).body());
    expect([touch.width, touch.height]).toEqual([180, 180]);
    const app = decodePng(await (await request.get('/icon-512.png')).body());
    expect([app.width, app.height]).toEqual([512, 512]);
    // Coal all round with the bone mark in the middle: the corner is coal, the mark is not.
    expect(app.at(2, 2)).toEqual([0x15, 0x1a, 0x20]);
    const [r, g, b] = app.at(256 - 100, 256);
    expect(r + g + b).toBeGreaterThan(300);
  });

  test('the manifest is UNHELD in coal, standalone, and every icon it lists exists', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.ok()).toBe(true);
    const manifest = (await response.json()) as {
      name: string;
      display: string;
      theme_color: string;
      background_color: string;
      icons: Array<{ src: string; sizes: string; type: string }>;
    };
    expect(manifest.name).toBe('UNHELD');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color.toLowerCase()).toBe('#151a20');
    expect(manifest.background_color.toLowerCase()).toBe('#151a20');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    for (const icon of manifest.icons) expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
  });
});

test.describe('door plaque', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Enter The Quiet Works' }).click();
    await expectSpine(page, 'corridor');
  });

  test('is invisible until a door takes keyboard focus', async ({ page }) => {
    for (const button of await page.locator('.tqw-door').all()) {
      const box = await button.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(2);
      expect(box!.height).toBeLessThanOrEqual(2);
    }
  });

  test('then shows that door as a plaque near the foot of the screen: title and status', async ({ page }) => {
    await door(page, 'The Apartment', 'sealed').focus();
    const plaque = page.locator('.tqw-door:focus');
    const box = await plaque.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.width).toBeGreaterThan(180);
    expect(box!.y + box!.height).toBeGreaterThan(viewport.height - 160);
    expect(box!.y).toBeGreaterThan(viewport.height * 0.6);
    await expect(plaque.locator('.tqw-door__title')).toHaveText('The Apartment');
    await expect(plaque.locator('.tqw-door__status')).toHaveText('not yet open');
    await expect(plaque.locator('.tqw-door__title')).toBeVisible();
    await expect(plaque.locator('.tqw-door__status')).toBeVisible();
    // Only that one: the rest are still hidden.
    expect(await page.locator('.tqw-door:visible').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 4).length)).toBe(1);
  });

  test('shows the open door as open, and Enter opens it', async ({ page }) => {
    await door(page, 'The Certification Office', 'open').focus();
    await expect(page.locator('.tqw-door:focus .tqw-door__status')).toHaveText('open the door');
    await page.keyboard.press('Enter');
    await officePrepared(page);
    await expectSpine(page, 'chamber');
  });

  test('the title never wraps on a 320 px screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await door(page, 'The Certification Office', 'open').focus();
    const title = await page.locator('.tqw-door:focus .tqw-door__title').boundingBox();
    expect(title!.height).toBeLessThan(26);
    await within(page, ['.tqw-door:focus']);
  });
});

test.describe('notice board', () => {
  async function open(page: Page) {
    await page.goto('/');
    await (await openMenu(page)).getByRole('button', { name: 'Notice board' }).click();
    const board = page.getByRole('dialog', { name: 'Notice board' });
    await expect(board).toBeVisible();
    return board;
  }

  test('pins six clippings within 2 degrees of true, on three stocks, in an olive felt field', async ({ page }) => {
    const board = await open(page);
    const clippings = board.locator('.tqw-clipping');
    await expect(clippings).toHaveCount(6);
    const detail = await clippings.evaluateAll((els) =>
      els.map((el) => {
        const m = new DOMMatrix(getComputedStyle(el).transform);
        return { angle: (Math.atan2(m.b, m.a) * 180) / Math.PI, background: getComputedStyle(el).backgroundColor, stock: el.getAttribute('data-stock') };
      }),
    );
    for (const { angle } of detail) expect(Math.abs(angle)).toBeLessThanOrEqual(2);
    expect(detail.some(({ angle }) => Math.abs(angle) > 0.2), 'at least one clipping is visibly off true').toBe(true);
    expect(detail.map((d) => d.stock)).toEqual(['bone', 'buff', 'grey-green', 'bone', 'buff', 'grey-green']);
    expect(detail.map((d) => d.background)).toEqual(['rgb(226, 218, 203)', 'rgb(214, 195, 155)', 'rgb(185, 192, 171)', 'rgb(226, 218, 203)', 'rgb(214, 195, 155)', 'rgb(185, 192, 171)']);
    const felt = await board.locator('.tqw-board__clippings').evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(felt).toContain('rgb(80, 82, 71)');
  });

  test('sets headlines in Newsreader at 18 px or more, datelines in Mono, with 48 px targets', async ({ page }) => {
    const board = await open(page);
    const headline = await board.locator('.tqw-clipping__headline').first().evaluate((el) => {
      const s = getComputedStyle(el);
      return { size: parseFloat(s.fontSize), family: s.fontFamily };
    });
    expect(headline.size).toBeGreaterThanOrEqual(18);
    expect(headline.family).toContain('Newsreader');
    expect((await styleOf(page, '.tqw-clipping__dateline', ['font-family']))['font-family']).toContain('IBM Plex Mono');
    expect((await styleOf(page, '.tqw-clipping__dek', ['font-family']))['font-family']).toContain('"IBM Plex Sans"');
    const go = await board.getByRole('button', { name: 'Go in: The Certification Office' }).boundingBox();
    expect(go!.height).toBeGreaterThanOrEqual(47.5);
    const close = await board.getByRole('button', { name: 'Close the notice board' }).boundingBox();
    expect(close!.height).toBeGreaterThanOrEqual(47.5);
  });

  test('is a grid of two columns on a screen and one column on a phone', async ({ page }, info) => {
    const board = await open(page);
    const boxes = await board.locator('.tqw-clipping').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().x));
    const columns = new Set(boxes.map((x) => Math.round(x / 20))).size;
    expect(columns).toBe(isDesktop(info) ? 2 : 1);
  });

  test('keeps its close control on screen at 1440 x 900 without scrolling', async ({ page }, info) => {
    test.skip(!isDesktop(info), 'the desktop frame');
    const board = await open(page);
    const close = await board.getByRole('button', { name: 'Close the notice board' }).boundingBox();
    expect(close!.y + close!.height).toBeLessThanOrEqual(900);
  });

  test('states a sealed clipping\'s status in text and gives it no way in', async ({ page }) => {
    const board = await open(page);
    await expect(board.locator('.tqw-clipping[data-status="sealed"]')).toHaveCount(5);
    for (const stamp of await board.locator('.tqw-clipping__stamp').all()) await expect(stamp).toHaveText('Not yet open');
    await expect(board.getByRole('button', { name: /^Go in:/ })).toHaveCount(1);
    await expect(board.getByRole('button', { name: 'Go in: The Certification Office', exact: true })).toBeVisible();
    for (const title of ['The Exchange', 'The Outline Room']) {
      await expect(board.getByRole('button', { name: `Go in: ${title}`, exact: true })).toHaveCount(0);
    }
  });

  test('is a quiet face-up board in reduced motion: no tilt at all', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const board = await open(page);
    const angles = await board.locator('.tqw-clipping').evaluateAll((els) =>
      els.map((el) => {
        const m = new DOMMatrix(getComputedStyle(el).transform);
        return Math.abs((Math.atan2(m.b, m.a) * 180) / Math.PI);
      }),
    );
    expect(angles).toEqual([0, 0, 0, 0, 0, 0]);
  });

  test('rings Go in in ink on the paper, not in amber', async ({ page }) => {
    const board = await open(page);
    // Opened with the pointer, the first control is focused without a ring; the keyboard brings it.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(board.getByRole('button', { name: 'Go in: The Certification Office' })).toBeFocused();
    const ring = await styleOf(page, '.tqw-clipping__go', ['outline-color', 'outline-width', 'outline-style']);
    expect(ring).toEqual({ 'outline-color': 'rgb(45, 42, 38)', 'outline-width': '2px', 'outline-style': 'solid' });
  });

  test('fits 320 px: the board and its clippings never run wider than the screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page);
    await dialogDoesNotScrollSideways(page);
    await within(page, ['.tqw-board__frame', '.tqw-clipping']);
  });

  test('is reachable from the corridor and from inside the Office, and returns the visitor where they were', async ({ page }) => {
    await page.goto('/certification-office');
    await officePrepared(page);
    await expectSpine(page, 'chamber');
    // The game window's strip has no board button of its own; the Menu lists it (ADR 0003).
    await (await openMenu(page)).getByRole('button', { name: 'Notice board' }).click();
    const board = page.getByRole('dialog', { name: 'Notice board' });
    await expect(board).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(board).toBeHidden();
    await expectSpine(page, 'chamber');
  });
});

test.describe('site pages', () => {
  test('About reads in a 680 px column', async ({ page }, info) => {
    await page.goto('/about');
    const dialog = page.getByRole('dialog', { name: 'About UNHELD' });
    await expect(dialog).toBeVisible();
    const column = await dialog.locator('.tqw-page__sheet').boundingBox();
    if (isDesktop(info)) expect(column!.width).toBeCloseTo(680, 0);
    else expect(column!.width).toBeLessThanOrEqual(680);
  });

  test('About uses public Plex Sans body and control scales on desktop and phone', async ({ page }, info) => {
    await page.goto('/about');
    await expect(page.getByRole('dialog', { name: 'About UNHELD' })).toBeVisible();
    const paragraph = await styleOf(page, '.tqw-page__article p', ['font-size', 'line-height', 'font-family']);
    // Chromium's phone text autosizing expands the authored 17 px body to 18 px.
    const size = 18;
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--page-body-size').trim())).toBe(
      isDesktop(info) ? '1.125rem' : '1.0625rem',
    );
    expect(parseFloat(paragraph['font-size']!)).toBe(size);
    expect(parseFloat(paragraph['line-height']!)).toBeCloseTo(isDesktop(info) ? 28 : 27.5292, 1);
    expect(paragraph['font-family']).toContain('"IBM Plex Sans"');
    const link = await styleOf(page, '.tqw-page__link', ['font-size', 'font-family']);
    expect(link['font-size']).toBe(isDesktop(info) ? '15px' : '16px');
    expect(link['font-family']).toContain('"IBM Plex Sans"');
  });

  test('puts keyboard focus on the heading, and no ring on it', async ({ page }) => {
    await page.goto('/about');
    await expect(page.getByRole('heading', { level: 1, name: 'About UNHELD' })).toBeFocused();
    expect((await styleOf(page, '.tqw-page__title', ['outline-style']))['outline-style']).toBe('none');
  });

  for (const slug of ['about', 'credits', 'privacy']) {
    test(`/${slug} is a coal page that fits 320 px and keeps its navigation in reach`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(`/${slug}`);
      await expect(page.locator('dialog[open]')).toBeVisible();
      await dialogDoesNotScrollSideways(page);
      await within(page, ['.tqw-page__sheet', '.tqw-page__article p']);
      const nav = page.getByRole('navigation', { name: 'Site' });
      const box = await nav.boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(640);
    });
  }

  test('the not-found page shows a cropped blank plaque, the line, and the way back to the entrance', async ({ page }) => {
    await page.goto('/nowhere');
    const dialog = page.getByRole('dialog', { name: "This address isn't in the directory" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.tqw-plaque')).toBeVisible();
    expect((await dialog.locator('.tqw-plaque').boundingBox())!.width).toBeGreaterThan(200);
    expect(await dialog.locator('.tqw-plaque').textContent()).toBe('');
    await dialog.getByRole('link', { name: 'Back to the entrance' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expectSpine(page, 'entrance');
  });

  test('page changes keep the URL and the focus on the new heading', async ({ page }) => {
    await page.goto('/about');
    await page.getByRole('dialog').getByRole('link', { name: 'Credits' }).click();
    await expect(page).toHaveURL(/\/credits$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Credits' })).toBeFocused();
  });
});

test.describe('text mode', () => {
  for (const width of [412, 320]) {
    test(`reads the hero, then the corridor prose, at ${width} px, with no sideways scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      await page.goto('/?mode=text');
      const brand = page.getByRole('heading', { level: 1, name: 'UNHELD' });
      const corridor = page.getByRole('heading', { level: 1, name: 'The corridor' });
      await expect(brand).toBeVisible();
      await expect(page.locator('.tqw-hero').getByText('A space for everything we carry.', { exact: true })).toBeVisible();
      await expect(page.getByRole('contentinfo', { name: 'Site footer' }).getByText('A space for everything we carry.', { exact: true })).toBeVisible();
      await expect(corridor).toBeAttached();
      const [brandTop, corridorTop] = await Promise.all([
        brand.evaluate((el) => el.getBoundingClientRect().top + window.scrollY),
        corridor.evaluate((el) => el.getBoundingClientRect().top + window.scrollY),
      ]);
      expect(brandTop).toBeLessThan(corridorTop);
      await noHorizontalScroll(page);
    });
  }

  test('lists every door with its description, the open ones marked in text and in amber', async ({ page }) => {
    await page.goto('/?mode=text');
    const list = page.getByRole('navigation', { name: 'Doors' });
    await expect(list.locator('.tqw-door__description')).toHaveCount(6);
    await expect(list.locator('[data-status="open"] .tqw-door__status')).toHaveText(['open the door']);
    expect((await styleOf(page, '[data-status="open"] .tqw-door__status', ['color']))['color']).toBe('rgb(213, 155, 74)');
    await expect(list.locator('[data-status="sealed"] .tqw-door__status').first()).toHaveText('not yet open');
  });

  test('a visitor without WebGL meets the brand and can still go in', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (/webgl/i.test(type)) return null;
        return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await page.goto('/');
    await expect(site(page)).toHaveAttribute('data-text', 'true');
    // Visible, not merely present: toContainText reads hidden elements too.
    await expect(page.getByRole('heading', { level: 1, name: 'UNHELD' })).toBeVisible();
    await activateDoor(page, 'The Certification Office', 'open');
    await expectSpine(page, 'chamber');
  });

  test('the Office\'s text mode follows the hero in the page\'s flow, not over it', async ({ page }) => {
    await page.goto('/certification-office?mode=text');
    await expect(page.locator('.tqw-app[data-mode="text"]')).toBeVisible();
    const tops = await page.evaluate(() => {
      const top = (el: Element | null) => (el ? el.getBoundingClientRect().top + window.scrollY : Number.NaN);
      const hero = document.querySelector('.tqw-hero');
      return {
        heroBottom: hero ? hero.getBoundingClientRect().bottom + window.scrollY : Number.NaN,
        office: top(document.querySelector('.tqw-app[data-mode="text"] h1')),
      };
    });
    expect(tops.office).toBeGreaterThanOrEqual(tops.heroBottom - 1);
  });
});
