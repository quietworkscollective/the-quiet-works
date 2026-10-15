import { devices, expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { disableWebGL } from './helpers.ts';

const routes = [
  ['/about', 'About UNHELD'],
  ['/credits', 'Credits'],
  ['/privacy', 'Privacy'],
] as const;

function contrastRatio(first: string, second: string): number {
  const luminance = (color: string) => {
    const channels = color.match(/\d+/g)?.slice(0, 3).map(Number);
    if (!channels || channels.length !== 3) throw new Error(`Unexpected computed color: ${color}`);
    const linear = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
  };
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test.describe('reading pages', () => {
  test.beforeEach(async ({ page }) => disableWebGL(page));

  test('review captures', async ({ page }, info) => {
    const directory = process.env.TQW_READING_CAPTURE_DIR;
    test.skip(!directory);
    await mkdir(directory!, { recursive: true });
    for (const [route, title] of routes) {
      await page.goto(route);
      await expect(page.getByRole('dialog', { name: title })).toBeVisible();
      await page.screenshot({ path: path.join(directory!, `${info.project.name}-${route.slice(1)}.png`) });
    }
    await page.goto('/');
    await page.locator('.tqw-details').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(directory!, `${info.project.name}-lower.png`) });
  });

  test('opens each page as an opaque, inert full-page reading view', async ({ page }) => {
    for (const [route, title] of routes) {
      await page.goto(route);
      const reading = page.getByRole('dialog', { name: title });
      await expect(reading).toBeVisible();

      const state = await reading.evaluate((dialog) => {
        const menu = document.querySelector('.tqw-hero__menu');
        const box = menu?.getBoundingClientRect();
        const pointTarget = box
          ? document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
          : null;
        const viewportHits = [
          [20, 20],
          [document.documentElement.clientWidth - 20, 20],
          [20, document.documentElement.clientHeight - 20],
          [document.documentElement.clientWidth - 20, document.documentElement.clientHeight - 20],
        ].map(([x, y]) => {
          const hit = document.elementFromPoint(x!, y!);
          return {
            point: [x, y],
            target: hit ? `${hit.tagName}.${(hit as HTMLElement).className}` : 'none',
            inside: Boolean(hit && dialog.contains(hit)),
          };
        });
        return {
          background: getComputedStyle(dialog).backgroundColor,
          opacity: getComputedStyle(dialog).opacity,
          coversViewport: viewportHits.every((hit) => hit.inside),
          viewportHits,
          underlyingControlExists: Boolean(menu),
          pointIsInDialog: Boolean(pointTarget && dialog.contains(pointTarget)),
          bounds: (() => {
            const { x, y, width, height } = dialog.getBoundingClientRect();
            return { x, y, width, height, viewportWidth: document.documentElement.clientWidth, viewportHeight: document.documentElement.clientHeight };
          })(),
        };
      });

      expect(state.background).toBe('rgb(23, 26, 23)');
      expect(state.opacity).toBe('1');
      expect(state.coversViewport, JSON.stringify({ bounds: state.bounds, hits: state.viewportHits })).toBe(true);
      expect(state.underlyingControlExists).toBe(true);
      expect(state.pointIsInDialog).toBe(true);
      await reading.getByRole('button', { name: 'Close' }).focus();
      await page.keyboard.press('Shift+Tab');
      expect(await reading.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
    }
  });

  test('keeps navigation at the top and Close at the upper right, with no fixed bottom bar', async ({ page }) => {
    for (const [route, title] of routes) {
      await page.goto(route);
      const reading = page.getByRole('dialog', { name: title });
      const nav = reading.getByRole('navigation', { name: 'Site' });
      const close = reading.getByRole('button', { name: 'Close' });
      const [navBox, closeBox, layout] = await Promise.all([
        nav.boundingBox(),
        close.boundingBox(),
        nav.evaluate((element) => getComputedStyle(element).position),
      ]);
      expect(navBox, route).not.toBeNull();
      expect(closeBox, route).not.toBeNull();
      expect(navBox!.y, route).toBeLessThan(120);
      expect(closeBox!.width, `${route}: Close target width`).toBeGreaterThanOrEqual(44);
      expect(closeBox!.height, `${route}: Close target height`).toBeGreaterThanOrEqual(44);
      const rightInset = (await page.evaluate(() => document.documentElement.clientWidth)) - closeBox!.x - closeBox!.width;
      expect(rightInset, `${route}: deliberate Close inset`).toBe(test.info().project.name === 'mobile' ? 24 : 32);
      expect(layout, route).not.toBe('fixed');
      expect(layout, route).not.toBe('sticky');
      await expect(nav.getByRole('link', { name: title === 'About UNHELD' ? 'About' : title, exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(close).toHaveText('Close ×');

      if (test.info().project.name === 'mobile') {
        expect(navBox!.y, route).toBeGreaterThan(closeBox!.y + closeBox!.height - 2);
      }
    }
  });

  test('Escape and Close restore the opener focus and the previous document scroll', async ({ page }) => {
    await page.goto('/');
    // Font swaps can shorten the lower page and clamp a scroll position measured before layout settles.
    await page.evaluate(() => document.fonts.ready);
    const opener = page.locator('.tqw-footer__links a[href="/about"]');
    await opener.scrollIntoViewIfNeeded();
    await opener.focus();
    const beforeEscape = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'About UNHELD' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'About UNHELD' })).toBeHidden();
    await expect(opener).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(beforeEscape);

    await opener.focus();
    const beforeClose = await page.evaluate(() => window.scrollY);
    await opener.click();
    const reading = page.getByRole('dialog', { name: 'About UNHELD' });
    await expect(reading).toBeVisible();
    await reading.getByRole('button', { name: 'Close' }).click();
    await expect(reading).toBeHidden();
    await expect(opener).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(beforeClose);
  });

  test('direct URLs render as app pages with JavaScript and readable pages without it', async ({ page, browser }) => {
    for (const [route, title] of routes) {
      await page.goto(route);
      await expect(page.getByRole('dialog', { name: title })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${route}$`));
    }

    const mobile = test.info().project.name === 'mobile';
    const context = await browser.newContext(mobile
      ? { ...devices['Pixel 7'], javaScriptEnabled: false }
      : { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
    try {
      const noScript = await context.newPage();
      for (const [route, title] of routes) {
        await noScript.goto(`http://127.0.0.1:${process.env.TQW_E2E_PORT ?? '4173'}${route}`);
        const reading = noScript.locator('#static-content');
        await expect(reading.getByRole('heading', { level: 1, name: title })).toBeVisible();
        const siteNav = reading.getByRole('navigation', { name: 'Site', exact: true });
        await expect(siteNav.getByRole('link'))
          .toHaveText(['About', 'Credits', 'Privacy']);
        const close = reading.getByRole('link', { name: 'Close' });
        await expect(close).toHaveAttribute('href', '/');
        await expect(close).toHaveText('Close ×');
        await expect(reading).toContainText(title === 'About UNHELD' ? 'It is an artwork, not a support service.' : title);
        if (route === '/credits') {
          await expect(reading.locator('h2')).toHaveText(['Authorship', 'Licences', 'Typefaces:', 'Software:', 'Third-party assets']);
          await expect(reading.getByRole('link', { name: 'The full licence texts for everything bundled' }))
            .toHaveAttribute('href', '/third-party-notices.txt');
        }
        const [navBox, closeBox, background] = await Promise.all([
          siteNav.boundingBox(),
          close.boundingBox(),
          reading.evaluate((element) => getComputedStyle(element).backgroundColor),
        ]);
        expect(background).toBe('rgb(23, 26, 23)');
        expect(navBox).not.toBeNull();
        expect(closeBox).not.toBeNull();
        expect(navBox!.y).toBeLessThan(120);
        expect(closeBox!.width).toBeGreaterThanOrEqual(44);
        expect(closeBox!.height).toBeGreaterThanOrEqual(44);
        const viewportWidth = await noScript.evaluate(() => document.documentElement.clientWidth);
        const rightInset = viewportWidth - closeBox!.x - closeBox!.width;
        expect(rightInset).toBeGreaterThanOrEqual(24);
        expect(rightInset).toBeLessThanOrEqual(32);

        const bottomPadding = await reading.locator('.tqw-static-page__sheet').evaluate((sheet) => {
          const safeAreaRule = [...document.styleSheets].flatMap((styleSheet) => {
            try {
              return [...styleSheet.cssRules];
            } catch {
              return [];
            }
          }).some((rule) => rule instanceof CSSStyleRule
            && rule.selectorText === '.tqw-static-page__sheet'
            && rule.style.padding.includes('safe-area-inset-bottom'));
          return {
            pixels: Number.parseFloat(getComputedStyle(sheet).paddingBottom),
            safeAreaRule,
          };
        });
        expect(bottomPadding.pixels).toBeGreaterThanOrEqual(64);
        expect(bottomPadding.safeAreaRule).toBe(true);
      }
    } finally {
      await context.close();
    }
  });

  test('lower page keeps the artwork introduction prominent and contribution link with its copy', async ({ page }) => {
    await page.goto('/');
    const details = page.locator('.tqw-details');
    await details.scrollIntoViewIfNeeded();
    await expect(details.getByRole('heading', { name: 'What UNHELD is, and how it grows' })).toBeVisible();

    const contribution = details.locator('.tqw-details__topic').filter({ hasText: 'How to contribute' });
    const body = contribution.locator('.tqw-details__topic-body');
    const guide = contribution.getByRole('link', { name: 'Read the contribution guide' });
    await expect(guide).toBeVisible();
    await expect(body).not.toContainText(/Apache|Creative Commons|CC BY/i);
    const [bodyStyle, topicGap] = await Promise.all([
      body.evaluate((element) => ({
        size: getComputedStyle(element).fontSize,
        leading: getComputedStyle(element).lineHeight,
      })),
      details.locator('.tqw-details__topic').nth(1)
        .evaluate((element) => Number.parseFloat(getComputedStyle(element).marginTop)),
    ]);
    expect(bodyStyle).toEqual({ size: '18px', leading: '28px' });
    expect(topicGap).toBe(32);
    expect(await body.evaluate((element) => element.compareDocumentPosition(element.parentElement!.querySelector('a')!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();

    await page.goto('/credits');
    await expect(page.getByRole('dialog', { name: 'Credits' })).toContainText('Apache License 2.0');
    await expect(page.getByRole('dialog', { name: 'Credits' })).toContainText('CC BY 4.0');
  });

  test('Credits separates its existing copy and links the licence text descriptively', async ({ page }) => {
    await page.goto('/credits');
    const credits = page.getByRole('dialog', { name: 'Credits' });
    const headings = await credits.locator('.tqw-page__credits-section > h2').allTextContents();
    expect(headings).toEqual(['Authorship', 'Licences', 'Typefaces:', 'Software:']);
    await expect(credits.getByRole('heading', { name: 'Third-party assets' })).toBeVisible();
    await expect(credits.getByRole('link', { name: 'The full licence texts for everything bundled' }))
      .toHaveAttribute('href', '/third-party-notices.txt');
    await expect(credits).toContainText('IBM Plex Mono, IBM Plex Sans Condensed and Newsreader');
    await expect(credits).toContainText('React, Three.js and React Three Fiber (MIT).');
  });

  test('reading pages keep 64 px plus safe-area space after the last text', async ({ page }) => {
    for (const [route, title] of routes) {
      await page.goto(route);
      const measurement = await page.getByRole('dialog', { name: title }).evaluate((dialog) => {
        const sheet = dialog.querySelector<HTMLElement>('.tqw-page__sheet');
        const article = dialog.querySelector<HTMLElement>('.tqw-page__article');
        if (!sheet || !article) throw new Error('Reading page sheet or article is missing');
        const authoredPadding = [...document.styleSheets].flatMap((styleSheet) => {
          try {
            return [...styleSheet.cssRules];
          } catch {
            return [];
          }
        }).some((rule) => rule instanceof CSSStyleRule
          && rule.selectorText === '.tqw-page__sheet'
          && rule.style.padding.includes('safe-area-inset-bottom'));
        dialog.scrollTop = dialog.scrollHeight;
        const endGap = dialog.getBoundingClientRect().bottom - article.getBoundingClientRect().bottom;
        return {
          padding: Number.parseFloat(getComputedStyle(sheet).paddingBottom),
          endGap,
          authoredPadding,
        };
      });
      expect(measurement.padding, `${route}: end padding`).toBeGreaterThanOrEqual(64);
      expect(measurement.endGap, `${route}: visible space after article`).toBeGreaterThanOrEqual(measurement.padding - 1);
      expect(measurement.authoredPadding, `${route}: safe-area inset is included`).toBe(true);
    }
  });

  test('programmatic heading focus has no outline while keyboard-focused controls keep theirs', async ({ page }) => {
    await page.goto('/about');
    const reading = page.getByRole('dialog', { name: 'About UNHELD' });
    const headingState = await reading.getByRole('heading', { level: 1 }).evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        focused: document.activeElement === element,
        outlineStyle: style.outlineStyle,
      };
    });
    expect(headingState.focused).toBe(true);
    expect(headingState.outlineStyle).toBe('none');

    await reading.getByRole('link', { name: 'About', exact: true }).click();
    await page.keyboard.press('Tab');
    const controlState = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement;
      const style = getComputedStyle(element);
      return {
        isControl: element.matches('a[href], button'),
        visible: element.matches(':focus-visible'),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });
    expect(controlState.isControl).toBe(true);
    expect(controlState.visible).toBe(true);
    expect(controlState.outlineStyle).toBe('solid');
    expect(controlState.outlineWidth).toBe('2px');
  });

  test('keyboard focus uses a visible two-pixel text-colour ring with a three-pixel offset', async ({ page }) => {
    await page.goto('/about');
    const reading = page.getByRole('dialog', { name: 'About UNHELD' });
    const about = reading.getByRole('link', { name: 'About', exact: true });
    await about.click();
    expect(await about.evaluate((element) => element.matches(':focus-visible'))).toBe(false);
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      const style = element ? getComputedStyle(element) : null;
      return {
        visible: Boolean(element?.matches(':focus-visible')),
        color: style?.outlineColor,
        style: style?.outlineStyle,
        width: style?.outlineWidth,
        offset: style?.outlineOffset,
      };
    });
    expect(focus.visible).toBe(true);
    expect(focus.color).toBe('rgb(238, 234, 225)');
    expect(focus.style).toBe('solid');
    expect(focus.width).toBe('2px');
    expect(focus.offset).toBe('3px');
    await expect(reading).toBeVisible();
  });

  test('all reading-page text and control pairs meet WCAG AA contrast', async ({ page }) => {
    for (const [route, title] of routes) {
      await page.goto(route);
      const pairs = await page.getByRole('dialog', { name: title }).evaluate((dialog) => {
        const surface = getComputedStyle(dialog).backgroundColor;
        return [...dialog.querySelectorAll<HTMLElement>('h1, h2, h3, p, a, button, li')]
          .map((element) => ({ text: element.textContent?.trim(), foreground: getComputedStyle(element).color, surface }))
          .filter((pair) => pair.text);
      });
      for (const pair of pairs) {
        expect(pair.surface, `${route}: opaque reading surface`).toBe('rgb(23, 26, 23)');
        expect(contrastRatio(pair.foreground, pair.surface), `${route}: ${pair.text}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
