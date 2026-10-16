import { expect, test, type Page } from '@playwright/test';

const site = (page: Page) => page.locator('.tqw-site');
const scrollY = (page: Page) => page.evaluate(() => window.scrollY);
const scrollLocks = (page: Page) =>
  page.evaluate(() => ({
    rootOverflow: document.documentElement.style.overflow,
    bodyOverflow: document.body.style.overflow,
    bodyPosition: document.body.style.position,
  }));
const footerInView = (page: Page) =>
  page.evaluate(() => {
    const footer = document.querySelector('.tqw-footer');
    if (!footer) return false;
    const box = footer.getBoundingClientRect();
    return box.top < window.innerHeight && box.bottom > 0;
  });

/** One visitor gesture down or up the page. Each one must move the page: a held page fails here. */
async function scrollOnce(page: Page, down: boolean): Promise<void> {
  const before = await scrollY(page);
  await page.mouse.wheel(0, down ? 600 : -600);
  const position = expect.poll(() => scrollY(page), {
    message: `the page must keep scrolling ${down ? 'down' : 'up'} from ${before}`,
    timeout: 5_000,
  });
  if (down) await position.toBeGreaterThan(before);
  else await position.toBeLessThan(before);
}

async function stubScene(page: Page): Promise<void> {
  // The page's scroll ownership is a DOM contract: the scene's WebGL frames are not needed.
  await page.route('**/CorridorScene-*.js', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: 'export default function CorridorScene() { return null; }' }),
  );
}

test('scrolling never takes the page: hero to footer and back, with no scroll lock', { tag: '@fast' }, async ({ page }) => {
  test.setTimeout(120_000);
  await stubScene(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect.poll(() => scrollY(page)).toBe(0);
  await page.mouse.move(195, 400);

  for (let step = 0; step < 80 && !(await footerInView(page)); step += 1) {
    await scrollOnce(page, true);
    await expect(site(page), 'scrolling alone never engages the game window').not.toHaveAttribute('data-engaged', 'true');
  }
  await expect(page.locator('.tqw-footer')).toBeInViewport();
  expect(await scrollLocks(page)).toEqual({ rootOverflow: '', bodyOverflow: '', bodyPosition: '' });

  for (let step = 0; step < 80 && (await scrollY(page)) > 0; step += 1) await scrollOnce(page, false);
  await expect.poll(() => scrollY(page)).toBe(0);
  await expect(site(page)).toHaveAttribute('data-spine', 'entrance');
});
