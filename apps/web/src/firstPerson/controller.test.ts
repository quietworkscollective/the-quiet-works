import { describe, expect, it } from 'vitest';
import { SPINE_TIMING } from '../timing.ts';
import type { Bounds } from './bounds.ts';
import { createFirstPerson, type FirstPerson, type FirstPersonConfig } from './controller.ts';

const FRAME = 1000 / 60;

/** Lobby (wide) opening into a corridor (narrow); the soft stop is at the corridor's far end. */
const BOUNDS: Bounds = [
  { minX: -2.15, maxX: 2.15, minZ: 1.35, maxZ: 6 },
  { minX: -1.25, maxX: 1.25, minZ: -19, maxZ: 1.6 },
];

function make(overrides: Partial<FirstPersonConfig> = {}): FirstPerson {
  return createFirstPerson({
    start: { x: 0, z: 0.2, yawDeg: 0, pitchDeg: 0 },
    bounds: BOUNDS,
    gates: [{ x: 0, z: 1.5 }],
    softStopM: { x: 0.3, z: 1.2 },
    ...overrides,
  });
}

/** Steps for `ms` at 60 fps; calls `each` after every frame. */
function run(fp: FirstPerson, ms: number, each?: (fp: FirstPerson, t: number) => void): void {
  let t = 0;
  while (t < ms - 1e-6) {
    const dt = Math.min(FRAME, ms - t);
    fp.step(dt);
    t += dt;
    each?.(fp, t);
  }
}

describe('walking', () => {
  it('accelerates to the walk speed over about 300 ms and never exceeds it', () => {
    const fp = make();
    fp.hold('key', 1);
    let peak = 0;
    const at: Record<number, number> = {};
    run(fp, 1000, (f, t) => {
      peak = Math.max(peak, f.speed);
      if (Math.abs(t - 100) < FRAME / 2 || Math.abs(t - 300) < FRAME / 2) at[Math.round(t / 100) * 100] = f.speed;
    });
    expect(peak).toBeLessThanOrEqual(SPINE_TIMING.walkMps + 1e-6);
    expect(fp.speed).toBeCloseTo(SPINE_TIMING.walkMps, 3);
    expect(at[100]).toBeGreaterThan(0.5 * SPINE_TIMING.walkMps);
    expect(at[100]).toBeLessThan(SPINE_TIMING.walkMps);
    expect(at[300]).toBeCloseTo(SPINE_TIMING.walkMps, 1);
  });

  it('starts from rest without a jump in speed', () => {
    const fp = make();
    fp.hold('key', 1);
    fp.step(FRAME);
    expect(fp.speed).toBeGreaterThan(0);
    expect(fp.speed).toBeLessThan(0.25 * SPINE_TIMING.walkMps);
  });

  it('comes to rest within the 180 ms stop, a few centimetres on', () => {
    const fp = make();
    fp.hold('key', 1);
    run(fp, 1500);
    const z = fp.pose.z;
    fp.hold('key', 0);
    run(fp, SPINE_TIMING.stopMs + FRAME);
    expect(fp.speed).toBe(0);
    expect(fp.active).toBe(false);
    const travelled = z - fp.pose.z;
    expect(travelled).toBeGreaterThan(0.02);
    expect(travelled).toBeLessThan(0.1);
  });

  it('walks toward where it faces, and backward on S', () => {
    const fp = make({ start: { x: 0, z: 0.2, yawDeg: 90, pitchDeg: 0 } });
    fp.hold('key', 1);
    run(fp, 400);
    expect(fp.pose.x).toBeGreaterThan(0.2);
    expect(fp.pose.z).toBeCloseTo(0.2, 6);
    fp.hold('key', -1);
    run(fp, 3000);
    expect(fp.pose.x).toBeLessThan(0);
  });

  it('turns at 75 degrees a second and keeps counting past a full circle', () => {
    const fp = make();
    fp.turn('key', 1);
    run(fp, 1000);
    const before = fp.pose.yawDeg;
    run(fp, 1000);
    expect(fp.pose.yawDeg - before).toBeCloseTo(SPINE_TIMING.turnDegPerS, 0);
    run(fp, 5000);
    expect(fp.pose.yawDeg).toBeGreaterThan(360);
    fp.turn('key', 0);
    run(fp, 400);
    expect(fp.active).toBe(false);
  });

  it('turning in place does not move the camera', () => {
    const fp = make();
    fp.turn('key', -1);
    run(fp, 2000);
    expect(fp.pose.x).toBe(0);
    expect(fp.pose.z).toBe(0.2);
    expect(fp.speed).toBe(0);
  });

  it('lets a key and a button share the forward hold without cancelling each other', () => {
    const fp = make();
    fp.hold('key', 1);
    fp.hold('button', 1);
    fp.hold('key', 0);
    run(fp, 600);
    expect(fp.speed).toBeCloseTo(SPINE_TIMING.walkMps, 2);
    fp.hold('button', 0);
    run(fp, 400);
    expect(fp.speed).toBe(0);
  });

  it('cancels opposite holds from two sources', () => {
    const fp = make({ start: { x: 0, z: -5, yawDeg: 0, pitchDeg: 0 } });
    fp.hold('key', 1);
    fp.hold('button', -1);
    run(fp, 1000);
    expect(fp.pose.z).toBe(-5);
    expect(fp.speed).toBe(0);
  });

  it('eases through zero when the direction reverses', () => {
    const fp = make({ start: { x: 0, z: -5, yawDeg: 0, pitchDeg: 0 } });
    fp.hold('key', 1);
    run(fp, 800);
    fp.hold('key', -1);
    let lastZ = fp.pose.z;
    let lastV = -SPINE_TIMING.walkMps;
    let worst = 0;
    run(fp, 1000, (f) => {
      const v = (f.pose.z - lastZ) / (FRAME / 1000);
      worst = Math.max(worst, Math.abs(v - lastV));
      lastZ = f.pose.z;
      lastV = v;
    });
    expect(worst).toBeLessThan(0.3);
    expect(lastV).toBeCloseTo(SPINE_TIMING.walkMps, 1);
  });
});

describe('bounds and the soft stop', () => {
  it('never leaves the walkable ground, however long a key is held', () => {
    const fp = make();
    fp.hold('key', 1);
    run(fp, 60_000);
    expect(fp.pose.z).toBeGreaterThanOrEqual(-19 - 1e-9);
    expect(fp.pose.z).toBeLessThan(-18.99);
    fp.hold('key', 0);
    fp.turn('key', 1);
    run(fp, 1200); // roughly a quarter turn to face +x
    fp.turn('key', 0);
    run(fp, 600);
    fp.hold('key', 1);
    run(fp, 20_000);
    expect(Math.abs(fp.pose.x)).toBeLessThanOrEqual(1.25 + 1e-9);
  });

  it('slows to a stop over the last 1.2 m instead of hitting the end', () => {
    const fp = make({ start: { x: 0, z: -15, yawDeg: 0, pitchDeg: 0 } });
    fp.hold('key', 1);
    const rows: { run: number; speed: number }[] = [];
    run(fp, 12_000, (f) => rows.push({ run: f.pose.z + 19, speed: f.speed }));
    const outside = rows.filter((r) => r.run > 1.2);
    const inside = rows.filter((r) => r.run <= 1.2);
    expect(Math.max(...outside.map((r) => r.speed))).toBeCloseTo(SPINE_TIMING.walkMps, 2);
    // Speed only falls once inside the soft-stop distance, and keeps falling.
    for (let i = 1; i < inside.length; i += 1)
      expect(inside[i]!.speed).toBeLessThanOrEqual(inside[i - 1]!.speed + 1e-6);
    expect(inside.find((r) => r.run < 0.6)!.speed).toBeLessThan(0.8 * SPINE_TIMING.walkMps);
    expect(inside.find((r) => r.run < 0.1)!.speed).toBeLessThan(0.2 * SPINE_TIMING.walkMps);
    expect(fp.pose.z + 19).toBeLessThan(0.01);
    expect(fp.pose.z + 19).toBeGreaterThanOrEqual(0);
  });

  it('slides along a wall instead of sticking to it', () => {
    const fp = make({ start: { x: 1.2, z: -5, yawDeg: 20, pitchDeg: 0 } });
    fp.hold('key', 1);
    run(fp, 3000);
    expect(fp.pose.x).toBeLessThanOrEqual(1.25 + 1e-9);
    expect(fp.pose.z).toBeLessThan(-6);
  });

  it('keeps a lobby visitor out of the corridor wall, and lets them through the opening', () => {
    const wide = make({ start: { x: 1.8, z: 4, yawDeg: 0, pitchDeg: 0 } });
    wide.hold('key', 1);
    run(wide, 10_000);
    expect(wide.pose.z).toBeGreaterThanOrEqual(1.35 - 1e-9);
    const centred = make({ start: { x: 0, z: 4, yawDeg: 0, pitchDeg: 0 } });
    centred.hold('key', 1);
    run(centred, 6000);
    expect(centred.pose.z).toBeLessThan(0);
  });

  it('allows walking back into the lobby, and stops at its far wall', () => {
    const fp = make();
    fp.hold('key', -1);
    run(fp, 30_000);
    expect(fp.pose.z).toBeLessThanOrEqual(6);
    expect(fp.pose.z).toBeGreaterThan(5.99);
  });

  it('cannot tunnel through a bound on a long frame', () => {
    const fp = make({ start: { x: 0, z: -18.9, yawDeg: 0, pitchDeg: 0 } });
    fp.hold('key', 1);
    for (let i = 0; i < 30; i += 1) fp.step(5000);
    expect(fp.pose.z).toBeGreaterThanOrEqual(-19);
  });
});

describe('a boundary with no soft stop', () => {
  it('is a hard stop that still slides along the wall and never lets the visitor out', () => {
    const fp = make({ softStopM: { x: 0, z: 0 }, start: { x: 1.2, z: -5, yawDeg: 20, pitchDeg: 0 } });
    fp.hold('key', 1);
    run(fp, 4000);
    expect(fp.pose.x).toBeLessThanOrEqual(1.25 + 1e-9);
    expect(fp.pose.z).toBeLessThan(-8);
    run(fp, 60_000);
    expect(fp.pose.z).toBeGreaterThanOrEqual(-19 - 1e-9);
    expect(Math.abs(fp.pose.x)).toBeLessThanOrEqual(1.25 + 1e-9);
  });

  it('keeps a lobby visitor off the corridor wall at the lobby end', () => {
    const fp = make({ softStopM: { x: 0, z: 0 }, start: { x: 1.8, z: 4, yawDeg: 0, pitchDeg: 0 } });
    fp.hold('key', 1);
    run(fp, 10_000);
    expect(fp.pose.z).toBeGreaterThanOrEqual(1.35 - 1e-9);
  });
});

describe('looking', () => {
  it('never moves the camera', () => {
    const fp = make();
    fp.look(37, 12);
    fp.look(-400, -50);
    fp.look(900, 90);
    expect(fp.pose.x).toBe(0);
    expect(fp.pose.z).toBe(0.2);
    run(fp, 500);
    expect(fp.pose.x).toBe(0);
    expect(fp.pose.z).toBe(0.2);
    expect(fp.active).toBe(false);
  });

  it('keeps yaw unlimited and pitch within plus or minus 25 degrees', () => {
    const fp = make();
    fp.look(1000, 90);
    expect(fp.pose.yawDeg).toBe(1000);
    expect(fp.pose.pitchDeg).toBe(25);
    fp.look(0, -200);
    expect(fp.pose.pitchDeg).toBe(-25);
  });

  it('does not change the speed of a walk that is under way', () => {
    const fp = make();
    fp.hold('key', 1);
    run(fp, 600);
    const before = fp.speed;
    fp.look(15, 5);
    fp.step(FRAME);
    expect(fp.speed).toBeCloseTo(before, 6);
  });
});

describe('wheel and swipe', () => {
  it('walks about 0.35 m for a notch, through the easing, and comes to rest', () => {
    const fp = make();
    const z0 = fp.pose.z;
    fp.nudge(0.35);
    let peak = 0;
    run(fp, 2000, (f) => (peak = Math.max(peak, f.speed)));
    expect(z0 - fp.pose.z).toBeGreaterThan(0.31);
    expect(z0 - fp.pose.z).toBeLessThan(0.39);
    expect(peak).toBeLessThanOrEqual(SPINE_TIMING.walkMps + 1e-6);
    expect(fp.active).toBe(false);
  });

  it('walks back for a negative nudge', () => {
    const fp = make();
    fp.nudge(-0.35);
    run(fp, 2000);
    expect(fp.pose.z).toBeGreaterThan(0.2 + 0.31);
  });

  it('never banks more than about a metre, so a flick does not carry on after the hand', () => {
    const fp = make({ start: { x: 0, z: 0, yawDeg: 0, pitchDeg: 0 } });
    for (let i = 0; i < 50; i += 1) fp.nudge(0.35);
    run(fp, 10_000);
    expect(-fp.pose.z).toBeLessThan(1.1);
    expect(-fp.pose.z).toBeGreaterThan(0.9);
  });

  it('turns around at once when the wheel reverses', () => {
    const fp = make({ start: { x: 0, z: -3, yawDeg: 0, pitchDeg: 0 } });
    fp.nudge(0.7);
    run(fp, 200);
    const atReverse = fp.pose.z;
    fp.nudge(-0.35);
    run(fp, 3000);
    // What was banked going forward is dropped: the visitor ends up behind where they turned.
    expect(fp.pose.z).toBeGreaterThan(atReverse);
  });

  it('gives up a nudge into a boundary rather than staying busy', () => {
    const fp = make({ start: { x: 0, z: -18.99, yawDeg: 0, pitchDeg: 0 } });
    fp.nudge(0.35);
    run(fp, 3000);
    expect(fp.active).toBe(false);
    expect(fp.pose.z).toBeGreaterThanOrEqual(-19);
  });
});

describe('glide', () => {
  const door = { x: 0.2, z: -5.4, yawDeg: 90, pitchDeg: -3 };

  it('arrives exactly at the target position and framing and reports it once', () => {
    const fp = make();
    let done = 0;
    fp.glideTo(door, { onDone: () => (done += 1) });
    run(fp, 20_000);
    expect(fp.gliding).toBe(false);
    expect(done).toBe(1);
    expect(fp.pose.x).toBeCloseTo(door.x, 9);
    expect(fp.pose.z).toBeCloseTo(door.z, 9);
    expect(fp.pose.yawDeg).toBeCloseTo(90, 9);
    expect(fp.pose.pitchDeg).toBeCloseTo(-3, 9);
    expect(fp.speed).toBe(0);
    expect(fp.active).toBe(false);
  });

  it('travels at the assisted 0.8 m/s, never faster, taking a settled few seconds for 5.6 m', () => {
    const fp = make();
    let peak = 0;
    let t = 0;
    fp.glideTo(door);
    run(fp, 20_000, (f, now) => {
      peak = Math.max(peak, f.speed);
      if (f.gliding) t = now;
    });
    expect(peak).toBeLessThanOrEqual(SPINE_TIMING.glideMps + 1e-6);
    expect(peak).toBeGreaterThan(0.75);
    expect(t).toBeGreaterThan((5.6 / 0.8) * 1000);
    expect(t).toBeLessThan(9500);
  });

  it('turns to the door on the way and frames it with at most 12 degrees in the last 350 ms', () => {
    const fp = make();
    fp.glideTo(door);
    const yaws: { t: number; yaw: number }[] = [];
    let end = 0;
    run(fp, 20_000, (f, t) => {
      yaws.push({ t, yaw: f.pose.yawDeg });
      if (f.gliding) end = t;
    });
    const last = yaws.filter((y) => y.t >= end - SPINE_TIMING.focusFramingMs);
    const span = Math.max(...last.map((y) => y.yaw)) - Math.min(...last.map((y) => y.yaw));
    expect(span).toBeLessThanOrEqual(SPINE_TIMING.focusMaxDeg + 0.01);
    expect(span).toBeGreaterThan(5);
    // The turn never overshoots the door and never reverses.
    for (let i = 1; i < yaws.length; i += 1) {
      expect(yaws[i]!.yaw).toBeGreaterThanOrEqual(yaws[i - 1]!.yaw - 1e-9);
      expect(yaws[i]!.yaw).toBeLessThanOrEqual(90 + 1e-9);
    }
    // And on its own the turn is calm: never faster than the glide's turn limit.
    for (let i = 1; i < yaws.length; i += 1)
      expect((yaws[i]!.yaw - yaws[i - 1]!.yaw) / (FRAME / 1000)).toBeLessThanOrEqual(60.5);
  });

  it('turns by the short way round', () => {
    const fp = make({ start: { x: 0, z: -3, yawDeg: 350, pitchDeg: 0 } });
    fp.glideTo({ x: 0.2, z: -5, yawDeg: 90 });
    run(fp, 20_000);
    expect(fp.pose.yawDeg).toBeCloseTo(450, 6);
  });

  it('leaves the view alone when the target names no direction', () => {
    const fp = make({ start: { x: 0, z: 0.2, yawDeg: 33, pitchDeg: 7 } });
    fp.glideTo({ x: 0.5, z: -4 });
    run(fp, 20_000);
    expect(fp.pose.yawDeg).toBe(33);
    expect(fp.pose.pitchDeg).toBe(7);
    expect(fp.pose.z).toBeCloseTo(-4, 9);
  });

  it('keeps its speed continuous when a new glide interrupts one', () => {
    const fp = make();
    fp.glideTo({ x: 0, z: -9 });
    run(fp, 2500);
    const before = fp.speed;
    expect(before).toBeGreaterThan(0.7);
    fp.glideTo({ x: 0.6, z: -12 });
    let last = before;
    let worst = 0;
    run(fp, 1500, (f) => {
      worst = Math.max(worst, Math.abs(f.speed - last));
      last = f.speed;
    });
    expect(worst).toBeLessThan(0.1);
  });

  it('is taken over by walking: the glide stops and its speed decays rather than stopping dead', () => {
    const fp = make();
    fp.glideTo(door);
    run(fp, 2500);
    const z = fp.pose.z;
    fp.hold('key', 1);
    expect(fp.gliding).toBe(false);
    fp.hold('key', 0);
    run(fp, 400);
    expect(fp.pose.z).toBeLessThan(z);
    expect(fp.speed).toBe(0);
  });

  it('lets the visitor look around while it travels, without snapping the view back', () => {
    const fp = make();
    fp.glideTo(door);
    run(fp, 1500);
    fp.look(-40, 0);
    const yaw = fp.pose.yawDeg;
    run(fp, 20_000);
    expect(fp.pose.z).toBeCloseTo(door.z, 9);
    expect(fp.pose.yawDeg).toBe(yaw);
  });

  it('routes through a gate when the straight line would cut a corner of the lobby', () => {
    const fp = make({ start: { x: 2, z: 4, yawDeg: 0, pitchDeg: 0 } });
    fp.glideTo({ x: 0.2, z: -3 });
    let worst = 0;
    run(fp, 20_000, (f) => {
      if (f.pose.z < 1.5 && f.pose.z > 1.35) worst = Math.max(worst, Math.abs(f.pose.x));
    });
    expect(worst).toBeLessThanOrEqual(1.25 + 1e-9);
    expect(fp.pose.z).toBeCloseTo(-3, 9);
  });

  it('takes one short step for a nearby target without lurching', () => {
    const fp = make();
    fp.glideTo({ x: 0, z: 0.1, yawDeg: 0 });
    let worst = 0;
    run(fp, 4000, (f) => (worst = Math.max(worst, f.speed)));
    expect(fp.gliding).toBe(false);
    expect(worst).toBeLessThan(0.45);
  });

  it('does nothing while locked', () => {
    const fp = make();
    fp.lock(true);
    fp.glideTo(door);
    expect(fp.gliding).toBe(false);
  });
});

describe('scripted advance', () => {
  it('covers the distance in the time given, from rest to rest, without exceeding 1.6 m/s', () => {
    const fp = make({ start: { x: 0.2, z: -5.4, yawDeg: 90, pitchDeg: 0 } });
    let done = 0;
    fp.advance({ x: 1, z: 0 }, 1.6, 1400, { onDone: () => (done += 1) });
    let peak = 0;
    let first = -1;
    let ended = 0;
    run(fp, 3000, (f, t) => {
      peak = Math.max(peak, f.speed);
      if (first < 0) first = f.speed;
      if (f.gliding) ended = t;
    });
    expect(done).toBe(1);
    expect(fp.pose.x).toBeCloseTo(1.8, 9);
    expect(fp.pose.z).toBe(-5.4);
    expect(ended + FRAME).toBeGreaterThan(1400 - 2 * FRAME);
    expect(ended).toBeLessThan(1400 + 2 * FRAME);
    expect(peak).toBeLessThan(1.6);
    expect(peak).toBeGreaterThan(1.14);
    expect(first).toBeLessThan(0.3);
    expect(fp.pose.yawDeg).toBe(90);
  });

  it('eases the pitch to a level view on the way when asked', () => {
    const fp = make({ start: { x: 0.2, z: -5.4, yawDeg: 90, pitchDeg: -14 } });
    fp.advance({ x: 1, z: 0 }, 1.6, 1400, { pitchDeg: 0 });
    let last = -14;
    run(fp, 3000, (f) => {
      expect(f.pose.pitchDeg).toBeGreaterThanOrEqual(last - 1e-9);
      last = f.pose.pitchDeg;
    });
    expect(fp.pose.pitchDeg).toBe(0);
    expect(fp.pose.yawDeg).toBe(90);
  });

  it('ignores input while it runs when locked', () => {
    const fp = make({ start: { x: 0.2, z: -5.4, yawDeg: 90, pitchDeg: 0 } });
    fp.lock(true);
    fp.advance({ x: 1, z: 0 }, 1.6, 1400);
    fp.hold('key', -1);
    fp.look(80, 0);
    run(fp, 3000);
    expect(fp.pose.x).toBeCloseTo(1.8, 9);
    expect(fp.pose.yawDeg).toBe(90);
  });
});

describe('a stalled frame', () => {
  it('never lurches a walk: one long step moves at most 50 ms of walking', () => {
    const fp = make();
    fp.hold('key', 1);
    run(fp, 600);
    const z = fp.pose.z;
    fp.step(2000);
    expect(z - fp.pose.z).toBeLessThan(SPINE_TIMING.walkMps * 0.05 + 1e-6);
  });

  it('keeps a scripted advance on the clock, so it stays in step with the sound cues', () => {
    const fp = make({ start: { x: 0.2, z: -5.4, yawDeg: 90, pitchDeg: 0 } });
    let done = 0;
    fp.advance({ x: 1, z: 0 }, 1.6, 1400, { onDone: () => (done += 1) });
    // A hitch of 300 ms in the middle of the walk, then ordinary frames to the 1.4 s mark.
    run(fp, 400);
    fp.step(300);
    run(fp, 1400 - 700);
    expect(done).toBe(1);
    expect(fp.pose.x).toBeCloseTo(1.8, 9);
  });
});

describe('reduced motion', () => {
  it('cuts instead of gliding, calling beforeCut first and onDone at once', () => {
    const calls: string[] = [];
    const fp = make({ reducedMotion: true, beforeCut: () => calls.push('cut') });
    fp.glideTo({ x: 0.2, z: -5.4, yawDeg: 90, pitchDeg: -3 }, { onDone: () => calls.push('done') });
    expect(calls).toEqual(['cut', 'done']);
    expect(fp.gliding).toBe(false);
    expect(fp.pose).toEqual({ x: 0.2, z: -5.4, yawDeg: 90, pitchDeg: -3 });
    expect(fp.active).toBe(false);
  });

  it('does not walk, turn or nudge, but still lets the visitor look', () => {
    const fp = make({ reducedMotion: true });
    fp.hold('key', 1);
    fp.turn('key', 1);
    fp.nudge(1);
    run(fp, 1000);
    expect(fp.pose).toEqual({ x: 0, z: 0.2, yawDeg: 0, pitchDeg: 0 });
    expect(fp.active).toBe(false);
    fp.look(20, 5);
    expect(fp.pose.yawDeg).toBe(20);
  });

  it('stops a walk in progress when reduced motion is switched on', () => {
    const fp = make();
    fp.hold('key', 1);
    run(fp, 600);
    fp.setReducedMotion(true);
    const z = fp.pose.z;
    run(fp, 600);
    expect(fp.pose.z).toBe(z);
    expect(fp.speed).toBe(0);
  });
});

describe('cutTo and setPose', () => {
  it('cutTo calls beforeCut, changes the view at once and stops all motion', () => {
    let cuts = 0;
    const fp = make({ beforeCut: () => (cuts += 1) });
    fp.hold('key', 1);
    run(fp, 500);
    fp.cutTo({ x: 0, z: -4, yawDeg: 90 });
    expect(cuts).toBe(1);
    expect(fp.pose.z).toBe(-4);
    expect(fp.pose.yawDeg).toBe(90);
    expect(fp.speed).toBe(0);
  });

  it('setPose is silent and clears motion', () => {
    let cuts = 0;
    const fp = make({ beforeCut: () => (cuts += 1) });
    fp.nudge(1);
    run(fp, 100);
    fp.setPose({ z: 4.5 });
    expect(cuts).toBe(0);
    expect(fp.pose.z).toBe(4.5);
    expect(fp.active).toBe(false);
  });
});
