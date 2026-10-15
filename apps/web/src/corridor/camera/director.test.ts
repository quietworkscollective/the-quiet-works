import { CHAMBERS, createSpineStore, spineInitial, type ChamberId } from '@tqw/engine';
import { describe, expect, it } from 'vitest';
import { SITE_SCROLL, SPINE_TIMING } from '../../timing.ts';
import { createCorridorAnimation } from '../animation.ts';
import { createProgress } from '../progress.ts';
import { CHAMBER_SLOTS, CORRIDOR, START_VIEW } from '../layout.ts';
import { createDirector } from './director.ts';
import { CLOSE_HOLD_MS, closingAt, ENTRY_START_MS, openingAt, SWING_START_MS } from './doorMotion.ts';
import { entrancePose, WALK_IN_KEYS } from './entrance.ts';
import {
  DOOR_VIEW_YAW_DEG,
  doorFrame,
  doorwayDirection,
  HERO_VIEW,
  HANDOVER_POSE,
  LANDING_POSE,
} from './viewpoints.ts';
import { FRAME, inCorridor, OFFICE, rig, type Rig } from './testkit.ts';

const IDS = CHAMBERS.map((c) => c.id);
/** The page's scroll progress at which the walk-in is `t` of the way along its authored path. */
const at = (t: number) => t * SITE_SCROLL.handoverAt;

/** Spelled out, so these tests do not lean on the functions under test. */
const DESKTOP_START = { x: 0, z: 7, yawDeg: -13, pitchDeg: -1 };
const PHONE_START = { x: 0, z: 9.8, yawDeg: -10, pitchDeg: -1 };

describe('landing walk-in', () => {
  it('starts at the landing view: eye height, at the back of the lobby, looking down the axis', () => {
    const r = rig();
    expect(r.d.pose).toEqual(LANDING_POSE);
    expect(LANDING_POSE).toEqual(HERO_VIEW.desktop);
    expect(r.d.pose.yawDeg).toBe(0);
    expect(r.d.pose.z).toBe(9.8);
  });

  it('follows scroll progress along the entrance keys, read at progress / handoverAt, and walks back', () => {
    const r = rig();
    for (const key of WALK_IN_KEYS) {
      r.progress.set(at(key.t));
      r.settle();
      const want = entrancePose(key.t, false);
      expect(r.d.pose.z).toBeCloseTo(want.z, 4);
      expect(r.d.pose.pitchDeg).toBeCloseTo(want.pitchDeg, 4);
      // The hero drift is the only other sideways and turning movement, and it is under 4 cm and 0.3 degrees.
      expect(Math.abs(r.d.pose.x - want.x)).toBeLessThanOrEqual(0.04);
      expect(Math.abs(r.d.pose.yawDeg - want.yawDeg)).toBeLessThanOrEqual(0.3);
    }
    r.progress.set(at(0.16));
    r.settle();
    expect(r.d.pose.z).toBeCloseTo(entrancePose(0.16, false).z, 4);
  });

  it('smooths scroll by at most 120 ms and has no automatic travel', () => {
    const r = rig();
    r.progress.set(at(0.6));
    const start = r.d.pose.z;
    const target = entrancePose(0.6, false).z;
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

  it('hands over at progress 1 exactly at the starting view, with no jump or turn', () => {
    const r = rig();
    for (let i = 1; i <= 30; i += 1) {
      r.progress.set(i / 30);
      r.run(FRAME);
    }
    r.settle();
    const before = { ...r.d.pose };
    expect(before).toEqual(DESKTOP_START);
    r.spine.dispatch({ type: 'ENTRANCE_DONE' });
    expect(r.d.pose).toEqual(before);
    r.run(1000);
    expect(r.d.pose).toEqual(HANDOVER_POSE);
    expect(r.d.pose).toEqual(START_VIEW.desktop);
    expect(r.d.controller.speed).toBe(0);
  });

  it('never snaps on the way: every frame of the scroll walk-in moves the view by a few centimetres at most', () => {
    const r = rig();
    let last = { ...r.d.pose };
    let worstMetres = 0;
    let worstDeg = 0;
    for (let i = 1; i <= 120; i += 1) {
      r.progress.set(i / 120);
      r.run(FRAME);
      worstMetres = Math.max(worstMetres, Math.hypot(r.d.pose.x - last.x, r.d.pose.z - last.z));
      worstDeg = Math.max(worstDeg, Math.abs(r.d.pose.yawDeg - last.yawDeg));
      last = { ...r.d.pose };
    }
    r.settle();
    r.spine.dispatch({ type: 'ENTRANCE_DONE' });
    r.run(FRAME);
    worstMetres = Math.max(worstMetres, Math.hypot(r.d.pose.x - last.x, r.d.pose.z - last.z));
    r.settle();
    expect(r.d.pose).toEqual(DESKTOP_START);
    // A scroll that covers the whole run in 120 frames is a fast one: still no jump of the view.
    expect(worstMetres).toBeLessThan(0.12);
    expect(worstDeg).toBeLessThan(1.5);
  });

  it('settles onto the starting view through the scroll smoothing when the scroll jumps to the end', () => {
    const r = rig();
    r.progress.set(0.5);
    r.run(500);
    r.progress.set(1);
    r.spine.dispatch({ type: 'ENTRANCE_DONE' });
    expect(r.d.controller.gliding).toBe(false);
    const start = r.d.pose.z;
    r.run(120);
    expect(start - r.d.pose.z).toBeGreaterThan(0.94 * (start - DESKTOP_START.z));
    r.settle();
    expect(r.d.pose).toEqual(HANDOVER_POSE);
  });

  it('hands the settled starting view to free movement and announces arrival once', () => {
    const r = rig({ progress: 1 });
    r.spine.dispatch({ type: 'ENTRANCE_DONE' });
    r.settle();
    expect(r.d.pose).toEqual(HANDOVER_POSE);
    expect(r.d.inputEnabled()).toBe(true);
    expect(r.log.arrivals).toBe(1);
    r.d.step(FRAME);
    expect(r.log.arrivals).toBe(1);
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
    // The nudge is along the heading, 13 degrees off the axis: 0.35 m of it is 0.34 m of z.
    expect(before - r.d.pose.z).toBeGreaterThan(0.3);
    expect(before - r.d.pose.z).toBeLessThan(0.4);
  });

  it('walks in at walking pace when "Enter" skips the scroll, and a key press takes over at once', () => {
    const r = rig({ progress: 0.2 });
    r.run(100);
    // The page engages the window the moment the visitor is in the corridor.
    r.d.setEngaged(true);
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
    expect(t).toBeGreaterThan(1800);
    expect(t).toBeLessThan(5500);
  });

  it('lets the visitor take over a skipped entrance by walking', () => {
    const r = rig({ progress: 0.2 });
    r.run(100);
    // The page engages the window the moment the visitor is in the corridor.
    r.d.setEngaged(true);
    r.spine.dispatch({ type: 'ENTRANCE_DONE' });
    r.run(1000);
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

  it('returns to the landing in a short settle, then resumes the hero drift', () => {
    const r = inCorridor();
    r.d.setEngaged(true);
    r.d.controller.hold('key', 1);
    r.run(1200);
    r.d.controller.hold('key', 0);
    r.d.setEngaged(false);
    expect(r.d.pose.z).toBeLessThan(HANDOVER_POSE.z - 0.5);

    r.progress.set(0);
    r.spine.dispatch({ type: 'RETURN_TO_ENTRANCE' });
    let settleMs = 0;
    while (settleMs < 1200) {
      const busy = r.d.step(FRAME);
      settleMs += FRAME;
      if (!busy) break;
    }
    expect(settleMs).toBeLessThan(1200);
    expect(r.d.pose).toEqual(HERO_VIEW.desktop);

    r.run(1000);
    expect(r.d.pose.z).toBe(HERO_VIEW.desktop.z);
    expect(r.d.pose.x).not.toBe(HERO_VIEW.desktop.x);
    expect(Math.abs(r.d.pose.x)).toBeLessThanOrEqual(0.04);

    const phone = inCorridor({ portrait: true, reduced: true });
    phone.spine.dispatch({ type: 'RETURN_TO_ENTRANCE' });
    expect(phone.d.pose).toEqual(HERO_VIEW.portrait);
  });

  it('starts the authored walk-in again when scrolling down from the restored landing', () => {
    const r = inCorridor();
    r.progress.set(0);
    r.spine.dispatch({ type: 'RETURN_TO_ENTRANCE' });
    r.settle(1200);
    expect(r.d.pose).toEqual(HERO_VIEW.desktop);

    r.progress.set(at(0.4));
    r.settle();
    expect(r.d.pose).toEqual(entrancePose(0.4, false));
  });
});

describe('portrait walk-in and starting view', () => {
  it('turns toward the board as the scroll walks: the heading follows the walk-in, from straight to the phone’s starting heading', () => {
    const r = rig({ portrait: true });
    expect(r.d.pose.yawDeg).toBe(0);
    for (const t of [0.25, 0.5, 0.75, 0.9]) {
      r.progress.set(at(t));
      r.settle();
      const want = entrancePose(t, true);
      expect(r.d.pose.yawDeg).toBeCloseTo(want.yawDeg, 6);
      expect(r.d.pose.pitchDeg).toBeCloseTo(want.pitchDeg, 6);
    }
    r.progress.set(at(1));
    r.settle();
    expect(r.d.pose.yawDeg).toBeCloseTo(PHONE_START.yawDeg, 9);
    // Back through the walk-in: the view turns back, no one-way door.
    r.progress.set(at(0.0));
    r.settle();
    expect(r.d.pose.yawDeg).toBeCloseTo(0, 1);
  });

  it('smooths the turn like the walk: 95% of a step within 120 ms, never past the limit', () => {
    const r = rig({ portrait: true, progress: at(0.8) });
    r.settle();
    const from = r.d.pose.yawDeg;
    r.progress.set(1);
    r.run(120);
    expect(from - r.d.pose.yawDeg).toBeGreaterThan(0.94 * (from - PHONE_START.yawDeg));
    r.run(2000, () => expect(r.d.pose.yawDeg).toBeGreaterThanOrEqual(PHONE_START.yawDeg - 1e-9));
  });

  it('lands on the phone’s starting view exactly, with no jump in position or heading', () => {
    const r = rig({ portrait: true });
    let last = { ...r.d.pose };
    let worstYaw = 0;
    let worstMetres = 0;
    for (let i = 1; i <= 60; i += 1) {
      r.progress.set(i / 60);
      r.run(FRAME);
      worstYaw = Math.max(worstYaw, Math.abs(r.d.pose.yawDeg - last.yawDeg));
      worstMetres = Math.max(worstMetres, Math.hypot(r.d.pose.x - last.x, r.d.pose.z - last.z));
      last = { ...r.d.pose };
    }
    r.settle();
    r.spine.dispatch({ type: 'ENTRANCE_DONE' });
    expect(r.d.pose.yawDeg).toBe(PHONE_START.yawDeg);
    // The hand-over settle holds the starting view the whole way: no dip and no snap at the end.
    r.run(1000, () => expect(r.d.pose.yawDeg).toBeCloseTo(PHONE_START.yawDeg, 6));
    expect(r.d.pose).toEqual(PHONE_START);
    expect(worstYaw).toBeLessThan(2);
    expect(worstMetres).toBeLessThan(0.05);
  });

  it('starts free walking from the starting heading: forward walks along it, toward the board side', () => {
    const r = inCorridor({ portrait: true });
    r.settle();
    expect(r.d.pose.yawDeg).toBe(PHONE_START.yawDeg);
    r.d.controller.hold('key', 1);
    r.run(1500);
    r.d.controller.hold('key', 0);
    r.settle();
    const { x, z, yawDeg } = r.d.pose;
    expect(yawDeg).toBe(PHONE_START.yawDeg);
    const along = Math.hypot(x - PHONE_START.x, z - PHONE_START.z);
    expect(x).toBeLessThan(PHONE_START.x - 0.2);
    expect(Math.atan2(x - PHONE_START.x, PHONE_START.z - z) * (180 / Math.PI)).toBeCloseTo(PHONE_START.yawDeg, 3);
    expect(along).toBeGreaterThan(1);
  });

  it('a skipped entrance walks in and ends on the phone’s starting view', () => {
    const r = rig({ portrait: true, progress: 0.2 });
    r.run(100);
    // The page engages the window the moment the visitor is in the corridor.
    r.d.setEngaged(true);
    r.spine.dispatch({ type: 'ENTRANCE_DONE' });
    r.settle();
    expect(r.d.pose).toEqual(PHONE_START);
  });

  it('a corridor that opens without a walk-in (retrying the 3D view) starts on the phone’s starting view', () => {
    const r = inCorridor({ portrait: true });
    expect(r.d.pose).toEqual(PHONE_START);
  });

  it('under reduced motion the landing view is straight and the static hand-over view is the starting view', () => {
    const r = rig({ portrait: true, reduced: true });
    r.progress.set(at(0.9));
    r.run(500);
    expect(r.d.pose).toEqual(HERO_VIEW.portrait);
    r.progress.set(at(1));
    r.run(FRAME);
    expect(r.d.pose).toEqual(PHONE_START);
    expect(r.log.cuts).toBe(1);
    r.spine.dispatch({ type: 'ENTRANCE_DONE' });
    expect(r.d.pose).toEqual(PHONE_START);
    // Already showing the hand-over view: handing over cuts nothing more.
    expect(r.log.cuts).toBe(1);
    // Stepping to a door and back returns to the starting view.
    r.d.stepViewpoint(1);
    expect(r.d.pose.yawDeg).toBe(doorFrame(OFFICE).yawDeg);
    r.d.stepViewpoint(-1);
    expect(r.d.pose).toEqual(PHONE_START);
  });

  it('switching reduced motion on mid-corridor in portrait cuts to the starting view', () => {
    const r = inCorridor({ portrait: true });
    r.settle();
    r.d.controller.hold('key', 1);
    r.run(600);
    r.d.setReducedMotion(true);
    expect(r.d.pose).toEqual(PHONE_START);
  });

  it('follows the screen turning: the desktop or the phone view is decided by the screen at the time', () => {
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
    expect(d.pose.yawDeg).toBeCloseTo(DESKTOP_START.yawDeg, 9);
    expect(d.pose.z).toBeCloseTo(DESKTOP_START.z, 9);
    portrait = true;
    for (let i = 0; i < 40; i += 1) d.step(FRAME);
    expect(d.pose.yawDeg).toBeCloseTo(PHONE_START.yawDeg, 9);
    expect(d.pose.z).toBeCloseTo(PHONE_START.z, 9);
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
    expect(r.d.pose.z).toBeLessThan(START_VIEW.desktop.z - 0.5);
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
  it('glides to frame the door, 1.4 m from it and facing it at 90 degrees, and lifts its attention', () => {
    const r = inCorridor();
    r.settle();
    r.spine.dispatch({ type: 'FOCUS_DOOR', id: OFFICE });
    expect(r.log.intents).toEqual([OFFICE]);
    expect(r.d.controller.gliding).toBe(true);
    r.settle();
    const frame = doorFrame(OFFICE);
    expect(r.d.pose).toEqual({ x: frame.x, z: frame.z, yawDeg: frame.yawDeg, pitchDeg: frame.pitchDeg });
    const slot = CHAMBER_SLOTS[0]!;
    expect(Math.hypot(CORRIDOR.width / 2 - r.d.pose.x, r.d.pose.z - slot.z)).toBeCloseTo(SPINE_TIMING.focusDistanceM, 9);
    // Focus keeps the live corridor framing: level with the door and square to its wall.
    expect(r.d.pose.z).toBeCloseTo(slot.z, 9);
    expect(r.d.pose.yawDeg).toBe(90);
    expect(Math.atan2(CORRIDOR.width / 2 - r.d.pose.x, r.d.pose.z - slot.z) * (180 / Math.PI)).toBeCloseTo(DOOR_VIEW_YAW_DEG, 6);
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

  it('keeps the Apartment door shut until the chamber reports ready', () => {
    const r = inCorridor();
    r.settle();
    r.spine.dispatch({ type: 'FOCUS_DOOR', id: 'apartment' });
    r.settle();
    r.spine.dispatch({ type: 'OPEN_DOOR', id: 'apartment', via: 'door' });
    r.run(5000);
    expect(r.animation.apartment.handle).toBe(0);
    expect(r.animation.apartment.open).toBe(0);
    expect(r.log.seams).toHaveLength(0);
    r.d.markChamberReady('apartment');
    r.settle();
    expect(r.animation.apartment.open).toBe(1);
    expect(r.log.seams).toHaveLength(1);
  });

  it('turns the handle, releases the latch, swings, then walks 1.6 m through and reports the seam', () => {
    const r = atOffice();
    const frame = doorFrame(OFFICE);
    const start = r.now();
    r.spine.dispatch({ type: 'OPEN_DOOR', id: OFFICE, via: 'door' });
    r.d.markChamberReady(OFFICE);
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
    expect(r.d.pose.x).toBeCloseTo(CORRIDOR.width / 2 + SPINE_TIMING.entryAdvanceM - SPINE_TIMING.focusDistanceM, 9);
    expect(r.log.seams).toHaveLength(1);
    const seamAfter = r.log.seams[0]! - start;
    expect(seamAfter).toBeGreaterThan(ENTRY_START_MS + SPINE_TIMING.entryMs - 60);
    expect(seamAfter).toBeLessThan(ENTRY_START_MS + SPINE_TIMING.entryMs + 60);
    // Through the door along the line of sight: the view holds its heading, and the walk keeps to it.
    const along = doorwayDirection(OFFICE);
    expect(r.d.pose.z - frame.z).toBeCloseTo((along.z / along.x) * (r.d.pose.x - frame.x), 9);
    expect(r.d.pose.yawDeg).toBe(frame.yawDeg);
    expect(r.animation[OFFICE].open).toBe(1);
    expect(SWING_START_MS).toBeLessThan(ENTRY_START_MS);
  });

  it('settles with the view level in the doorway and then asks for no more frames', () => {
    const r = atOffice();
    r.spine.dispatch({ type: 'OPEN_DOOR', id: OFFICE, via: 'door' });
    r.d.markChamberReady(OFFICE);
    r.settle();
    expect(r.d.pose.pitchDeg).toBe(0);
    expect(r.d.step(FRAME)).toBe(false);
    expect(r.d.controller.speed).toBe(0);
  });

  it('keeps the walk smooth through the doorway: no frame jumps more than 4 cm', () => {
    const r = atOffice();
    r.spine.dispatch({ type: 'OPEN_DOOR', id: OFFICE, via: 'door' });
    r.d.markChamberReady(OFFICE);
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
    r.d.markChamberReady(OFFICE);
    r.d.controller.hold('key', -1);
    r.d.controller.look(90, 10);
    expect(r.d.inputEnabled()).toBe(false);
    r.settle();
    expect(r.d.pose.x).toBeCloseTo(CORRIDOR.width / 2 + SPINE_TIMING.entryAdvanceM - SPINE_TIMING.focusDistanceM, 9);
    expect(r.d.pose.yawDeg).toBe(doorFrame(OFFICE).yawDeg);
  });

  it('cuts to the door first when asked to open from across the corridor (keyboard Enter right after Tab)', () => {
    const r = inCorridor();
    r.settle();
    r.spine.dispatch({ type: 'FOCUS_DOOR', id: OFFICE });
    r.run(300);
    r.spine.dispatch({ type: 'OPEN_DOOR', id: OFFICE, via: 'door' });
    r.d.markChamberReady(OFFICE);
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
    q.d.markChamberReady(OFFICE);
    expect(q.log.cuts).toBe(0);
    q.settle();
    expect(q.log.seams).toHaveLength(1);
    expect(q.d.pose.x).toBeCloseTo(CORRIDOR.width / 2 + SPINE_TIMING.entryAdvanceM - SPINE_TIMING.focusDistanceM, 9);
  });

  it('under reduced motion reports the seam at once and does not swing', () => {
    const r = inCorridor({ reduced: true });
    r.spine.dispatch({ type: 'FOCUS_DOOR', id: OFFICE });
    r.spine.dispatch({ type: 'OPEN_DOOR', id: OFFICE, via: 'door' });
    expect(r.log.seams).toHaveLength(0);
    r.d.markChamberReady(OFFICE);
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
    r.d.markChamberReady(OFFICE);
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
    r.spine.dispatch({ type: 'FOCUS_DOOR', id: 'tomorrow-engine' });
    r.settle();
    const pose = { ...r.d.pose };
    r.spine.dispatch({ type: 'OPEN_DOOR', id: 'tomorrow-engine', via: 'door' });
    expect(r.spine.getState().phase).toBe('corridor');
    const phases: number[] = [];
    r.run(600, () => phases.push(r.animation['tomorrow-engine'].rattle));
    expect(phases.some((p) => p > 0 && p <= 1)).toBe(true);
    expect(Math.max(...phases)).toBeLessThanOrEqual(1);
    expect(phases.filter((p) => p > 0).length).toBeCloseTo(SPINE_TIMING.rattleMs / FRAME, -1);
    expect(r.animation['tomorrow-engine'].rattle).toBe(0);
    expect(r.animation['tomorrow-engine'].open).toBe(0);
    expect(r.d.pose).toEqual(pose);
    expect(r.log.seams).toHaveLength(0);
  });

  it('does not rattle under reduced motion (the caption and the DOM say it is sealed)', () => {
    const r = inCorridor({ reduced: true });
    r.spine.dispatch({ type: 'FOCUS_DOOR', id: 'tomorrow-engine' });
    r.spine.dispatch({ type: 'OPEN_DOOR', id: 'tomorrow-engine', via: 'door' });
    r.run(600, () => expect(r.animation['tomorrow-engine'].rattle).toBe(0));
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
    const r = rig({ route: { kind: 'chamber', id: 'tomorrow-engine' } });
    expect(r.spine.getState().phase).toBe('corridor');
    const frame = doorFrame('tomorrow-engine');
    expect(r.d.pose.x).toBe(frame.x);
    expect(r.d.pose.z).toBe(frame.z);
    expect(r.animation['tomorrow-engine'].open).toBe(0);
  });

  it('opening again while the door is still closing takes over the door from shut', () => {
    const r = returned();
    r.run(CLOSE_HOLD_MS + 100);
    r.spine.dispatch({ type: 'OPEN_DOOR', id: OFFICE, via: 'door' });
    r.d.markChamberReady(OFFICE);
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
    r.d.clickFloor({ x: START_VIEW.desktop.x + 0.05, z: START_VIEW.desktop.z - 0.05 });
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

describe('free look in the corridor (founder ruling, 15 October 2026)', () => {
  it('does not impose a yaw limit on desktop or portrait screens', () => {
    for (const portrait of [false, true]) {
      const r = inCorridor({ portrait });
      r.run(FRAME);
      expect(r.d.controller.yawLimitDeg).toBe(Number.POSITIVE_INFINITY);
    }
  });

  it('can face the entrance, pass it in either direction, and continue turning', () => {
    for (const portrait of [false, true]) {
      const r = inCorridor({ portrait });
      r.settle();
      r.d.controller.setPose({ yawDeg: 0 });
      r.d.controller.look(180, 0);
      expect(r.d.pose.yawDeg).toBe(180);
      r.d.controller.look(12, 0);
      expect(r.d.pose.yawDeg).toBe(192);
      r.d.controller.look(-384, 0);
      expect(r.d.pose.yawDeg).toBe(-192);
    }
  });
});
