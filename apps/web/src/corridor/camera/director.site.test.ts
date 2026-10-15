import { describe, expect, it } from 'vitest';
import { SITE_SCROLL, SPINE_TIMING } from '../../timing.ts';
import { ENTRANCE_KEYS, START_VIEW } from '../layout.ts';
import { entrancePose } from './entrance.ts';
import { FRAME, inCorridor, OFFICE, rig } from './testkit.ts';
import { doorFrame, HANDOVER_POSE, LANDING_POSE } from './viewpoints.ts';

/** ADR 0003: the hero's drift, the walk-in read over the page's scroll, engaging, and leaving. */

const at = (t: number) => t * SITE_SCROLL.handoverAt;
const PERIOD_MS = SITE_SCROLL.ambient.periodS * 1000;

describe('hero drift', () => {
  /** Steps the hero for `ms`, recording every frame's pose. */
  function drift(ms: number, options: Parameters<typeof rig>[0] = {}) {
    const r = rig(options);
    const samples: { t: number; x: number; z: number; yaw: number; pitch: number }[] = [];
    let t = 0;
    while (t < ms) {
      r.d.step(FRAME);
      t += FRAME;
      samples.push({ t, x: r.d.pose.x, z: r.d.pose.z, yaw: r.d.pose.yawDeg, pitch: r.d.pose.pitchDeg });
    }
    return { r, samples };
  }

  it('is one lateral arc of 4 cm over 40 s: sinusoidal, and back where it began', () => {
    const { samples } = drift(PERIOD_MS + 200);
    const peak = Math.max(...samples.map((s) => Math.abs(s.x)));
    expect(peak).toBeLessThanOrEqual(0.04 + 1e-9);
    expect(peak).toBeGreaterThan(0.0395);
    for (const s of samples) {
      // The followers trail a moving target by a fraction of a millimetre.
      expect(Math.abs(s.x - 0.04 * Math.sin((2 * Math.PI * s.t) / PERIOD_MS))).toBeLessThan(6e-4);
    }
    const near = (ms: number) => samples.reduce((a, b) => (Math.abs(b.t - ms) < Math.abs(a.t - ms) ? b : a));
    expect(near(10_000).x).toBeGreaterThan(0.039);
    expect(near(20_000).x).toBeCloseTo(0, 2);
    expect(near(30_000).x).toBeLessThan(-0.039);
    expect(near(40_000).x).toBeCloseTo(0, 2);
  });

  it('starts exactly at the authored hero view', () => {
    const r = rig();
    expect(r.d.pose).toEqual(LANDING_POSE);
    r.d.step(FRAME);
    // One frame's worth of the arc (0.1 mm), no more.
    expect(Math.abs(r.d.pose.x)).toBeLessThan(2e-4);
    expect(r.d.pose.z).toBe(LANDING_POSE.z);
  });

  it('never creeps forward, rises or falls, rolls, or turns more than 0.3 degrees', () => {
    const { samples } = drift(PERIOD_MS);
    for (const s of samples) {
      expect(s.z).toBe(LANDING_POSE.z);
      expect(s.pitch).toBe(0);
      expect(Math.abs(s.yaw)).toBeLessThanOrEqual(0.3);
    }
    // And the yaw does correct: it is not simply zero.
    expect(Math.max(...samples.map((s) => Math.abs(s.yaw)))).toBeGreaterThan(0.2);
  });

  it('asks only for drift frames while it runs, so the shell can draw them at its own cadence', () => {
    const r = rig();
    expect(r.d.step(FRAME)).toBe(true);
    expect(r.d.ambientOnly).toBe(true);
    for (let i = 0; i < 100; i += 1) {
      r.d.step(FRAME);
      expect(r.d.ambientOnly).toBe(true);
    }
  });

  it('is not applied under reduced motion: one static hero view, no frames at all', () => {
    const r = rig({ reduced: true });
    r.run(60_000);
    expect(r.d.pose).toEqual(LANDING_POSE);
    expect(r.d.step(FRAME)).toBe(false);
    expect(r.d.ambientOnly).toBe(false);
  });

  it('only advances while frames are drawn: the arc is where it was left when drawing resumes', () => {
    const r = rig();
    r.run(10_000);
    const before = r.d.pose.x;
    // A long time passes with no frame (the page scrolled away, the tab hidden)...
    // ...and the first frame back moves the arc by one frame, not by the wait.
    r.d.step(FRAME);
    expect(Math.abs(r.d.pose.x - before)).toBeLessThan(0.001);
  });

  it('blends back to the authored walk-in pose over the first 10% of scroll', () => {
    const half = rig();
    half.progress.set(SITE_SCROLL.driftBlendOut / 2);
    // A quarter period in, at the arc's crest, half the drift is applied.
    half.run(PERIOD_MS / 4);
    expect(half.d.pose.x).toBeGreaterThan(0.0185);
    expect(half.d.pose.x).toBeLessThan(0.0215);

    const done = rig();
    done.progress.set(SITE_SCROLL.driftBlendOut);
    done.run(PERIOD_MS / 4);
    const authored = entrancePose(SITE_SCROLL.driftBlendOut / SITE_SCROLL.handoverAt, false);
    expect(done.d.pose.x).toBe(authored.x);
    expect(done.d.pose.yawDeg).toBeCloseTo(authored.yawDeg, 6);
    expect(done.d.ambientOnly).toBe(false);
    expect(done.d.step(FRAME)).toBe(false);
  });

  it('lands on the authored pose exactly once scrolled past the blend, and idles there', () => {
    const r = rig();
    r.run(10_000); // the arc at its crest
    expect(r.d.pose.x).toBeGreaterThan(0.039);
    r.progress.set(at(0.3));
    r.settle();
    expect(r.d.pose.x).toBe(0);
    expect(r.d.pose.z).toBeCloseTo(entrancePose(0.3, false).z, 4);
    for (let i = 0; i < 30; i += 1) expect(r.d.step(FRAME)).toBe(false);
  });

  it('never jumps as the first scroll takes the drift out: no frame moves it more than a few millimetres', () => {
    const r = rig();
    r.run(10_000);
    let lastX = r.d.pose.x;
    let lastYaw = r.d.pose.yawDeg;
    let worstX = 0;
    let worstYaw = 0;
    for (let i = 1; i <= 90; i += 1) {
      r.progress.set((i / 90) * SITE_SCROLL.driftBlendOut);
      r.d.step(FRAME);
      worstX = Math.max(worstX, Math.abs(r.d.pose.x - lastX));
      worstYaw = Math.max(worstYaw, Math.abs(r.d.pose.yawDeg - lastYaw));
      lastX = r.d.pose.x;
      lastYaw = r.d.pose.yawDeg;
    }
    expect(worstX).toBeLessThan(0.004);
    expect(worstYaw).toBeLessThan(0.05);
  });

  it('comes back when the scroll returns to the top, from the authored pose', () => {
    const r = rig();
    r.progress.set(at(0.5));
    r.settle();
    r.progress.set(0);
    r.settle();
    expect(r.d.ambientOnly).toBe(true);
    r.run(PERIOD_MS / 4);
    expect(r.d.pose.x).toBeGreaterThan(0.039);
  });
});

describe('the walk-in over the page scroll', () => {
  it('reaches the hand-over at 65% of the run, behind the veil, still in the entrance', () => {
    const r = rig();
    r.progress.set(SITE_SCROLL.handoverAt);
    r.settle();
    expect(r.spine.getState().phase).toBe('entrance');
    expect(r.d.pose).toEqual(HANDOVER_POSE);
  });

  it('is still on its way at 50%, and exactly on the authored path at every key', () => {
    const r = rig();
    r.progress.set(0.5);
    r.settle();
    expect(r.d.pose.z).toBeGreaterThan(START_VIEW.desktop.z + 0.05);
    for (const key of ENTRANCE_KEYS) {
      r.progress.set(at(key.t));
      r.settle();
      expect(r.d.pose.z).toBeCloseTo(entrancePose(key.t, false).z, 4);
    }
  });

  it('holds the hand-over while the veil clears, from 65% to the end of the run', () => {
    const r = rig();
    for (const p of [0.65, 0.7, 0.8, 0.9, 1]) {
      r.progress.set(p);
      r.settle();
      expect(r.d.pose).toEqual(HANDOVER_POSE);
    }
  });

  it('settles at once, with no glide, when the page hands over from beyond 65%', () => {
    const r = rig({ progress: at(0.9) });
    r.run(500);
    r.progress.set(0.8);
    r.spine.dispatch({ type: 'ENTRANCE_DONE' });
    expect(r.d.controller.gliding).toBe(false);
    r.settle();
    expect(r.d.pose).toEqual(HANDOVER_POSE);
  });

  it('walks in at walking pace when the page hands over from short of the hand-over (the skip)', () => {
    const r = rig({ progress: 0.2 });
    r.run(100);
    // The page engages the window the moment the visitor is in the corridor.
    r.d.setEngaged(true);
    r.spine.dispatch({ type: 'ENTRANCE_DONE' });
    expect(r.d.controller.gliding).toBe(true);
    let peak = 0;
    for (let i = 0; i < 600 && r.d.step(FRAME); i += 1) peak = Math.max(peak, r.d.controller.speed);
    expect(peak).toBeLessThanOrEqual(SPINE_TIMING.walkMps + 1e-6);
    expect(r.d.pose).toEqual(HANDOVER_POSE);
  });
});

describe('who owns the input', () => {
  it("is the page's through the hero and the smoke, whether or not anything asks to engage", () => {
    const r = rig();
    expect(r.d.inputMode()).toBe('page');
    r.d.setEngaged(true);
    expect(r.d.inputMode()).toBe('page');
  });

  it("is look-only at rest in the corridor, and the window's once engaged", () => {
    const r = inCorridor();
    r.settle();
    expect(r.d.inputMode()).toBe('look');
    r.d.setEngaged(true);
    expect(r.d.inputMode()).toBe('engaged');
    r.d.setEngaged(false);
    expect(r.d.inputMode()).toBe('look');
  });

  it('holds the wheel, taking nothing else, while engaged and a door opens or a dialog covers the scene', () => {
    const r = inCorridor();
    r.settle();
    r.d.setEngaged(true);
    r.spine.dispatch({ type: 'OPEN_BOARD' });
    expect(r.d.inputMode()).toBe('held');
    r.spine.dispatch({ type: 'CLOSE_BOARD' });
    expect(r.d.inputMode()).toBe('engaged');
    r.spine.dispatch({ type: 'FOCUS_DOOR', id: OFFICE });
    r.settle();
    r.spine.dispatch({ type: 'OPEN_DOOR', id: OFFICE, via: 'door' });
    expect(r.d.inputMode()).toBe('held');
  });

  it('leaves the page its input when a dialog opens over a resting window', () => {
    const r = inCorridor();
    r.settle();
    r.spine.dispatch({ type: 'OPEN_PAGE', page: 'about' });
    expect(r.d.inputMode()).toBe('page');
  });

  it('lets go of a held key when the visitor leaves the window: it does not keep walking', () => {
    const r = inCorridor();
    r.settle();
    r.d.setEngaged(true);
    r.d.controller.hold('key', 1);
    r.run(800);
    expect(r.d.controller.speed).toBeGreaterThan(1);
    r.d.setEngaged(false);
    r.run(SPINE_TIMING.stopMs + 2 * FRAME);
    expect(r.d.controller.speed).toBe(0);
    const z = r.d.pose.z;
    r.run(1000);
    expect(r.d.pose.z).toBe(z);
    expect(r.d.step(FRAME)).toBe(false);
  });

  it('drops banked wheel travel on leaving, too', () => {
    const r = inCorridor();
    r.settle();
    r.d.setEngaged(true);
    r.d.controller.nudge(1);
    r.run(100);
    r.d.setEngaged(false);
    r.settle();
    expect(START_VIEW.desktop.z - r.d.pose.z).toBeLessThan(0.5);
  });

  it('keeps the scene as it was when the window is left: the view stays where the visitor put it', () => {
    const r = inCorridor();
    r.settle();
    r.d.setEngaged(true);
    const { yawDeg, pitchDeg } = r.d.pose;
    r.d.controller.look(30, 10);
    r.d.setEngaged(false);
    r.run(500);
    expect(r.d.pose.yawDeg).toBe(yawDeg + 30);
    expect(r.d.pose.pitchDeg).toBe(pitchDeg + 10);
  });
});

describe('scrolling back up over a hand-over nobody has touched', () => {
  it('walks the camera out through the smoke and back to the same exact pose', () => {
    const r = inCorridor();
    r.settle();
    r.progress.set(at(0.5));
    r.settle();
    expect(r.d.inputMode()).toBe('page');
    expect(r.d.pose.z).toBeCloseTo(entrancePose(0.5, false).z, 3);
    r.progress.set(1);
    r.settle();
    expect(r.d.pose).toEqual(HANDOVER_POSE);
    expect(r.d.inputMode()).toBe('look');
  });

  it('reaches the hero and drifts there, then returns to the exact hand-over', () => {
    const r = inCorridor();
    r.settle();
    r.progress.set(0);
    r.settle();
    expect(r.d.pose.z).toBeCloseTo(LANDING_POSE.z, 3);
    expect(r.d.ambientOnly).toBe(true);
    r.progress.set(1);
    r.settle();
    expect(r.d.pose).toEqual(HANDOVER_POSE);
  });

  it('does not take the camera from a visitor who has engaged the window', () => {
    const r = inCorridor();
    r.settle();
    r.d.setEngaged(true);
    r.progress.set(0);
    r.run(2000);
    expect(r.d.pose).toEqual(HANDOVER_POSE);
  });

  it('does not take the camera from a visitor who has walked somewhere, or stands at a door', () => {
    const walked = inCorridor();
    walked.settle();
    walked.d.setEngaged(true);
    walked.d.controller.hold('key', 1);
    walked.run(1500);
    walked.d.controller.hold('key', 0);
    walked.d.setEngaged(false);
    walked.settle();
    const z = walked.d.pose.z;
    walked.progress.set(0);
    walked.run(2000);
    expect(walked.d.pose.z).toBe(z);

    const door = inCorridor();
    door.settle();
    door.spine.dispatch({ type: 'FOCUS_DOOR', id: OFFICE });
    door.settle();
    door.progress.set(0);
    door.run(2000);
    const frame = doorFrame(OFFICE);
    expect(door.d.pose.x).toBe(frame.x);
    expect(door.d.pose.z).toBe(frame.z);
  });
});

describe('reduced motion over the page scroll', () => {
  it('is two static views, cut over behind the full veil, with no travel and no drift', () => {
    const r = rig({ reduced: true });
    r.progress.set(0.3);
    r.run(500);
    expect(r.d.pose).toEqual(LANDING_POSE);
    expect(r.log.cuts).toBe(0);
    r.progress.set(SITE_SCROLL.handoverAt);
    r.run(FRAME);
    expect(r.d.pose).toEqual(HANDOVER_POSE);
    expect(r.log.cuts).toBe(1);
    r.progress.set(1);
    r.run(500);
    expect(r.log.cuts).toBe(1);
    r.progress.set(0.2);
    r.run(FRAME);
    expect(r.d.pose).toEqual(LANDING_POSE);
    expect(r.log.cuts).toBe(2);
    expect(r.d.step(FRAME)).toBe(false);
  });
});
