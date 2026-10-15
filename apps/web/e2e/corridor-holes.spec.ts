import { expect, test, type Page } from '@playwright/test';
import { corridorWalkable } from '../src/corridor/camera/viewpoints.ts';
import { expectSpine } from './helpers.ts';
import { attachHoleImages, describeSweep, expectNoHoles, sweepHoles, walkablePositions } from './helpers/holeSweep.ts';

/** The full 360° audit uses 15° steps and the controller's complete pitch range. */
const YAW_SAMPLES = Array.from({ length: 24 }, (_, i) => i * 15);
const PITCH_SAMPLES = [-25, 0, 25] as const;
const SPACE = {
  walkable: corridorWalkable(),
  forwardYawDeg: 0,
  pitchLimitDeg: 25,
  yawSamplesDeg: YAW_SAMPLES,
};
const GRID = walkablePositions(SPACE.walkable, 0.5);
const SHARDS = 4;
const POSITION_SHARDS = Array.from({ length: SHARDS }, (_, shard) => GRID.filter((_, index) => index % SHARDS === shard));

/** Opens the whole corridor/lobby world with the magenta hole probe installed. */
async function openProbe(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await page.goto('/?tqw-debug=holes');
  await expectSpine(page, 'entrance');
  await page.evaluate(() => {
    const game = document.getElementById('game');
    const window_ = game?.querySelector<HTMLElement>('.tqw-game__window');
    if (game) window.scrollTo(0, game.offsetTop + game.offsetHeight - (window_?.offsetHeight ?? window.innerHeight));
  });
  await expectSpine(page, 'corridor');
  await expect(page.locator('.tqw-corridor-canvas canvas')).toHaveAttribute('data-world', 'ready', { timeout: 60_000 });
  await page.waitForFunction(() => window.__tqwProbe !== undefined, undefined, { timeout: 60_000 });
}

test.describe('the corridor and lobby are built in every direction', () => {
  test.describe.configure({ mode: 'parallel' });

  for (const [shard, positions] of POSITION_SHARDS.entries()) {
    test(`walkable grid shard ${shard + 1}/${SHARDS} is covered through 360° and the full pitch range`, async ({ page, isMobile }, info) => {
    test.skip(process.env['TQW_HOLE_SWEEP'] !== '1', 'the coverage probe runs only in a development browser session');
    test.setTimeout(180 * 60_000);
    // Keep the physical aspect while limiting readback work for this exhaustive audit.
    const size = isMobile ? { width: 206, height: 457 } : { width: 640, height: 400 };
    await openProbe(page, size);
    const report = await sweepHoles(page, {
      space: SPACE,
      positions,
      spacing: 0.5,
      pitchSamplesDeg: PITCH_SAMPLES,
      batch: 24,
    });
    const summary = describeSweep(report);
    console.log(`[hole sweep ${isMobile ? 'Pixel 7' : 'desktop'}] ${summary}`);
    info.annotations.push({ type: 'sweep', description: `shard ${shard + 1}/${SHARDS}; ${summary}` });
    for (const h of [...report.holes].sort((a, b) => b.magenta - a.magenta).slice(0, 20)) {
      console.log(`  hole: ${h.view.name} x ${h.view.x} z ${h.view.z} yaw ${h.view.yawDeg} pitch ${h.view.pitchDeg}: ${h.magenta} px, first at ${h.first}`);
    }
    await attachHoleImages(page, info, report);
    expect(report.positions).toBe(positions.length);
    expect(report.views).toBe(report.positions * YAW_SAMPLES.length * PITCH_SAMPLES.length);
    expectNoHoles(report);
    });
  }
});
