import { expect, test, type Page } from '@playwright/test';
import { corridorWalkable } from '../src/corridor/camera/viewpoints.ts';
import { polygonContains } from '../src/firstPerson/polygon.ts';
import { expectNoHoles, sweepHoles, viewsAt, walkablePositions, type SweepSpace } from './helpers/holeSweep.ts';

/**
 * The hole sweep's own checks, against a stand-in probe in a blank page (no app, no GPU): it asks
 * where to stand and where to look, reads the limit from the page, and reports exactly the views
 * in which something is missing. These are what show the sweep can fail: the corridor spec only
 * says the world is whole when the sweep is able to say it is not.
 */

const space: SweepSpace = { walkable: corridorWalkable(), forwardYawDeg: 0, pitchLimitDeg: 25 };

/**
 * A page whose "world" is drawn only within `drawnHalfArc` degrees of forward, and which lacks
 * everything beyond `missingBeyondZ` (an object removed) if given. Its probe reports the yaw limit it is given.
 */
async function standIn(page: Page, world: { limit: number; drawnHalfArc: number; missingBeyondZ?: number }): Promise<void> {
  await page.setContent('<!doctype html><title>stand-in</title>');
  await page.evaluate((w) => {
    const holeIn = (v: { x: number; z: number; yawDeg: number; pitchDeg: number }): number => {
      const yaw = ((((v.yawDeg + 180) % 360) + 360) % 360) - 180;
      let magenta = 0;
      // The picture's edge, 35.5 degrees beyond the view direction, must be inside what is drawn.
      if (Math.abs(yaw) + 35.5 > w.drawnHalfArc + 1e-6) magenta += 120;
      if (w.missingBeyondZ !== undefined && v.z < w.missingBeyondZ && Math.abs(yaw) > 30) magenta += 7;
      return magenta;
    };
    window.__tqwProbe = {
      limit: () => w.limit,
      size: () => ({ width: 384, height: 240 }),
      frame: (v) => ({ magenta: holeIn(v), pixels: 92160, first: null, calls: 10, triangles: 1000 }),
      image: () => '',
      sweep: (views) => {
        const holes = views.flatMap((v, index) => (holeIn(v) > 0 ? [{ index, magenta: holeIn(v), first: null }] : []));
        return { drawn: views.length, size: { width: 384, height: 240 }, holes, maxCalls: 10, maxTriangles: 1000 };
      },
      memory: () => ({ geometries: 1, textures: 1 }),
      dispose: () => undefined,
    };
  }, world);
}

test.describe('the hole sweep helper', () => {
  test('stands on a grid over the floor: inside the polygon, at its corners, 0.5 m apart', () => {
    const polygon = space.walkable;
    const spots = walkablePositions(polygon, 0.5);
    for (const p of spots) expect(polygonContains(polygon, p), `${p.x}, ${p.z}`).toBe(true);
    for (const corner of polygon) expect(spots.some((p) => Math.abs(p.x - corner.x) < 1e-6 && Math.abs(p.z - corner.z) < 1e-6)).toBe(true);
    // The corridor is 2.5 m by about 20 m and the lobby 4.3 m by about 8.5 m: a few hundred positions.
    expect(spots.length).toBeGreaterThan(300);
    // Verified against the rebuilt eight-corner floor and its rectangular collision bounds.
    expect(spots.length).toBe(541);
    // Neighbours along the corridor are half a metre apart (the grid starts at the lobby's left edge, x = -2.15).
    const down = spots.filter((p) => Math.abs(p.x + 0.15) < 1e-6 && p.z < 0).map((p) => p.z).sort((a, b) => a - b);
    expect(down.length).toBeGreaterThan(30);
    for (let i = 1; i < down.length; i += 1) expect(down[i]! - down[i - 1]!).toBeLessThanOrEqual(0.5 + 1e-6);
  });

  test('looks at the middle, both yaw limits and both pitch limits at each spot (and the four corners on request)', () => {
    const views = viewsAt({ x: 0.5, z: -3 }, space, 54.5);
    expect(views.map((v) => v.name)).toEqual(['middle', 'left', 'right', 'up', 'down']);
    expect(views.map((v) => [v.yawDeg, v.pitchDeg])).toEqual([
      [0, 0],
      [-54.5, 0],
      [54.5, 0],
      [0, 25],
      [0, -25],
    ]);
    expect(viewsAt({ x: 0, z: 0 }, space, 54.5, 'corners')).toHaveLength(9);
    // Measured from the stage's own forward axis.
    expect(viewsAt({ x: 0, z: 0 }, { ...space, forwardYawDeg: 90 }, 40)[1]!.yawDeg).toBe(50);
  });

  test('reports no holes in a world that is whole to the edge of the view at the limit', async ({ page }) => {
    await standIn(page, { limit: 54.5, drawnHalfArc: 90 });
    const report = await sweepHoles(page, { space, spacing: 1 });
    expect(report.limitDeg).toBe(54.5);
    expect(report.views).toBe(report.positions * 5);
    expect(report.holes).toEqual([]);
    expectNoHoles(report);
  });

  test('fails when the limit is wider than the world is drawn: the views at the yaw limits are named, and only those', async ({
    page,
  }) => {
    // The limit is 5 degrees too wide for what is built (a half-arc of 85 drawn, 90 shown).
    await standIn(page, { limit: 54.5, drawnHalfArc: 85 });
    const report = await sweepHoles(page, { space, spacing: 1 });
    expect(report.holes.length).toBe(report.positions * 2);
    expect(new Set(report.holes.map((h) => h.view.name))).toEqual(new Set(['left', 'right']));
    expect(() => expectNoHoles(report)).toThrow(/show a pixel nothing drew/);
    expect(() => expectNoHoles(report)).toThrow(/left at x/);
  });

  test('fails when something the camera can see is missing from one end of the floor, and says where', async ({ page }) => {
    await standIn(page, { limit: 54.5, drawnHalfArc: 90, missingBeyondZ: -10 });
    const report = await sweepHoles(page, { space, spacing: 1 });
    expect(report.holes.length).toBeGreaterThan(10);
    for (const h of report.holes) expect(h.view.z).toBeLessThan(-10);
    expect(() => expectNoHoles(report)).toThrow(/z -1\d\.\d\d/);
  });
});
