import { describe, expect, it } from 'vitest';
import { SPINE_TIMING } from '../timing.ts';
import { createFirstPerson, type FirstPerson } from './controller.ts';
import { polygonContains, type Polygon } from './polygon.ts';
import { DEFAULT_SOFT_EDGE_DEG, horizontalFovDeg, yawRelative, type Stage } from './stage.ts';

const FRAME = 1000 / 60;

/** A lobby opening into a corridor, as one outline. */
const WALKABLE: Polygon = [
  { x: -2.15, z: 9.8 },
  { x: 2.15, z: 9.8 },
  { x: 2.15, z: 1.35 },
  { x: 1.25, z: 1.35 },
  { x: 1.25, z: -19 },
  { x: -1.25, z: -19 },
  { x: -1.25, z: 1.35 },
  { x: -2.15, z: 1.35 },
];
const STAGE: Stage = { forwardYawDeg: 0, visibleHalfArcDeg: 90, walkable: WALKABLE };

const DESKTOP_HFOV = horizontalFovDeg(48, 1.6);
const PHONE_HFOV = horizontalFovDeg(58, 390 / 844);

function make(
  options: {
    hfov?: number;
    stage?: Stage;
    reduced?: boolean;
    start?: Partial<{ x: number; z: number; yawDeg: number }>;
    softStopM?: { x: number; z: number };
  } = {},
): FirstPerson {
  const fp = createFirstPerson({
    start: { x: 0, z: 5, yawDeg: 0, pitchDeg: 0, ...options.start },
    stage: options.stage ?? STAGE,
    softStopM: options.softStopM ?? { x: 0.3, z: 1.2 },
    ...(options.reduced !== undefined ? { reducedMotion: options.reduced } : {}),
  });
  fp.setLens(options.hfov ?? DESKTOP_HFOV);
  return fp;
}

function run(fp: FirstPerson, ms: number, each?: (fp: FirstPerson, t: number) => void): void {
  let t = 0;
  while (t < ms - 1e-6) {
    const dt = Math.min(FRAME, ms - t);
    fp.step(dt);
    t += dt;
    each?.(fp, t);
  }
}

describe('the yaw limit the controller works to', () => {
  it('is derived from the screen: about 54.5 degrees on 16:10, 51.6 on 16:9, 75 on a portrait phone', () => {
    expect(make({ hfov: horizontalFovDeg(48, 1.6) }).yawLimitDeg).toBeCloseTo(54.55, 1);
    expect(make({ hfov: horizontalFovDeg(48, 16 / 9) }).yawLimitDeg).toBeCloseTo(51.6, 1);
    const phone = make({ hfov: PHONE_HFOV }).yawLimitDeg;
    expect(phone).toBeGreaterThan(74);
    expect(phone).toBeLessThan(77);
  });

  it('follows the viewport as it changes, and is never more than 90 degrees minus half the field of view', () => {
    const fp = make();
    for (const aspect of [0.46, 0.75, 1, 1.6, 1.78, 2.33]) {
      const hfov = horizontalFovDeg(aspect < 1 ? 58 : 48, aspect);
      fp.setLens(hfov);
      expect(fp.yawLimitDeg).toBeCloseTo(90 - hfov / 2, 9);
    }
  });

  it('is nothing without a stage: the view turns freely', () => {
    const fp = createFirstPerson({ start: { x: 0, z: 0, yawDeg: 0, pitchDeg: 0 }, bounds: [{ minX: -2, maxX: 2, minZ: -5, maxZ: 5 }] });
    expect(fp.yawLimitDeg).toBe(Number.POSITIVE_INFINITY);
    fp.look(400, 0);
    expect(fp.pose.yawDeg).toBe(400);
  });

  it('needs a stage or bounds', () => {
    expect(() => createFirstPerson({ start: { x: 0, z: 0, yawDeg: 0, pitchDeg: 0 } })).toThrow();
  });

  it('is measured from the stage’s own forward axis', () => {
    const toward = make({ stage: { ...STAGE, forwardYawDeg: 90 }, start: { yawDeg: 90 } });
    toward.look(200, 0);
    expect(yawRelative({ forwardYawDeg: 90 }, toward.pose.yawDeg)).toBeLessThanOrEqual(toward.yawLimitDeg + 1e-9);
    expect(yawRelative({ forwardYawDeg: 90 }, toward.pose.yawDeg)).toBeGreaterThan(toward.yawLimitDeg - 2);
    toward.look(-400, 0);
    expect(yawRelative({ forwardYawDeg: 90 }, toward.pose.yawDeg)).toBeGreaterThanOrEqual(-toward.yawLimitDeg - 1e-9);
  });
});

describe('looking (pointer and touch) eases to nothing at the limit', () => {
  it('slows over the last 20 degrees and never passes the limit, however far the pointer is dragged', () => {
    const fp = make();
    const limit = fp.yawLimitDeg;
    const steps: number[] = [];
    let last = fp.pose.yawDeg;
    for (let i = 0; i < 2000; i += 1) {
      fp.look(1, 0);
      steps.push(fp.pose.yawDeg - last);
      last = fp.pose.yawDeg;
      expect(fp.pose.yawDeg).toBeLessThanOrEqual(limit + 1e-9);
    }
    // Full speed until 20 degrees short of the limit...
    expect(steps[0]).toBe(1);
    expect(steps[Math.floor(limit - DEFAULT_SOFT_EDGE_DEG) - 1]).toBeCloseTo(1, 6);
    // ...then slower and slower, never faster again, and nothing at the end.
    const zone = steps.slice(Math.ceil(limit - DEFAULT_SOFT_EDGE_DEG) + 1);
    for (let i = 1; i < zone.length; i += 1) expect(zone[i]!).toBeLessThanOrEqual(zone[i - 1]! + 1e-12);
    expect(steps.at(-1)!).toBeLessThan(0.001);
    expect(fp.pose.yawDeg).toBeGreaterThan(limit - 0.5);
  });

  it('is smooth: no step of a drag differs from the one before it by more than a few hundredths of a degree', () => {
    const fp = make();
    let last = fp.pose.yawDeg;
    let lastStep = 0;
    let worst = 0;
    for (let i = 0; i < 300; i += 1) {
      fp.look(1, 0);
      const step = fp.pose.yawDeg - last;
      if (i > 0) worst = Math.max(worst, Math.abs(step - lastStep));
      lastStep = step;
      last = fp.pose.yawDeg;
    }
    expect(worst).toBeLessThan(0.1);
  });

  it('eases a single huge drag through the soft edge too, and stops just inside the limit', () => {
    const fp = make();
    fp.look(500, 0);
    expect(fp.pose.yawDeg).toBeLessThanOrEqual(fp.yawLimitDeg);
    expect(fp.pose.yawDeg).toBeGreaterThan(fp.yawLimitDeg - 2);
    const left = make();
    left.look(-500, 0);
    expect(left.pose.yawDeg).toBeGreaterThanOrEqual(-left.yawLimitDeg);
    expect(left.pose.yawDeg).toBeLessThan(-left.yawLimitDeg + 2);
  });

  it('leaves a turn away from the limit at full speed, even at the limit: no sticking, no bounce-back', () => {
    const fp = make();
    fp.look(500, 0);
    const at = fp.pose.yawDeg;
    fp.look(-5, 0);
    expect(fp.pose.yawDeg).toBeCloseTo(at - 5, 9);
    // And nothing pulls it back by itself.
    run(fp, 2000);
    expect(fp.pose.yawDeg).toBeCloseTo(at - 5, 9);
  });

  it('is the same on a portrait phone, with its own wider limit', () => {
    const fp = make({ hfov: PHONE_HFOV });
    fp.look(500, 0);
    expect(fp.pose.yawDeg).toBeLessThanOrEqual(fp.yawLimitDeg);
    expect(fp.pose.yawDeg).toBeGreaterThan(fp.yawLimitDeg - 2);
    expect(fp.yawLimitDeg).toBeGreaterThan(70);
  });

  it('is the same under reduced motion: a drag still looks, and still eases to nothing at the limit', () => {
    const fp = make({ reduced: true });
    fp.look(10, 0);
    expect(fp.pose.yawDeg).toBe(10);
    fp.look(500, 0);
    expect(fp.pose.yawDeg).toBeLessThanOrEqual(fp.yawLimitDeg);
    expect(fp.pose.yawDeg).toBeGreaterThan(fp.yawLimitDeg - 2);
  });

  it('never moves the camera, and keeps the pitch limits', () => {
    const fp = make();
    const before = { x: fp.pose.x, z: fp.pose.z };
    fp.look(300, 80);
    expect({ x: fp.pose.x, z: fp.pose.z }).toEqual(before);
    expect(fp.pose.pitchDeg).toBe(25);
  });
});

describe('turning with the keys eases to nothing at the limit', () => {
  it('slows smoothly to a standstill without a jump, and never passes the limit', () => {
    const fp = make();
    fp.turn('key', 1);
    const limit = fp.yawLimitDeg;
    let last = fp.pose.yawDeg;
    let lastStep = 0;
    let worstJump = 0;
    let fastest = 0;
    run(fp, 12_000, (f) => {
      const step = f.pose.yawDeg - last;
      fastest = Math.max(fastest, step);
      // The pace changes smoothly through the soft edge (the ramp up from rest is the ramp's own business).
      if (f.pose.yawDeg > limit - DEFAULT_SOFT_EDGE_DEG) worstJump = Math.max(worstJump, Math.abs(step - lastStep));
      expect(step).toBeGreaterThanOrEqual(-1e-12);
      expect(f.pose.yawDeg).toBeLessThanOrEqual(limit + 1e-9);
      lastStep = step;
      last = f.pose.yawDeg;
    });
    // 75 degrees a second is 1.25 degrees a frame; through the soft edge no frame changes the pace abruptly.
    expect(fastest).toBeLessThanOrEqual((SPINE_TIMING.turnDegPerS * FRAME) / 1000 + 1e-9);
    expect(worstJump).toBeLessThan(0.13);
    expect(fp.pose.yawDeg).toBeGreaterThan(limit - 1);
    expect(lastStep).toBeLessThan(0.01);
  });

  it('works the same toward the left', () => {
    const fp = make();
    fp.turn('key', -1);
    run(fp, 12_000, (f) => expect(f.pose.yawDeg).toBeGreaterThanOrEqual(-fp.yawLimitDeg - 1e-9));
    expect(fp.pose.yawDeg).toBeLessThan(-fp.yawLimitDeg + 1);
  });

  it('does not bounce back when the key is let go at the limit, nor coast past it', () => {
    const fp = make();
    fp.turn('key', 1);
    run(fp, 12_000);
    const at = fp.pose.yawDeg;
    fp.turn('key', 0);
    run(fp, 2000, (f) => {
      expect(f.pose.yawDeg).toBeGreaterThanOrEqual(at - 1e-9);
      expect(f.pose.yawDeg).toBeLessThanOrEqual(fp.yawLimitDeg + 1e-9);
    });
  });

  it('lets a turn the other way begin at once from the limit', () => {
    const fp = make();
    fp.turn('key', 1);
    run(fp, 12_000);
    fp.turn('key', 0);
    run(fp, 500);
    const at = fp.pose.yawDeg;
    fp.turn('key', -1);
    run(fp, 500);
    expect(fp.pose.yawDeg).toBeLessThan(at - 10);
  });
});

describe('a view left past a new limit', () => {
  it('eases back inside when the screen narrows its limit (a phone turned on its side): no snap', () => {
    const fp = make({ hfov: PHONE_HFOV });
    fp.look(500, 0);
    const before = fp.pose.yawDeg;
    expect(before).toBeGreaterThan(70);
    fp.setLens(DESKTOP_HFOV);
    const target = fp.yawLimitDeg;
    let last = before;
    let worst = 0;
    let wrongWay = false;
    run(fp, 2000, (f) => {
      const step = last - f.pose.yawDeg;
      worst = Math.max(worst, step);
      if (step < -1e-9) wrongWay = true;
      last = f.pose.yawDeg;
    });
    expect(wrongWay).toBe(false);
    // The biggest single frame is a fraction of the correction, not all of it.
    expect(worst).toBeLessThan((before - target) * 0.3);
    expect(fp.pose.yawDeg).toBeLessThanOrEqual(target + 1e-9);
    expect(fp.pose.yawDeg).toBeGreaterThan(target - 0.5);
  });

  it('is never needed when the screen only widens its limit: the view stays where it is', () => {
    const fp = make();
    fp.look(30, 0);
    fp.setLens(PHONE_HFOV);
    run(fp, 1000);
    expect(fp.pose.yawDeg).toBe(30);
  });
});

describe('scripted moves stay inside the limit', () => {
  it('puts a cut view inside it, and keeps a pose set from outside inside it too', () => {
    const fp = make();
    fp.cutTo({ x: 0, z: 0, yawDeg: 90, pitchDeg: 0 });
    expect(fp.pose.yawDeg).toBeCloseTo(fp.yawLimitDeg, 9);
    fp.setPose({ yawDeg: -170 });
    expect(fp.pose.yawDeg).toBeCloseTo(-fp.yawLimitDeg, 9);
    fp.setPose({ yawDeg: 20 });
    expect(fp.pose.yawDeg).toBe(20);
  });

  it('frames no glide beyond it: the framing target is brought inside, and the glide ends there', () => {
    const fp = make();
    let done = false;
    fp.glideTo({ x: 0.2, z: 2, yawDeg: 90, pitchDeg: -10 }, { onDone: () => (done = true) });
    run(fp, 15_000, (f) => expect(Math.abs(f.pose.yawDeg)).toBeLessThanOrEqual(f.yawLimitDeg + 1e-9));
    expect(done).toBe(true);
    expect(fp.pose.yawDeg).toBeCloseTo(fp.yawLimitDeg, 6);
  });

  it('keeps a glide whose target is inside the limit exactly as authored', () => {
    const fp = make();
    fp.glideTo({ x: -0.4, z: 3, yawDeg: -40, pitchDeg: -2 });
    run(fp, 15_000);
    expect(fp.pose.yawDeg).toBe(-40);
  });
});

describe('movement on the stage’s floor', () => {
  it('never leaves the polygon, however long a key is held at either limit of the view', () => {
    for (const yaw of [-54, 0, 54, 180]) {
      const fp = make({ start: { z: 5 }, hfov: DESKTOP_HFOV });
      fp.setPose({ yawDeg: yaw });
      fp.hold('key', 1);
      run(fp, 60_000, (f) => expect(polygonContains(WALKABLE, { x: f.pose.x, z: f.pose.z }), `yaw ${yaw}`).toBe(true));
    }
  });

  it('is held to the polygon by the polygon, not only by the soft stop: with none, a hard stop that still slides', () => {
    const none = { x: 0, z: 0 };
    for (const yaw of [-54, -30, 0, 30, 54, 90, -90, 180]) {
      const fp = make({ softStopM: none, start: { x: 0, z: -4, yawDeg: yaw } });
      fp.hold('key', 1);
      // A stalled frame is the longest step: walking at it for a minute cannot tunnel through a wall.
      run(fp, 60_000, (f) => {
        expect(polygonContains(WALKABLE, { x: f.pose.x, z: f.pose.z }), `yaw ${yaw}`).toBe(true);
      });
    }
    // Into the right wall at 54 degrees: it runs along it to the far end rather than stopping on it.
    const slide = make({ softStopM: none, start: { x: 0, z: -4, yawDeg: 54 } });
    slide.hold('key', 1);
    run(slide, 50_000);
    expect(slide.pose.x).toBeCloseTo(1.25, 6);
    expect(slide.pose.z).toBeCloseTo(-19, 6);
  });

  it('turns a corner of the outline: from the lobby\u2019s side into the corridor, then along its wall', () => {
    const none = { x: 0, z: 0 };
    const fp = make({ softStopM: none, start: { x: 2, z: 5, yawDeg: -20 } });
    fp.hold('key', 1);
    let entered = false;
    run(fp, 60_000, (f) => {
      expect(polygonContains(WALKABLE, { x: f.pose.x, z: f.pose.z })).toBe(true);
      if (f.pose.z < 1.3) entered = true;
    });
    expect(entered).toBe(true);
    expect(fp.pose.z).toBeLessThan(-18.9);
  });

  it('slides along a wall instead of sticking to it, and comes to rest against the end', () => {
    const fp = make({ start: { x: 0, z: -5, yawDeg: 50 } });
    fp.hold('key', 1);
    run(fp, 6000);
    // Walking toward the right wall at an angle: it ends up against it and still moving down the corridor.
    expect(fp.pose.x).toBeGreaterThan(0.9);
    expect(fp.pose.x).toBeLessThanOrEqual(1.25 + 1e-9);
    expect(fp.pose.z).toBeLessThan(-8);
  });

  it('does not snap: no frame moves the visitor further than walking pace allows', () => {
    const fp = make({ start: { x: 1.2, z: -5, yawDeg: 54 } });
    fp.hold('key', 1);
    let last = { x: fp.pose.x, z: fp.pose.z };
    let worst = 0;
    run(fp, 20_000, (f) => {
      worst = Math.max(worst, Math.hypot(f.pose.x - last.x, f.pose.z - last.z));
      last = { x: f.pose.x, z: f.pose.z };
    });
    expect(worst).toBeLessThanOrEqual((SPINE_TIMING.walkMps * FRAME) / 1000 + 1e-6);
  });

  it('slows to a stop before the far end rather than hitting it', () => {
    const fp = make({ start: { x: 0, z: -15 } });
    fp.hold('key', 1);
    let fastestNearEnd = 0;
    run(fp, 12_000, (f) => {
      if (f.pose.z < -18.9) fastestNearEnd = Math.max(fastestNearEnd, f.speed);
    });
    expect(fastestNearEnd).toBeLessThan(0.2 * SPINE_TIMING.walkMps);
    expect(fp.pose.z).toBeGreaterThanOrEqual(-19);
  });

  it('walks forward from the lobby\u2019s back edge, where the starting view stands', () => {
    const fp = make({ start: { x: 0, z: 9.8, yawDeg: -10 } });
    fp.hold('key', 1);
    run(fp, 1500);
    expect(fp.pose.z).toBeLessThan(9.8 - 0.8);
    expect(fp.pose.x).toBeLessThan(-0.1);
    // Toward where it faces: the heading of the walk is the yaw.
    expect((Math.atan2(fp.pose.x, 9.8 - fp.pose.z) * 180) / Math.PI).toBeCloseTo(-10, 3);
  });

  it('walks backward, toward the lobby, still facing forward', () => {
    const fp = make({ start: { z: -5 } });
    fp.hold('key', -1);
    run(fp, 2000);
    expect(fp.pose.z).toBeGreaterThan(-5 + 1);
    expect(fp.pose.yawDeg).toBe(0);
  });

  it('keeps a glide on the floor: a target off it is brought onto it', () => {
    const fp = make();
    fp.glideTo({ x: 5, z: 5 });
    run(fp, 15_000);
    expect(polygonContains(WALKABLE, { x: fp.pose.x, z: fp.pose.z })).toBe(true);
    expect(fp.pose.x).toBeCloseTo(2.15, 2);
  });
});
