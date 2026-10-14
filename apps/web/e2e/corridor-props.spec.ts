import { expect, test, type Page } from '@playwright/test';
import { PROPS } from '../src/corridor/props.ts';
import { door, expectSpine, site } from './helpers.ts';

/**
 * The things to touch in the lobby and corridor (ADR 0004), as the built app draws them: the twelve
 * props mount without a shader error or a GL warning (a bad patch of the world's lamp and fog
 * shader on a skinned mesh would show here), in both of the world's quality tiers, and they are
 * built again, cleanly, when the corridor is entered a second time. Their look is checked by the
 * evidence screenshots; their poses, anchors, clearance, budget, lettering and disposal by the unit
 * tests. Whether they cost frames while nothing moves is the existing idle test's to say
 * (corridor-world.spec.ts): the props draw only when a frame is drawn for some other reason.
 */

/** Messages that are not the app's: fiber's deprecated THREE.Clock and Chromium's one GL driver hint per process. */
const isKnownNoise = (text: string): boolean => text.includes('THREE.Clock') || text.includes('GL Driver Message');

function listen(page: Page): string[] {
  const noise: string[] = [];
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type()) && !isKnownNoise(m.text())) noise.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`));
  return noise;
}

const canvas = (page: Page) => page.locator('.tqw-corridor-canvas canvas');

/** The props are built: their canvas is marked once the atlas is drawn and the rig is in the scene. */
async function propsReady(page: Page): Promise<void> {
  await expect(canvas(page)).toHaveAttribute('data-props', String(PROPS.length), { timeout: 40_000 });
}

test.describe('the corridor props', () => {
  // The software rasteriser reports as a CPU renderer, so the world drops to its lite tier by default;
  // `?quality=high` asks for the full one. Both tiers must take the props.
  for (const [tier, url] of [['lite tier', '/'], ['full tier', '/?quality=high']] as const) {
    test(`are built in the ${tier} without console errors or warnings`, async ({ page }) => {
      const noise = listen(page);
      await page.goto(url);
      await expectSpine(page, 'entrance');
      await propsReady(page);
      await page.getByRole('button', { name: 'Enter The Quiet Works' }).click();
      await expectSpine(page, 'corridor');
      // Let the first frames of the corridor draw with the props in them.
      await page.waitForTimeout(2500);
      expect(noise).toEqual([]);
    });
  }

  test('are built again, cleanly, when the corridor is entered a second time', async ({ page }) => {
    test.setTimeout(150_000);
    const noise = listen(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Enter The Quiet Works' }).click();
    await expectSpine(page, 'corridor');
    await propsReady(page);
    await door(page, 'The Certification Office', 'open').focus();
    await page.keyboard.press('Enter');
    // The Office's own scene is slow to start on a software rasteriser: allow it.
    await expect(site(page)).toHaveAttribute('data-spine', 'chamber', { timeout: 45_000 });
    await page.getByRole('button', { name: 'Return to the corridor' }).click();
    await expectSpine(page, 'corridor');
    await propsReady(page);
    await page.waitForTimeout(1500);
    expect(noise).toEqual([]);
  });
});
