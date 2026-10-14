export const BAKE_CAPTURE_TIME = new Date('2026-10-14T12:00:00.000Z');

/** Reapply date-driven poses at one fixed instant before the bake and freshness fingerprint. */
export async function prepareBakeCapture(page, space) {
  await page.clock.setFixedTime(BAKE_CAPTURE_TIME);
  if (space === 'corridor') {
    await page.evaluate(() => {
      const hook = window.__tqwA1;
      if (!hook) throw new Error('Corridor capture hook is unavailable');
      hook.render();
    });
  }
}
