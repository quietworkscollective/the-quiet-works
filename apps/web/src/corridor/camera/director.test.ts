import { CHAMBERS, createSpineStore, spineInitial, type ChamberId } from '@tqw/engine';
import { describe, expect, it } from 'vitest';
import { SITE_SCROLL, SPINE_TIMING } from '../../timing.ts';
import { createCorridorAnimation } from '../animation.ts';
import { createProgress } from '../progress.ts';
import { CHAMBER_SLOTS, CORRIDOR, ENTRANCE_KEYS, HANDOVER, HANDOVER_PORTRAIT_TURN_DEG } from '../layout.ts';
import { createDirector } from './director.ts';
import { CLOSE_HOLD_MS, closingAt, ENTRY_START_MS, openingAt, SWING_START_MS } from './doorMotion.ts';
import { entranceYaw, entranceZ } from './entrance.ts';
import { doorFrame, HANDOVER_POSE, LANDING_POSE } from './viewpoints.ts';
import { FRAME, inCorridor, OFFICE, rig, type Rig } from './testkit.ts';

const IDS = CHAMBERS.map((c) => c.id);
/** The page's scroll progress at which the walk-in is `t` of the way along its authored path. */
const at = (t: number) => t * SITE_SCROLL.handoverAt;

describe('landing walk-in', () => {
  it('starts at the landing view: eye height, looking down the axis, no yaw', () => {
    const r = rig();
    expect(r.d.pose).toEqual(LANDING_POSE);
    expect(LANDING_POSE.z).toBe(ENTRANCE_KEYS[0]!.z);
    expect(r.d.pose.yawDeg).toBe(0);
  });

  it('follows scroll progress along the entrance keys, read at progress / handoverAt, and walks back', () => {
    const r = rig();
    for (const key of ENTRANCE_KEYS) {
      r.progress.set(at(key.t));
      r.settle();
      expect(r.d.pose.z).toBeCloseTo(key.z, 4);
      // The hero drift is the only sideways movement, and it is under 4 cm.
      expect(Math.abs(r.d.pose.x)).toBeLessThanOrEqual(0.04);
      expect(Math.abs(r.d.pose.yawDeg)).toBeLessThanOrEqual(0.3);
    }
    r.progress.set(at(0.16));
    r.settle();
    expect(r.d.pose.z).toBeCloseTo(5.0, 4);
  });

  it('smooths scroll by at most 120 ms and has no automatic travel', () => {
    const r = rig();
    r.progress.set(at(0.6));
    const start = r.d.pose.z;
    const target = entranceZ(0.6);
    r.run(120);
    expect(start - r.d.pose.z).toBeGreaterThan(0.94 * (start - target));
    r.settle();
    const rested = r.d.pose.z;
    r.run(2000);
    expect(r.d.pose.z).toBe(rested);
  });

  it('asks for no frames once the scroll has settled', () => {
    const r = rig();
    r.progress.set(0.5);
    expect(r.settle()).toBeLessThan(600);
    expect(r.d.step(FRAME)).toBe(false);
  });

  it('hands over at progress 1 exactly at the hand-over pose, with no jump or turn', () => {
    const r = rig();
    for (let i = 1; i <= 30; i += 1) {
      r.progress.set(i / 30);
      r.run(FRAME);
    }
    r.settle();
    const before = { ...r.d.pose };
    expect(before.z).toBe(HANDOVER.z);
    r.spine.dispatch({ type: 'ENTRANCE_DONE' });
    expect(r.d.pose).toEqual(before);
    r.run(1000);
    expect(r.d.pose).toEqual(HANDOVER_POSE);
    expect(r.d.pose.z).toBe(HANDOVER.z);
    expect(r.d.pose.yawDeg).toBe(0);
    expect(r.d.pose.pitchDeg).toBe(0);
    expect(r.d.controller.speed).toBe(0);
  });

  it('settles onto the hand-over through the scroll smoothing when the scroll jumps to the end', () => {
    const r = rig();
    r.progress.set(0.5);
    r.run(500);
    r.progress.set(1);
    r.spine.dispatch({ type: 'ENTRANCE_DONE' });
    expect(r.d.controller.gliding).toBe(false);
    const start = r.d.pose.z;
    r.run(120);
    expect(start - r.d.pose.z).toBeGreaterThan(0.94 * (start - HANDOVER.z));
    r.settle();
    expect(r.d.pose).toEqual(HANDOVER_POSE);
  });

  it('takes input as soon as the hand-over settle is nearly done: the wheel that carried the scroll in keeps walking', () => {
    const r = rig({ progress: at(0.64) });
    r.run(500);
    r.progress.set(1);
    r.spine.dispatch({ type: 'ENTRANCE_DONE' });
    r.run(FRAME);
    expect(r.d.inputEnabled()).toBe(false);
    r.run(150);
    expect(r.d.inputEnabled()).toBe(true);
    const before = r.d.pose.z;
    r.d.controller.nudge(0.35);
    r.settle();
    expect(before - r.d.pose.z).toBeGreaterThan(0.3);
    expect(before - r.d.pose.z).toBeLessThan(0.4);
  });

  it('walks in at walking pace when "Enter" skips the scroll, and a key press takes over at once', () => {
    const r = rig({ progress: 0.2 });
    r.run(100);
    r.spine.dispatch({ type: 'ENTRANCE_DONE' });
    let peak = 0;
    let t = 0;
    while (r.d.step(FRAME) && t < 30_000) {
      t += FRAME;
      peak = Math.max(peak, r.d.controller.speed);
    }
    expect(peak).toBeLessThanOrEqual(SPINE_TIMING.walkMps + 1e-6);
    expect(peak).toBeGreaterThan(SPINE_TIMING.glideMps);
    expect(r.d.pose).toEqual(HANDOVER_POSE);
    expect(t).toBeGreaterThan(2500);
    expect(t).toBeLessThan(5500);
  });

  it('lets the visitor take over a skipped entrance by walking', () => {
    const r = rig({ progress: 0.2 });
    r.run(100);
    r.spine.dispatch({ type: 'ENTRANCE_DONE' });
    r.run(1500);
    expect(r.d.controller.gliding).toBe(true);
    // The visitor is in the corridor already, so their input is theirs.
    expect(r.d.inputEnabled()).toBe(true);
    r.d.controller.hold('key', 1);
    expect(r.d.controller.gliding).toBe(false);
  });

  it('reports the footstep speed while scrolling walks, and 0 when it stops', () => {
    const r = rig();
    for (let i = 1; i <= 10; i += 1) {
      r.progress.set(0.3 + i * 0.02);
      r.run(FRAME);
    }
    r.settle();
    expect(Math.max(...r.log.walk)).toBeGreaterThan(0.1);
    expect(r.log.walk.at(-1)).toBe(0);
  });

  it('takes no input until the hand-over, and shows a static landing view under reduced motion', () => {
    const r = rig();
    expect(r.d.inputEnabled()).toBe(false);
    const q = rig({ reduced: true });
    q.progress.set(0.5);
    q.run(500);
    expect(q.d.pose).toEqual(LANDING_POSE);
    q.progress.set(1);
    q.spine.dispatch({ type: 'ENTRANCE_DONE' });
    expect(q.d.pose).toEqual(HANDOVER_POSE);
    expect(q.log.cuts).toBe(1);
    expect(q.d.step(FRAME)).toBe(false);
  });
});

describe('portrait hand-over', () => {
  const TURN = HANDOVER_PORTRAIT_TURN_DEG;
  /** Spelled out, so these tests do not lean on the function under test. */
  const TURNED = { x: 0, z: 0.2, yawDeg: 12, pitchDeg: 0 };

  it('keeps the landing view straight until the settle beat, then turns toward +x as progress reaches 1', () => {
    const r = rig({ portrait: true });
    for (const t of [0.25, 0.5, 0.75, 0.9]) {
      r.progress.set(at(t));
      r.settle();
      expect(r.d.pose.yawDeg).toBeCloseTo(0, 9);
    }
    r.progress.set(at(0.95));
    r.settle();
    expect(r.d.pose.yawDeg).toBeCloseTo(entranceYaw(0.95, TURN), 6);
    expect(r.d.pose.yawDeg).toBeGreaterThan(TURN / 2);
    r.progress.set(at(1));
    r.settle();
    expect(r.d.pose.yawDeg).toBeCloseTo(TURN, 9);
    // Back through the beat: the view turns back, no one-way door.
    r.progress.set(at(0.5));
    r.settle();
    expect(r.d.pose.yawDeg).toBe(0);
  });

  it('smooths the turn like the walk: 95% of a step within 120 ms, never past the limit', () => {
    const r = rig({ portrait: true, progress: at(0.9) });
    r.settle();
    r.progress.set(1);
    r.run(120);
    expect(r.d.pose.yawDeg).toBeGreaterThan(0.94 * TURN);
    r.run(2000, () => expect(r.d.pose.yawDeg).toBeLessThanOrEqual(TURN + 1e-9));
  });

  it('lands on the turned hand-over pose exactly, with no jump in position or yaw', () => {
    const r = rig({ portrait: true });
    let last = { ...r.d.pose };
    let worstYaw = 0;
    for (let i = 1; i <= 60; i += 1) {
      r.progress.set(i / 60);
      r.run(FRAME);
      worstYaw = Math.max(worstYaw, Math.abs(r.d.pose.yawDeg - last.yawDeg));
      last = { ...r.d.pose };
    }
    r.settle();
    r.spine.dispatch({ type: 'ENTRANCE_DONE' });
    expect(r.d.pose.yawDeg).toBe(TURN);
    // The hand-over settle holds the turned yaw the whole way: no dip back to straight and no snap at the end.
    r.run(1000, () => expect(r.d.pose.yawDeg).toBeCloseTo(TURN, 6));
    expect(r.d.pose).toEqual(TURNED);
    // A fast scroll (the whole beat in 6 frames) turns at most a few degrees a frame.
    expect(worstYaw).toBeLessThan(5);
  });

  it('is unchanged in landscape: the hand-over stays at yaw 0 and the walk-in never turns', () => {
    const r = rig();
    for (const t of [0.5, 0.9, 0.95, 1]) {
      r.progress.set(at(t));
      r.settle();
      expect(r.d.pose.yawDeg).toBe(0);
    }
    r.spine.dispatch({ type: 'ENTRANCE_DONE' });
    r.settle();
    expect(r.d.pose).toEqual(HANDOVER_POSE);
  });

  it('starts free walking from the turned yaw: forward walks along the turned heading', () => {
    const r = inCorridor({ portrait: true });
    r.settle();
    expect(r.d.pose.yawDeg).toBe(TURN);
    r.d.controller.hold('key', 1);
    r.run(1500);
    r.d.controller.hold('key', 0);
    r.settle();
    const { x, z, yawDeg } = r.d.pose;
    expect(yawDeg).toBe(TURN);
    const along = Math.hypot(x - HANDOVER.x, z - HANDOVER.z);
    expect(x).toBeGreaterThan(0.2);
    expect(Math.atan2(x - HANDOVER.x, HANDOVER.z - z) * (180 / Math.PI)).toBeCloseTo(TURN, 3);
    expect(along).toBeGreaterThan(1);
  });

  it('a skipped entrance walks in and ends on the turned hand-over pose', () => {
    const r = rig({ portrait: true, progress: 0.2 });
    r.run(100);
    r.spine.dispatch({ type: 'ENTRANCE_DONE' });
    r.settle();
    expect(r.d.pose).toEqual(TURNED);
  });

  it('a corridor that opens without a walk-in (retrying the 3D view) starts on the turned hand-over', () => {
    const r = inCorridor({ portrait: true });
    expect(r.d.pose).toEqual(TURNED);
  });

  it('under reduced motion the landing view is straight and the static hand-over view is the turned one', () => {
    const r = rig({ portrait: true, reduced: true });
    r.progress.set(at(0.9));
    r.run(500);
    expect(r.d.pose).toEqual(LANDING_POSE);
    r.progress.set(at(1));
    r.run(FRAME);
    expect(r.d.pose).toEqual(TURNED);
    expect(r.log.cuts).toBe(1);
    r.spine.dispatch({ type: 'ENTRANCE_DONE' });
    expect(r.d.pose).toEqual(TURNED);
    // Already showing the hand-over view: handing over cuts nothing more.
    expect(r.log.cuts).toBe(1);
    // Stepping to a door and back returns to the turned view, not the straight one.
    r.d.stepViewpoint(1);
    expect(r.d.pose.yawDeg).toBe(90);
    r.d.stepViewpoint(-1);
    expect(r.d.pose).toEqual(TURNED);
  });

  it('switching reduced motion on mid-corridor in portrait cuts to the turned hand-over view', () => {
    const r = inCorridor({ portrait: true });
    r.settle();
    r.d.controller.hold('key', 1);
    r.run(600);
    r.d.setReducedMotion(true);
    expect(r.d.pose).toEqual(TURNED);
  });

  it('follows the screen turning: the straight or turned view is decided by the screen at the time', () => {
    let portrait = false;
    const spine = createSpineStore(spineInitial({ kind: 'home' }));
    const progress = createProgress(0);
    const d = createDirector({
      spine,
      progress,
      animation: createCorridorAnimation(IDS),
      reducedMotion: false,
      portrait: () => portrait,
      onSeam: () => {},
      onWalk: () => {},
      onDoorIntent: () => {},
      requestFrame: () => {},
    });
    progress.set(1);
    for (let i = 0; i < 40; i += 1) d.step(FRAME);
    expect(d.pose.yawDeg).toBe(0);
    portrait = true;
    for (let i = 0; i < 40; i += 1) d.step(FRAME);
    expect(d.pose.yawDeg).toBeCloseTo(TURN, 9);
  });
});

describe('free walking', () => {
  it('walks and reports footstep speed through onWalk, 0 when still', () => {
    const r = inCorridor();
    r.settle();
    expect(r.d.inputEnabled()).toBe(true);
    r.d.controller.hold('key', 1);
    r.run(800);
    expect(Math.max(...r.log.walk)).toBeCloseTo(SPINE_TIMING.walkMps, 1);
    r.d.controller.hold('key', 0);
    r.settle();
    expect(r.log.walk.at(-1)).toBe(0);
    expect(r.d.pose.z).toBeLessThan(HANDOVER.z - 0.5);
  });

  it('is off while the board or a page covers the scene', () => {
    const r = inCorridor();
    r.settle();
    r.spine.dispatch({ type: 'OPEN_BOARD' });
    expect(r.d.inputEnabled()).toBe(false);
    r.spine.dispatch({ type: 'CLOSE_BOARD' });
    expect(r.d.inputEnabled()).toBe(true);
    r.spine.dispatch({ type: 'OPEN_PAGE', page: 'about' });
    expect(r.d.inputEnabled()).toBe(false);
  });

  it('asks for no frames when idle', () => {
    const r = inCorridor();
    r.settle();
    for (let i = 0; i < 60; i += 1) expect(r.d.step(FRAME)).toBe(false);
  });
});

describe('door focus', () => {
  it('glides to frame the door, 1.4 m away and facing it, and lifts its attention', () => {
    const r = inCorridor();
    r.settle();
    r.spine.dispatch({ type: 'FOCUS_DOOR', id: OFFICE });
    expect(r.log.intents).toEqual([OFFICE]);
    expect(r.d.controller.gliding).toBe(true);
    r.settle();
    const frame = doorFrame(OFFICE);
    expect(r.d.pose).toEqual({ x: frame.x, z: frame.z, yawDeg: frame.yawDeg, pitchDeg: frame.pitchDeg });
    const slot = CHAMBER_SLOTS[0]!;
    expect(CORRIDOR.width / 2 - r.d.pose.x).toBeCloseTo(SPINE_TIMING.focusDistanceM, 9);
    expect(r.d.pose.z).toBe(slot.z);
    expect(r.animation[OFFICE].attention).toBe(1);
  });

  it('retargets the one glide when focus moves on, without restarting from rest', () => {
    const r = inCorridor();
    r.settle();
    r.spine.dispatch({ type: 'FOCUS_DOOR', id: OFFICE });
    r.run(2500);
    const speed = r.d.controller.speed;
    r.spine.dispatch({ type: 'FOCUS_DOOR', id: 'apartment' });
    let worst = 0;
    let last = speed;
    r.run(1000, () => {
      worst = Math.max(worst, Math.abs(r.d.controller.speed - last));
      last = r.d.controller.speed;
    });
    expect(worst).toBeLessThan(0.1);
    r.settle();
    expect(r.d.pose.z).toBe(doorFrame('apartment').z);
    expect(r.animation[OFFICE].attention).toBe(0);
    expect(r.animation.apartment.attention).toBe(1);
  });

  it('a click on an unfocused door focuses it and glides; the second click opens it', () => {
    const r = inCorridor();
    r.settle();
    r.d.clickDoor(OFFICE);
    expect(r.spine.getState().focus).toBe(OFFICE);
    expect(r.d.controller.gliding).toBe(true);
    r.settle();
    r.d.clickDoor(OFFICE);
    expect(r.spine.getState().phase).toBe('threshold');
    expect(r.spine.getState().chamber).toBe(OFFICE);
  });

  it('opens on a second click even before the glide has arrived', () => {
    const r = inCorridor();
    r.settle();
    r.d.clickDoor(OFFICE);
    r.run(1500);
    r.d.clickDoor(OFFICE);
    expect(r.spine.getState().phase).toBe('threshold');
  });

  it('a click after the visitor has walked away goes back to the door instead of opening it', () => {
    const r = inCorridor();
    r.settle();
    r.d.clickDoor(OFFICE);
    r.settle();
    r.d.controller.hold('key', -1);
    r.run(1500);
    r.d.controller.hold('key', 0);
    r.settle();
    r.d.clickDoor(OFFICE);
    expect(r.spine.getState().phase).toBe('corridor');
    expect(r.d.controller.gliding).toBe(true);
    r.settle();
    r.d.clickDoor(OFFICE);
    expect(r.spine.getState().phase).toBe('threshold');
  });

  it('turns walking input into the end of a glide, with the door no longer "framed"', () => {
    const r = inCorridor();
    r.settle();
    r.d.clickDoor(OFFICE);
    r.run(1500);
    r.d.controller.hold('key', -1);
    expect(r.d.controller.gliding).toBe(false);
  });

  it('hover raises attention and calls onDoorIntent once; leaving lowers it', () => {
    const r = inCorridor();
    r.settle();
    r.d.setHover('great-atrium');
    r.d.setHover('great-atrium');
    expect(r.log.intents).toEqual(['great-atrium']);
    r.settle();
    expect(r.animation['great-atrium'].attention).toBe(1);
    r.d.setHover(null);
    r.settle();
    expect(r.animation['great-atrium'].attention).toBe(0);
  });

  it('ignores door clicks until the visitor is in the corridor', () => {
    const r = rig();
    r.d.clickDoor(OFFICE);
    expect(r.spine.getState().phase).toBe('entrance');
    expect(r.spine.getState().focus).toBeNull();
  });
});

describe('opening a door', () => {
  function atOffice(extra: Parameters<typeof rig>[0] = {}): Rig {
    const r = inCorridor(extra);
    r.settle();
    r.spine.dispatch({ type: 'FOCUS_DOOR', id: OFFICE });
    r.settle();
    return r;
  }

  it('turns the handle, releases the latch, swings, then walks 1.6 m through and reports the seam', () => {
    const r = atOffice();
    const frame = doorFrame(OFFICE);
    const start = r.now();
    r.spine.dispatch({ type: 'OPEN_DOOR', id: OFFICE, via: 'door' });
    expect(r.spine.getState().phase).toBe('threshold');
    const samples: { t: number; handle: number; open: number; x: number }[] = [];
    r.run(2600, () =>
      samples.push({
        t: r.now() - start,
        handle: r.animation[OFFICE].handle,
        open: r.animation[OFFICE].open,
        x: r.d.pose.x,
      }),
    );
    for (const s of samples) {
      const expected = openingAt(s.t);
      expect(s.handle).toBeCloseTo(expected.handle, 6);
      expect(s.open).toBeCloseTo(expected.open, 6);
    }
    // The camera does not move until 300 ms into the swing, then advances 1.6 m over 1.4 s.
    const still = samples.filter((s) => s.t < ENTRY_START_MS - FRAME);
    expect(still.every((s) => s.x === frame.x)).toBe(true);
    expect(r.d.pose.x).toBeCloseTo(frame.x + SPINE_TIMING.entryAdvanceM, 9);
    expect(r.log.seams).toHaveLength(1);
    const seamAfter = r.log.seams[0]! - start;
    expect(seamAfter).toBeGreaterThan(ENTRY_START_MS + SPINE_TIMING.entryMs - 60);
    expect(seamAfter).toBeLessThan(ENTRY_START_MS + SPINE_TIMING.entryMs + 60);
    expect(r.d.pose.z).toBe(frame.z);
    expect(r.d.pose.yawDeg).toBe(frame.yawDeg);
    expect(r.animation[OFFICE].open).toBe(1);
    expect(SWING_START_MS).toBeLessThan(ENTRY_START_MS);
  });

  it('settles with the view level in the doorway and then asks for no more frames', () => {
    const r = atOffice();
    r.spine.dispatch({ type: 'OPEN_DOOR', id: OFFICE, via: 'door' });
    r.settle();
    expect(r.d.pose.pitchDeg).toBe(0);
    expect(r.d.step(FRAME)).toBe(false);
    expect(r.d.controller.speed).toBe(0);
  });

  it('keeps the walk smooth through the doorway: no frame jumps more than 4 cm', () => {
    const r = atOffice();
    r.spine.dispatch({ type: 'OPEN_DOOR', id: OFFICE, via: 'door' });
    let last = r.d.pose.x;
    let worst = 0;
    r.run(2600, () => {
      worst = Math.max(worst, Math.abs(r.d.pose.x - last));
      last = r.d.pose.x;
    });
    expect(worst).toBeLessThan(0.04);
  });

  it('takes no input while the door opens', () => {
    const r = atOffice();
    r.spine.dispatch({ type: 'OPEN_DOOR', id: OFFICE, via: 'door' });
    r.d.controller.hold('key', -1);
    r.d.controller.look(90, 10);
    expect(r.d.inputEnabled()).toBe(false);
    r.settle();
    expect(r.d.pose.x).toBeCloseTo(doorFrame(OFFICE).x + 1.6, 9);
    expect(r.d.pose.yawDeg).toBe(90);
  });

  it('cuts to the door first when asked to open from across the corridor (keyboard Enter right after Tab)', () => {
    const r = inCorridor();
    r.settle();
    r.spine.dispatch({ type: 'FOCUS_DOOR', id: OFFICE });
    r.run(300);
    r.spine.dispatch({ type: 'OPEN_DOOR', id: OFFICE, via: 'door' });
    expect(r.log.cuts).toBe(1);
    expect(r.d.pose.x).toBe(doorFrame(OFFICE).x);
    const start = r.now();
    r.settle();
    expect(r.log.seams).toHaveLength(1);
    expect(r.log.seams[0]! - start).toBeLessThan(ENTRY_START_MS + SPINE_TIMING.entryMs + 80);
  });

  it('lets a glide that is nearly there finish before walking through', () => {
    const r = inCorridor();
    r.settle();
    r.spine.dispatch({ type: 'FOCUS_DOOR', id: OFFICE });
    const total = r.settle();
    expect(total).toBeGreaterThan(5000);
    // Rewind: a fresh run, opened 0.4 m short of the view.
    const q = inCorridor();
    q.settle();
    q.spine.dispatch({ type: 'FOCUS_DOOR', id: OFFICE });
    while (Math.hypot(q.d.pose.x - doorFrame(OFFICE).x, q.d.pose.z - doorFrame(OFFICE).z) > 0.4) q.run(FRAME);
    q.spine.dispatch({ type: 'OPEN_DOOR', id: OFFICE, via: 'door' });
    expect(q.log.cuts).toBe(0);
    q.settle();
    expect(q.log.seams).toHaveLength(1);
    expect(q.d.pose.x).toBeCloseTo(doorFrame(OFFICE).x + 1.6, 9);
  });

  it('under reduced motion reports the seam at once and does not swing', () => {
    const r = inCorridor({ reduced: true });
    r.spine.dispatch({ type: 'FOCUS_DOOR', id: OFFICE });
    r.spine.dispatch({ type: 'OPEN_DOOR', id: OFFICE, via: 'door' });
    expect(r.log.seams).toHaveLength(1);
    r.run(1000);
    expect(r.animation[OFFICE].open).toBe(0);
    expect(r.animation[OFFICE].handle).toBe(0);
  });

  it('ignores a door opened from the board or a link: the core cuts straight in', () => {
    const r = inCorridor();
    r.settle();
    r.spine.dispatch({ type: 'OPEN_DOOR', id: OFFICE, via: 'board' });
    r.run(3000);
    expect(r.log.seams).toHaveLength(0);
    expect(r.animation[OFFICE].open).toBe(0);
  });

  it('puts the visitor back in front of the door if they go Back mid-opening', () => {
    const r = atOffice();
    r.spine.dispatch({ type: 'OPEN_DOOR', id: OFFICE, via: 'door' });
    r.run(900);
    r.spine.dispatch({ type: 'ROUTE', route: { kind: 'home' } });
    expect(r.spine.getState().phase).toBe('corridor');
    const frame = doorFrame(OFFICE);
    expect(r.d.pose.x).toBe(frame.x);
    expect(r.d.inputEnabled()).toBe(true);
    r.settle();
    expect(r.animation[OFFICE].open).toBe(0);
    expect(r.log.seams).toHaveLength(0);
  });
});

describe('a sealed door', () => {
  it('rattles for 420 ms, stays shut, and the visitor stays where they were', () => {
    const r = inCorridor();
    r.settle();
    r.spine.dispatch({ type: 'FOCUS_DOOR', id: 'apartment' });
    r.settle();
    const pose = { ...r.d.pose };
    r.spine.dispatch({ type: 'OPEN_DOOR', id: 'apartment', via: 'door' });
    expect(r.spine.getState().phase).toBe('corridor');
    const phases: number[] = [];
    r.run(600, () => phases.push(r.animation.apartment.rattle));
    expect(phases.some((p) => p > 0 && p <= 1)).toBe(true);
    expect(Math.max(...phases)).toBeLessThanOrEqual(1);
    expect(phases.filter((p) => p > 0).length).toBeCloseTo(SPINE_TIMING.rattleMs / FRAME, -1);
    expect(r.animation.apartment.rattle).toBe(0);
    expect(r.animation.apartment.open).toBe(0);
    expect(r.d.pose).toEqual(pose);
    expect(r.log.seams).toHaveLength(0);
  });

  it('does not rattle under reduced motion (the caption and the DOM say it is sealed)', () => {
    const r = inCorridor({ reduced: true });
    r.spine.dispatch({ type: 'FOCUS_DOOR', id: 'apartment' });
    r.spine.dispatch({ type: 'OPEN_DOOR', id: 'apartment', via: 'door' });
    r.run(600, () => expect(r.animation.apartment.rattle).toBe(0));
  });

  it('can be tried again to rattle again', () => {
    const r = inCorridor();
    r.settle();
    r.spine.dispatch({ type: 'FOCUS_DOOR', id: 'tomorrow-engine' });
    r.settle();
    for (let i = 0; i < 2; i += 1) {
      r.spine.dispatch({ type: 'OPEN_DOOR', id: 'tomorrow-engine', via: 'door' });
      let seen = false;
      r.run(500, () => (seen ||= r.animation['tomorrow-engine'].rattle > 0));
      expect(seen).toBe(true);
    }
  });
});

describe('returning from a chamber', () => {
  function returned(reduced = false): Rig {
    return rig({
      route: { kind: 'chamber', id: OFFICE },
      reduced,
      before: (spine) => {
        spine.dispatch({ type: 'THRESHOLD_DONE' });
        spine.dispatch({ type: 'LEAVE_CHAMBER' });
      },
    });
  }

  it('stands 1.4 m from that door, facing it, with the door open', () => {
    const r = returned();
    const frame = doorFrame(OFFICE);
    expect(r.spine.getState().phase).toBe('corridor');
    expect(r.d.pose).toEqual({ x: frame.x, z: frame.z, yawDeg: frame.yawDeg, pitchDeg: frame.pitchDeg });
    expect(r.animation[OFFICE].open).toBe(1);
    expect(r.d.inputEnabled()).toBe(true);
  });

  it('closes the door over 600 ms after a beat', () => {
    const r = returned();
    const start = r.now();
    const samples: { t: number; open: number }[] = [];
    r.run(1200, () => samples.push({ t: r.now() - start, open: r.animation[OFFICE].open }));
    for (const s of samples) expect(s.open).toBeCloseTo(closingAt(s.t), 6);
    expect(samples.find((s) => s.t < CLOSE_HOLD_MS - FRAME)!.open).toBe(1);
    expect(r.animation[OFFICE].open).toBe(0);
    let last = 1;
    for (const s of samples) {
      expect(s.open).toBeLessThanOrEqual(last + 1e-9);
      last = s.open;
    }
    r.settle();
    expect(r.d.step(FRAME)).toBe(false);
  });

  it('shows the door already closed under reduced motion', () => {
    const r = returned(true);
    expect(r.animation[OFFICE].open).toBe(0);
    r.settle();
    expect(r.animation[OFFICE].open).toBe(0);
    expect(r.d.step(FRAME)).toBe(false);
  });

  it('a deep link to a sealed chamber stands in front of its closed door', () => {
    const r = rig({ route: { kind: 'chamber', id: 'apartment' } });
    expect(r.spine.getState().phase).toBe('corridor');
    const frame = doorFrame('apartment');
    expect(r.d.pose.x).toBe(frame.x);
    expect(r.d.pose.z).toBe(frame.z);
    expect(r.animation.apartment.open).toBe(0);
  });

  it('opening again while the door is still closing takes over the door from shut', () => {
    const r = returned();
    r.run(CLOSE_HOLD_MS + 100);
    r.spine.dispatch({ type: 'OPEN_DOOR', id: OFFICE, via: 'door' });
    const start = r.now();
    r.run(400, () => expect(r.animation[OFFICE].open).toBeCloseTo(openingAt(r.now() - start).open, 6));
  });

  it('a click on the door in front of the returning visitor opens it again', () => {
    const r = returned();
    r.settle();
    r.d.clickDoor(OFFICE);
    expect(r.spine.getState().phase).toBe('threshold');
  });
});

describe('reduced motion', () => {
  it('cuts to the door view on focus, with the dissolve captured once', () => {
    const r = inCorridor({ reduced: true });
    r.log.cuts = 0;
    r.spine.dispatch({ type: 'FOCUS_DOOR', id: OFFICE });
    expect(r.log.cuts).toBe(1);
    const frame = doorFrame(OFFICE);
    expect(r.d.pose).toEqual({ x: frame.x, z: frame.z, yawDeg: frame.yawDeg, pitchDeg: frame.pitchDeg });
    expect(r.d.controller.gliding).toBe(false);
  });

  it('cannot walk, but forward and back step between the hand-over and each door', () => {
    const r = inCorridor({ reduced: true });
    r.d.controller.hold('key', 1);
    r.run(1000);
    expect(r.d.pose).toEqual(HANDOVER_POSE);
    const seen: (ChamberId | null)[] = [];
    for (let i = 0; i < IDS.length; i += 1) {
      r.d.stepViewpoint(1);
      seen.push(r.spine.getState().focus);
    }
    expect(seen).toEqual(IDS);
    for (let i = 0; i < IDS.length; i += 1) r.d.stepViewpoint(-1);
    expect(r.spine.getState().focus).toBeNull();
    expect(r.d.pose).toEqual(HANDOVER_POSE);
  });

  it('floor clicks do nothing', () => {
    const r = inCorridor({ reduced: true });
    r.d.clickFloor({ x: 0, z: -4 });
    expect(r.d.pose).toEqual(HANDOVER_POSE);
  });

  it('switching it on mid-corridor cuts to the nearest named view', () => {
    const r = inCorridor();
    r.settle();
    r.spine.dispatch({ type: 'FOCUS_DOOR', id: 'apartment' });
    r.run(1000);
    r.d.setReducedMotion(true);
    const frame = doorFrame('apartment');
    expect(r.d.pose).toEqual({ x: frame.x, z: frame.z, yawDeg: frame.yawDeg, pitchDeg: frame.pitchDeg });
    expect(r.d.controller.gliding).toBe(false);
  });

  it('stepping viewpoints is for reduced motion only', () => {
    const r = inCorridor();
    r.settle();
    r.d.stepViewpoint(1);
    expect(r.spine.getState().focus).toBeNull();
  });
});

describe('floor click', () => {
  it('glides to the point with the view left alone', () => {
    const r = inCorridor();
    r.settle();
    r.d.controller.look(20, 4);
    const yaw = r.d.pose.yawDeg;
    r.d.clickFloor({ x: 0.5, z: -3 });
    expect(r.d.controller.gliding).toBe(true);
    r.settle();
    expect(r.d.pose.x).toBeCloseTo(0.5, 9);
    expect(r.d.pose.z).toBeCloseTo(-3, 9);
    expect(r.d.pose.yawDeg).toBe(yaw);
  });

  it('ignores clicks on the wall side and beside the visitor', () => {
    const r = inCorridor();
    r.settle();
    r.d.clickFloor({ x: 3, z: -3 });
    expect(r.d.controller.gliding).toBe(false);
    r.d.clickFloor({ x: HANDOVER.x + 0.05, z: HANDOVER.z - 0.05 });
    expect(r.d.controller.gliding).toBe(false);
  });
});

describe('dispose', () => {
  it('stops listening to the spine and reports the camera still', () => {
    const r = inCorridor();
    r.settle();
    r.d.controller.hold('key', 1);
    r.run(500);
    r.d.dispose();
    expect(r.log.walk.at(-1)).toBe(0);
    const frames = r.log.frames;
    r.spine.dispatch({ type: 'FOCUS_DOOR', id: OFFICE });
    expect(r.log.frames).toBe(frames);
  });
});
