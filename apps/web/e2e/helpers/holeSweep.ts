import { expect, type Page, type TestInfo } from '@playwright/test';
import type { Vec2 } from '../../src/firstPerson/bounds.ts';
import { polygonContains, type Polygon } from '../../src/firstPerson/polygon.ts';
import type { ProbeSweep } from '../../src/corridor/camera/probe.ts';

/**
 * The hole sweep (ADR 0007): for room stages this checks the bounded visible arc; free-look spaces
 * can supply a complete yaw ring. This renders the scene with a magenta clear
 * colour (the page is opened with `?tqw-debug=holes`; fog stays the scene's own) from a grid of
 * walkable positions, at both yaw limits, both pitch limits and the middle, and fails on any
 * magenta pixel: something the camera can see that nothing draws.
 *
 * It is chamber-agnostic: a space gives its walkable polygon, its forward heading and the limits
 * (read from the page, so the sweep tests what the page enforces), and the page gives it a probe
 * (`window.__tqwProbe`, installed by the space's scene when asked).
 */

export interface SweepSpace {
  /** The floor the visitor may stand on. */
  walkable: Polygon;
  /** Heading of the forward axis in degrees (0 looks toward -z). */
  forwardYawDeg: number;
  /** The controller's pitch limit in degrees, up and down. */
  pitchLimitDeg: number;
  /** Absolute headings to sample when a space allows free look. */
  yawSamplesDeg?: readonly number[];
}

export interface SweepOptions {
  space: SweepSpace;
  /** A disjoint portion of the walkable grid, used to parallelise long all-yaw sweeps. */
  positions?: Vec2[];
  /** Metres between standing positions; the brief asks for 0.5. */
  spacing?: number;
  /**
   * Which views to draw at each position. `cross` is the middle, both yaw limits and both pitch
   * limits; `corners` adds the four where a yaw limit and a pitch limit meet.
   */
  views?: 'cross' | 'corners';
  /** Views drawn per call into the page, so one slow call cannot outlast the test's patience. */
  batch?: number;
  /** Pitch values to cross with `space.yawSamplesDeg`; defaults to down, level and up. */
  pitchSamplesDeg?: readonly number[];
}

export interface SweepView {
  x: number;
  z: number;
  yawDeg: number;
  pitchDeg: number;
  /** Which of the views at the position this is: `middle`, `left`, `right`, `up`, `down`, or a corner. */
  name: string;
}

export interface SweepReport {
  /** Null when the sweep covers an unrestricted full yaw ring. */
  limitDeg: number | null;
  positions: number;
  views: number;
  /** The picture's size in device pixels. */
  size: { width: number; height: number };
  holes: { view: SweepView; magenta: number; first: [number, number] | null }[];
  /** The most draw calls and triangles any probed frame needed. */
  maxCalls: number;
  maxTriangles: number;
  memory: { geometries: number; textures: number };
}

/** Where to stand: a grid over the polygon, its corners, and its outline, all on the floor. */
export function walkablePositions(polygon: Polygon, spacing = 0.5): Vec2[] {
  const xs = polygon.map((p) => p.x);
  const zs = polygon.map((p) => p.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const out = new Map<string, Vec2>();
  const add = (p: Vec2) => {
    const q = { x: Math.round(p.x * 1000) / 1000, z: Math.round(p.z * 1000) / 1000 };
    if (polygonContains(polygon, q)) out.set(`${q.x},${q.z}`, q);
  };
  for (let x = minX; x <= maxX + 1e-9; x += spacing) {
    for (let z = minZ; z <= maxZ + 1e-9; z += spacing) add({ x, z });
  }
  // The corners and the edges between them are where a view is most likely to meet the end of the world.
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i] as Vec2;
    const b = polygon[(i + 1) % polygon.length] as Vec2;
    add(a);
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / spacing));
    for (let k = 1; k < steps; k += 1) add({ x: a.x + ((b.x - a.x) * k) / steps, z: a.z + ((b.z - a.z) * k) / steps });
  }
  return [...out.values()];
}

/** The views taken at one standing position. */
export function viewsAt(
  at: Vec2,
  space: Pick<SweepSpace, 'forwardYawDeg' | 'pitchLimitDeg'>,
  limitDeg: number,
  kind: 'cross' | 'corners' = 'cross',
): SweepView[] {
  const f = space.forwardYawDeg;
  const p = space.pitchLimitDeg;
  const view = (name: string, yaw: number, pitch: number): SweepView => ({ x: at.x, z: at.z, yawDeg: f + yaw, pitchDeg: pitch, name });
  const cross = [
    view('middle', 0, 0),
    view('left', -limitDeg, 0),
    view('right', limitDeg, 0),
    view('up', 0, p),
    view('down', 0, -p),
  ];
  if (kind === 'cross') return cross;
  return [
    ...cross,
    view('left-up', -limitDeg, p),
    view('left-down', -limitDeg, -p),
    view('right-up', limitDeg, p),
    view('right-down', limitDeg, -p),
  ];
}

/** Draws every view in the page and reports the ones that show a pixel nothing drew. */
export async function sweepHoles(page: Page, options: SweepOptions): Promise<SweepReport> {
  await page.waitForFunction(() => window.__tqwProbe !== undefined, undefined, { timeout: 60_000 });
  const limitDeg = options.space.yawSamplesDeg ? null : await page.evaluate(() => window.__tqwProbe!.limit());
  const positions = options.positions ?? walkablePositions(options.space.walkable, options.spacing ?? 0.5);
  const views = options.space.yawSamplesDeg
    ? positions.flatMap((p) =>
        options.space.yawSamplesDeg!.flatMap((yawDeg) =>
          (options.pitchSamplesDeg ?? [-options.space.pitchLimitDeg, 0, options.space.pitchLimitDeg]).map((pitchDeg) => ({
            x: p.x,
            z: p.z,
            yawDeg,
            pitchDeg,
            name: `yaw-${yawDeg}-pitch-${pitchDeg}`,
          })),
        ),
      )
    : positions.flatMap((p) => viewsAt(p, options.space, limitDeg as number, options.views ?? 'cross'));
  const batch = options.batch ?? 60;
  const report: SweepReport = {
    limitDeg,
    positions: positions.length,
    views: views.length,
    size: { width: 0, height: 0 },
    holes: [],
    maxCalls: 0,
    maxTriangles: 0,
    memory: { geometries: 0, textures: 0 },
  };
  for (let from = 0; from < views.length; from += batch) {
    const slice = views.slice(from, from + batch);
    const swept: ProbeSweep = await page.evaluate(
      (list) => window.__tqwProbe!.sweep(list),
      slice.map(({ x, z, yawDeg, pitchDeg }) => ({ x, z, yawDeg, pitchDeg })),
    );
    if (from === 0 || Math.floor(from / (batch * 20)) !== Math.floor((from + batch) / (batch * 20))) {
      console.log(`[hole sweep] ${Math.min(from + batch, views.length)}/${views.length} views`);
    }
    // The integration preview can predate the optional sweep-size field; its stable size() API
    // reports the same drawing buffer and keeps red runs attributable to the scene geometry.
    report.size = swept.size ?? (await page.evaluate(() => window.__tqwProbe!.size()));
    report.maxCalls = Math.max(report.maxCalls, swept.maxCalls);
    report.maxTriangles = Math.max(report.maxTriangles, swept.maxTriangles);
    for (const hole of swept.holes) {
      report.holes.push({ view: slice[hole.index] as SweepView, magenta: hole.magenta, first: hole.first });
    }
  }
  report.memory = await page.evaluate(() => window.__tqwProbe!.memory());
  return report;
}

/** Fails with the first few holes named, so the missing piece can be found. */
export function expectNoHoles(report: SweepReport, show = 8): void {
  const lines = report.holes
    .slice(0, show)
    .map(
      ({ view, magenta, first }) =>
        `  ${view.name} at x ${view.x.toFixed(2)}, z ${view.z.toFixed(2)} (yaw ${view.yawDeg.toFixed(1)}, pitch ${view.pitchDeg.toFixed(1)}): ` +
        `${magenta} px of ${report.size.width * report.size.height}, first at ${first ? first.join(',') : '?'}`,
    );
  expect(
    report.holes.length,
    `${report.holes.length} of ${report.views} views (from ${report.positions} positions, ${report.limitDeg === null ? 'full 360° yaw ring' : `yaw limit ${report.limitDeg.toFixed(1)}`}) show a pixel nothing drew:\n${lines.join('\n')}`,
  ).toBe(0);
}

/** One line of what the sweep covered and what the scene cost, for the test log. */
export const describeSweep = (report: SweepReport): string =>
  `${report.views} views from ${report.positions} positions at ${report.size.width}x${report.size.height}, ${report.limitDeg === null ? 'full 360° yaw ring' : `yaw limit ${report.limitDeg.toFixed(1)}`}: ` +
  `${report.holes.length} holes; up to ${report.maxCalls} draw calls and ${report.maxTriangles} triangles a frame; ` +
  `${report.memory.geometries} geometries, ${report.memory.textures} textures held`;

/** Attaches a picture of the first few holes to the test report, so the missing piece can be found by eye. */
export async function attachHoleImages(page: Page, info: TestInfo, report: SweepReport, count = 3): Promise<void> {
  const worst = [...report.holes].sort((a, b) => b.magenta - a.magenta).slice(0, count);
  for (const [i, { view }] of worst.entries()) {
    const url = await page.evaluate(
      (v) => window.__tqwProbe!.image({ x: v.x, z: v.z, yawDeg: v.yawDeg, pitchDeg: v.pitchDeg }),
      view,
    );
    await info.attach(`hole-${i}-${view.name}-x${view.x.toFixed(2)}-z${view.z.toFixed(2)}.png`, {
      body: Buffer.from(url.replace(/^data:image\/png;base64,/, ''), 'base64'),
      contentType: 'image/png',
    });
  }
}
