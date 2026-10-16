import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { expectSpine } from './helpers.ts';
import { decodePng, luminance } from './png.ts';

async function openHero(page: Page): Promise<void> {
  await page.goto('/');
  await expectSpine(page, 'entrance');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2600);
}

test('the landing carries visible, non-transparent smoke from its first frame', async ({ page }) => {
  await openHero(page);
  const smoke = page.locator('.tqw-hero__smoke');
  await expect(smoke).toHaveCount(1);
  const appearance = await smoke.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const alphas = [...style.backgroundImage.matchAll(/rgba?\([^)]*?,\s*([\d.]+)\s*\)/g)].map((match) => Number(match[1]));
    return {
      opacity: Number(style.opacity),
      visibility: style.visibility,
      background: style.backgroundImage,
      alpha: Math.max(...alphas, 0),
      width: rect.width,
      height: rect.height,
    };
  });
  expect(appearance.visibility).toBe('visible');
  expect(appearance.opacity).toBeGreaterThan(0.05);
  expect(appearance.background).not.toBe('none');
  expect(appearance.alpha).toBeGreaterThan(0.05);
  expect(appearance.width).toBeGreaterThanOrEqual(await page.evaluate(() => window.innerWidth * 0.9));
  expect(appearance.height).toBeGreaterThanOrEqual(await page.evaluate(() => window.innerHeight * 0.9));
  await expect(smoke).toHaveCSS('animation-name', 'tqw-hero-smoke-drift');
  await expect(smoke).toHaveCSS('animation-duration', '9s');
  await page.locator('.tqw-hero').evaluate((hero) => ((hero as HTMLElement).dataset['visible'] = 'false'));
  await expect(smoke).toHaveCSS('animation-play-state', 'paused');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expectSpine(page, 'entrance');
  const still = page.locator('.tqw-hero__smoke');
  await expect(still).toBeVisible();
  await expect(page.locator('.tqw-hero')).toHaveAttribute('data-motion', 'still');
  const stillAppearance = await still.evaluate((element) => {
    const style = getComputedStyle(element);
    return { opacity: Number(style.opacity), background: style.backgroundImage, animation: style.animationName };
  });
  expect(stillAppearance.opacity).toBeGreaterThan(0.05);
  expect(stillAppearance.background).not.toBe('none');
  expect(stillAppearance.animation).toBe('none');
});

test('the scroll cue has no dark background panel', async ({ page }) => {
  await openHero(page);
  const cue = page.locator('.tqw-hero__cue');
  const styles = await cue.evaluate((element) => {
    const own = getComputedStyle(element);
    const before = getComputedStyle(element, '::before');
    return {
      background: own.backgroundColor,
      image: own.backgroundImage,
      beforeImage: before.backgroundImage,
      beforeColor: before.backgroundColor,
    };
  });
  expect(styles.background).toBe('rgba(0, 0, 0, 0)');
  expect(styles.image).toBe('none');
  expect(styles.beforeImage).toBe('none');
  expect(styles.beforeColor).toBe('rgba(0, 0, 0, 0)');
});

test('the hero has no hard luminance edge down its centre', async ({ page }) => {
  await openHero(page);
  const hero = page.locator('.tqw-hero');
  const bounds = await hero.boundingBox();
  expect(bounds).not.toBeNull();
  await page.evaluate(() => {
    // A neutral field removes real architecture so this trace isolates the screen-space haze and scrim.
    const window_ = document.querySelector<HTMLElement>('.tqw-game__window');
    const world = document.querySelector<HTMLElement>('.tqw-game__world');
    const poster = document.querySelector<HTMLElement>('.tqw-poster');
    if (window_) window_.style.background = 'rgb(150, 150, 150)';
    if (world) world.style.visibility = 'hidden';
    if (poster) poster.style.visibility = 'hidden';

    for (const selector of ['.tqw-hero__menu', '.tqw-hero__name', '.tqw-hero__tagline', '.tqw-hero__enter']) {
      const node = document.querySelector<HTMLElement>(selector);
      if (node) node.style.visibility = 'hidden';
    }
    const details = document.querySelector<HTMLElement>('.tqw-hero__details');
    if (details) {
      details.style.color = 'transparent';
      details.style.textShadow = 'none';
      for (const child of details.querySelectorAll<HTMLElement>('*')) child.style.visibility = 'hidden';
    }
    const cue = document.querySelector<HTMLElement>('.tqw-hero__cue');
    if (cue) {
      cue.style.color = 'transparent';
      for (const child of cue.querySelectorAll<HTMLElement | SVGElement>('*')) child.style.visibility = 'hidden';
    }
  });
  const raster = decodePng(await page.screenshot({ scale: 'css' }));
  const x = Math.floor(raster.width / 2);
  const samples = Array.from({ length: Math.ceil(bounds!.height) }, (_, index) => luminance(raster.at(x, Math.floor(bounds!.y + index))));
  const changes = samples.slice(1).map((value, index) => ({
    delta: Math.abs(value - samples[index]!),
    y: index + 1,
  }));
  const largest = changes.reduce((current, sample) => sample.delta > current.delta ? sample : current, { delta: 0, y: 0 });
  console.log(`landing centre luminance step=${largest.delta.toFixed(4)} at row ${largest.y}`);
  expect(largest.delta).toBeLessThanOrEqual(0.04);
});

test('captures the landing before and after at desktop and phone sizes', async ({ page }, info: TestInfo) => {
  const evidenceDir = process.env['TQW_LANDING_EVIDENCE_DIR'];
  test.skip(process.env['TQW_LANDING_EVIDENCE'] !== '1' || !evidenceDir, 'set TQW_LANDING_EVIDENCE=1 and TQW_LANDING_EVIDENCE_DIR');
  test.skip(info.project.name !== 'desktop' && info.project.name !== 'mobile', 'capture the two target project sizes');
  test.setTimeout(120_000);
  const phase = process.env['TQW_LANDING_PHASE'] ?? 'after';
  await mkdir(evidenceDir!, { recursive: true });

  if (info.project.name === 'desktop') {
    await openHero(page);
    await page.screenshot({ path: path.join(evidenceDir!, `desktop-1440x900-${phase}.png`), animations: 'disabled' });
    return;
  }

  await openHero(page);
  await page.screenshot({ path: path.join(evidenceDir!, `pixel7-${phase}.png`), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(evidenceDir!, `iphone-size-390x844-${phase}.png`), animations: 'disabled' });
});
