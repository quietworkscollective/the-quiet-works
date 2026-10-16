import { CHAMBERS, createSpineStore, spineInitial } from '@tqw/engine';
import { describe, expect, it } from 'vitest';
import { createFirstPerson } from '../../firstPerson/controller.ts';
import type { AmbientClock } from '../ambient.ts';
import { PROPS, createPropAnimation, type PropId } from '../props.ts';
import { createBoardMotion } from './boardMotion.ts';
import { horizontalFov } from './framing.ts';
import { GLINT } from './glint.ts';
import { CUE_TUNING } from './cueTuning.ts';
import { createInterest, DOOR_GLINT_LEVEL } from './interest.ts';
import { ACTION_TIMING, ATTENTION_RISE_MS } from './propMotion.ts';
import { boardAnchor, propAnchor, propById, stationFor } from './stations.ts';
import { corridorBounds, FOV, GATES, SOFT_STOP, handoverPose } from './viewpoints.ts';

const FRAME = 1000 / 60;
const LENS = { vfovDeg: FOV.landscape, aspect: 1.6 };
const bounds = corridorBounds();

interface Options {
  reduced?: boolean;
  canAct?: boolean;
  /** Where the visitor starts; the desktop starting view by default. */
  at?: { x: number; z: number; yawDeg: number; pitchDeg: number };
  windows?: boolean;
}

function setup(o: Options = {}) {
  let clock = 0;
  let roll = 0.5;
  const reduced = o.reduced ?? false;
  const controller = createFirstPerson({
    start: o.at ?? handoverPose(false),
    bounds,
    gates: GATES,
    softStopM: SOFT_STOP,
    reducedMotion: reduced,
  });
  // The director tells the controller the screen's field of view on every frame; so does this.
  controller.setLens(horizontalFov({ vfovDeg: FOV.landscape, aspect: 1.6 }));
  const spine = createSpineStore(spineInitial({ kind: 'home' }));
  spine.dispatch({ type: 'ENTRANCE_DONE' });
  const animation = createPropAnimation();
  const boardMotion = createBoardMotion();
  const acts: PropId[] = [];
  const requests: { id: string; ms: number }[] = [];
  let allow = o.windows ?? true;
  const ambient: AmbientClock = {
    now: () => 0,
    active: () => false,
    requestWindow(id, ms) {
      requests.push({ id, ms });
      return allow;
    },
  };
  const state = { canAct: o.canAct ?? true, moves: 0, frames: 0 };
  const interest = createInterest({
    controller,
    bounds,
    spine,
    animation,
    lens: () => LENS,
    reduced: () => reduced,
    canAct: () => state.canAct,
    beforeMove: () => (state.moves += 1),
    requestFrame: () => (state.frames += 1),
    doorIds: () => CHAMBERS.map((c) => c.id),
    doorBusy: () => false,
    ambient,
    boardMotion,
    onAct: (id) => acts.push(id),
    nowMs: () => clock,
    random: () => roll,
  });
  const run = (ms: number) => {
    let busy = false;
    for (let t = 0; t < ms - 1e-9; t += FRAME) {
      const dt = Math.min(FRAME, ms - t);
      clock += dt;
      controller.step(dt);
      busy = interest.step(dt);
    }
    return busy;
  };
  return {
    interest,
    controller,
    spine,
    animation,
    boardMotion,
    acts,
    requests,
    state,
    run,
    setRoll: (r: number) => (roll = r),
    allowWindows: (on: boolean) => (allow = on),
    wait: (ms: number) => (clock += ms),
    /** Puts the visitor at a prop's framing station, as if they had walked there. */
    stand(id: PropId) {
      const s = stationFor(propAnchor(propById(id)), LENS, bounds);
      controller.setPose(s);
    },
  };
}

describe('a click on a prop', () => {
  it('glides a distant one to its framing station and does nothing else yet', () => {
    const t = setup();
    t.interest.clickProp('football');
    expect(t.state.moves).toBe(1);
    expect(t.controller.gliding).toBe(true);
    expect(t.interest.framed).toEqual({ kind: 'prop', id: 'football' });
    expect(t.acts).toEqual([]);
    t.run(15_000);
    const station = stationFor(propAnchor(propById('football')), LENS, bounds);
    expect(t.controller.pose.x).toBeCloseTo(station.x, 6);
    expect(t.controller.pose.z).toBeCloseTo(station.z, 6);
    expect(t.animation['football'].action).toBe(0);
    expect(t.acts).toEqual([]);
  });

  it('runs the action of one that is framed: action goes 0 to 1', () => {
    const t = setup();
    t.interest.clickProp('football');
    t.run(15_000);
    t.interest.clickProp('football');
    expect(t.acts).toEqual(['football']);
    t.run(ACTION_TIMING['football'].riseMs / 2);
    expect(t.animation['football'].action).toBeGreaterThan(0.3);
    t.run(ACTION_TIMING['football'].riseMs);
    expect(t.animation['football'].action).toBe(1);
  });

  it('runs the action of one the visitor is standing near, without gliding', () => {
    const t = setup();
    t.stand('bicycle-wheel');
    t.interest.clickProp('bicycle-wheel');
    expect(t.acts).toEqual(['bicycle-wheel']);
    expect(t.controller.gliding).toBe(false);
    expect(t.state.moves).toBe(0);
  });

  it('acts on a prop within reach (2.7 m for a small one) and glides to one beyond it', () => {
    const t = setup();
    t.stand('bicycle-wheel');
    const pose = t.controller.pose;
    t.controller.setPose({ ...pose, x: pose.x + CUE_TUNING.leaveReachM });
    t.interest.clickProp('bicycle-wheel');
    expect(t.acts).toEqual([]);
    expect(t.controller.gliding).toBe(true);
  });

  it('does nothing when the visitor cannot act (a door opening, a dialog over the scene, the landing)', () => {
    const t = setup({ canAct: false });
    t.interest.clickProp('football');
    t.interest.clickBoard();
    t.interest.actProp('football');
    expect(t.controller.gliding).toBe(false);
    expect(t.acts).toEqual([]);
    expect(t.state.moves).toBe(0);
  });

  it('cuts instead of gliding under reduced motion, and the next click acts', () => {
    const t = setup({ reduced: true });
    t.interest.clickProp('football');
    expect(t.controller.gliding).toBe(false);
    const station = stationFor(propAnchor(propById('football')), LENS, bounds);
    expect(t.controller.pose.x).toBeCloseTo(station.x, 9);
    expect(t.controller.pose.z).toBeCloseTo(station.z, 9);
    expect(t.acts).toEqual([]);
    t.interest.clickProp('football');
    expect(t.acts).toEqual(['football']);
  });

  it('forgets the framing once the visitor walks away from the station, and the next click glides again', () => {
    const t = setup();
    t.interest.clickProp('football');
    t.run(15_000);
    expect(t.interest.framed).not.toBeNull();
    const pose = t.controller.pose;
    // Well out of reach: forgetting the framing is what makes the next click glide.
    t.controller.setPose({ ...pose, z: pose.z + 4 });
    t.run(FRAME * 2);
    expect(t.interest.framed).toBeNull();
    t.interest.clickProp('football');
    expect(t.acts).toEqual([]);
    expect(t.controller.gliding).toBe(true);
  });

  it('a second click while the action rises is ignored, not stacked', () => {
    const t = setup();
    t.stand('chess');
    t.interest.clickProp('chess');
    t.run(200);
    t.interest.clickProp('chess');
    expect(t.acts).toEqual(['chess']);
  });
});

describe('hover and focus', () => {
  it('lighten a prop within 100 to 150 ms and let go when it leaves', () => {
    const t = setup();
    t.interest.hoverProp('work-glove');
    t.run(ATTENTION_RISE_MS - 20);
    expect(t.animation['work-glove'].attention).toBeLessThan(1);
    t.run(40);
    expect(t.animation['work-glove'].attention).toBe(1);
    t.interest.hoverProp(null);
    t.run(300);
    expect(t.animation['work-glove'].attention).toBe(0);
  });

  it('treat keyboard focus the same way', () => {
    const t = setup();
    t.interest.focusProp('chess');
    t.run(200);
    expect(t.animation.chess.attention).toBe(1);
    t.interest.focusProp(null);
    t.run(300);
    expect(t.animation.chess.attention).toBe(0);
  });

  it('keep a framed prop lightened while the visitor stands at it', () => {
    const t = setup();
    t.interest.clickProp('football');
    t.run(15_000);
    expect(t.animation.football.attention).toBe(1);
  });

  it('report what is hovered or focused, and the board separately', () => {
    const t = setup();
    t.interest.hoverProp('chess');
    expect(t.interest.hovered).toEqual({ kind: 'prop', id: 'chess' });
    t.interest.hoverBoard(true);
    expect(t.interest.hovered).toEqual({ kind: 'board' });
    t.interest.hoverBoard(false);
    expect(t.interest.hovered).toBeNull();
    t.interest.focusProp('football');
    expect(t.interest.focused).toEqual({ kind: 'prop', id: 'football' });
  });
});

describe('the notice board', () => {
  it('glides a distant visitor to a place to read it from', () => {
    const t = setup();
    t.interest.clickBoard();
    expect(t.controller.gliding).toBe(true);
    expect(t.interest.framed).toEqual({ kind: 'board' });
    expect(t.spine.getState().boardOpen).toBe(false);
    t.run(15_000);
    const station = stationFor(boardAnchor(), LENS, bounds);
    expect(t.controller.pose.x).toBeCloseTo(station.x, 6);
    expect(t.controller.pose.z).toBeCloseTo(station.z, 6);
  });

  it('opens the board for a visitor who is at it', () => {
    const t = setup();
    t.interest.clickBoard();
    t.run(15_000);
    t.interest.clickBoard();
    expect(t.spine.getState().boardOpen).toBe(true);
  });
});

describe('the "Things nearby" list', () => {
  it('glides to a distant prop and does its action when it gets there', () => {
    const t = setup();
    t.interest.actProp('football');
    expect(t.acts).toEqual([]);
    expect(t.controller.gliding).toBe(true);
    t.run(15_000);
    expect(t.acts).toEqual(['football']);
  });

  it('does the action at once for a prop the visitor is standing at', () => {
    const t = setup();
    t.stand('walking-boots');
    t.interest.actProp('walking-boots');
    expect(t.acts).toEqual(['walking-boots']);
  });

  it('turns to face a prop the visitor is standing beside but not looking at, and does the action once it does', () => {
    const t = setup();
    t.stand('walking-boots');
    const pose = t.controller.pose;
    // Turned the other way: the stage will not let the view go further round than about 55 degrees either side.
    t.controller.setPose({ ...pose, yawDeg: pose.yawDeg - 80 });
    t.interest.actProp('walking-boots');
    expect(t.acts).toEqual([]);
    expect(t.controller.gliding).toBe(true);
    t.run(8000);
    expect(t.acts).toEqual(['walking-boots']);
    const station = stationFor(propAnchor(propById('walking-boots')), LENS, bounds);
    expect(Math.abs(t.controller.pose.yawDeg - station.yawDeg)).toBeLessThan(0.5);
  });

  it('does the action at once under reduced motion, after the cut', () => {
    const t = setup({ reduced: true });
    t.interest.actProp('walking-boots');
    expect(t.acts).toEqual(['walking-boots']);
  });

  it('gives up when the visitor takes over on the way', () => {
    const t = setup();
    t.interest.actProp('football');
    t.run(300);
    t.controller.hold('key', 1);
    t.run(100);
    t.controller.hold('key', 0);
    t.run(3000);
    expect(t.acts).toEqual([]);
  });

  it('lists every place and action, wherever the visitor is, nearest first: the notice board and all twelve props', () => {
    const t = setup();
    const places = t.interest.places();
    expect(places).toHaveLength(PROPS.length + 1);
    expect(places.filter((p) => p.kind === 'board')).toHaveLength(1);
    expect(new Set(places.filter((p) => p.kind === 'prop').map((p) => (p as { id: PropId }).id)).size).toBe(PROPS.length);
    const { x, z } = t.controller.pose;
    const dist = (p: (typeof places)[number]) => {
      if (p.kind === 'board') return Math.hypot(boardAnchor().x - x, boardAnchor().z - z);
      const a = propAnchor(propById(p.id));
      return Math.hypot(a.x - x, a.z - z);
    };
    for (let i = 1; i < places.length; i += 1) expect(dist(places[i]!)).toBeGreaterThanOrEqual(dist(places[i - 1]!));
    // From the far end of the corridor the order is different, and the list is the same length.
    t.controller.setPose({ x: 0, z: -18, yawDeg: 0, pitchDeg: 0 });
    const far = t.interest.places();
    expect(far).toHaveLength(PROPS.length + 1);
    expect(far[0]).not.toEqual(places[0]);
  });

  it('reaches every prop: from anywhere the list can take the visitor to it and act, and at its station it acts at once', () => {
    for (const spec of PROPS) {
      const t = setup();
      expect(t.interest.places()).toContainEqual({ kind: 'prop', id: spec.id });
      t.stand(spec.id);
      t.interest.actProp(spec.id);
      expect(t.acts, `${spec.id} acts`).toEqual([spec.id]);
      t.run(ACTION_TIMING[spec.id].riseMs / 2 + FRAME);
      expect(t.animation[spec.id].action, `${spec.id} moves`).toBeGreaterThan(0);
    }
  });

  it('takes the visitor to a prop from across the building and acts when it gets there, for every prop', () => {
    for (const spec of PROPS) {
      const t = setup({ at: { x: 0, z: 7, yawDeg: 0, pitchDeg: 0 } });
      t.interest.actProp(spec.id);
      t.run(60_000);
      expect(t.acts, spec.id).toEqual([spec.id]);
    }
  });

  it('does the action at once for a prop the visitor is within reach of and looking at', () => {
    const t = setup();
    const a = propAnchor(propById('bicycle-wheel'));
    // Two metres from the wheel, looking at it from up the corridor (this view shows the left wall
    // 40 degrees round, not square on), the head tilted to it: seen, so nothing needs to move.
    const yaw = (-40 * Math.PI) / 180;
    const view = {
      x: a.x - 2 * Math.sin(yaw),
      z: a.z + 2 * Math.cos(yaw),
      yawDeg: -40,
      pitchDeg: (Math.atan2(a.y - 1.62, 2) * 180) / Math.PI,
    };
    t.controller.setPose(view);
    t.interest.actProp('bicycle-wheel');
    expect(t.acts).toEqual(['bicycle-wheel']);
    expect(t.controller.gliding).toBe(false);
  });

  it('opens the notice board from the list: takes the visitor to it, and opens it on arrival', () => {
    const t = setup();
    t.interest.actBoard();
    expect(t.spine.getState().boardOpen).toBe(false);
    expect(t.controller.gliding).toBe(true);
    t.run(30_000);
    expect(t.spine.getState().boardOpen).toBe(true);
  });

  it('opens the board at once under reduced motion, after the cut', () => {
    const t = setup({ reduced: true });
    t.interest.actBoard();
    expect(t.spine.getState().boardOpen).toBe(true);
  });
});

describe('the idle glint', () => {
  it('lights the board pin at arrival, once, and clears it', () => {
    const t = setup();
    t.interest.arrived();
    t.run(GLINT.boardMs / 2);
    expect(t.boardMotion.glint).toBeGreaterThan(0.5);
    expect(t.interest.glint?.target).toEqual({ kind: 'board' });
    t.run(GLINT.boardMs);
    expect(t.boardMotion.glint).toBe(0);
    expect(t.interest.glint).toBeNull();
  });

  it('then lights one nearby prop for 600 ms every 18 to 25 s, and never two at once', () => {
    const t = setup();
    t.interest.arrived();
    t.setRoll(0.0);
    let longest = 0;
    let maxAtOnce = 0;
    const starts: number[] = [];
    let lit = 0;
    let at = 0;
    let wasLit = false;
    for (let step = 0; step < 6000; step += 1) {
      t.run(FRAME * 10);
      at += FRAME * 10;
      const bright = PROPS.filter((p) => t.animation[p.id].glint > 0).length + (t.boardMotion.glint > 0 ? 1 : 0);
      maxAtOnce = Math.max(maxAtOnce, bright);
      if (bright > 0 && !wasLit) starts.push(at);
      lit = bright > 0 ? lit + FRAME * 10 : 0;
      longest = Math.max(longest, lit);
      wasLit = bright > 0;
    }
    expect(maxAtOnce).toBeLessThanOrEqual(1);
    expect(starts.length).toBeGreaterThan(5);
    expect(longest).toBeLessThanOrEqual(GLINT.boardMs + 200);
  });

  it('asks the ambient clock for a render window for each glint, and does not glint without one', () => {
    const t = setup();
    t.allowWindows(false);
    t.interest.arrived();
    t.run(60_000);
    expect(t.requests.length).toBeGreaterThan(0);
    expect(t.requests.every((r) => r.id === 'glint')).toBe(true);
    expect(t.interest.glint).toBeNull();
    expect(t.boardMotion.glint).toBe(0);
    t.allowWindows(true);
    t.run(GLINT.retryMs + 200);
    expect(t.requests.at(-1)!.ms).toBeGreaterThanOrEqual(GLINT.boardMs);
  });

  it('never glints under reduced motion', () => {
    const t = setup({ reduced: true });
    t.interest.arrived();
    let ever = false;
    for (let i = 0; i < 6000; i += 1) {
      t.run(FRAME * 10);
      if (t.interest.glint) ever = true;
    }
    expect(ever).toBe(false);
    expect(t.requests).toEqual([]);
  });

  it('holds off while the visitor is busy: walking, hovering, or standing at a framed prop', () => {
    const t = setup();
    t.interest.arrived();
    t.interest.hoverProp('football');
    t.run(GLINT.minGapMs * 3);
    expect(t.interest.glint).toBeNull();
    t.interest.hoverProp(null);
    t.state.canAct = false;
    t.run(GLINT.minGapMs * 3);
    expect(t.interest.glint).toBeNull();
  });

  it('does not light the prop the pointer is on, or one already moving', () => {
    const t = setup();
    t.interest.arrived();
    t.run(2000);
    t.setRoll(0);
    const candidates = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      t.run(GLINT.maxGapMs + 800);
      const g = t.interest.glint;
      if (g) candidates.add(JSON.stringify(g.target));
    }
    expect(candidates.has(JSON.stringify({ kind: 'prop', id: 'chess' }))).toBe(false);
  });

  it('gives a door the gentler level when a door is the one that glints', () => {
    expect(DOOR_GLINT_LEVEL).toBeGreaterThan(0);
    expect(DOOR_GLINT_LEVEL).toBeLessThan(0.6);
  });

  it('says when to wake, so a still scene sleeps between glints', () => {
    const t = setup();
    t.interest.arrived();
    t.run(FRAME);
    t.run(GLINT.boardMs + 200);
    const wake = t.interest.nextWakeMs()!;
    expect(wake).toBeGreaterThan(GLINT.minGapMs - 1500);
    expect(wake).toBeLessThanOrEqual(GLINT.maxGapMs);
  });
});

describe('leaving', () => {
  it('puts everything back to rest', () => {
    const t = setup();
    t.interest.hoverProp('football');
    t.interest.clickProp('football');
    t.run(1000);
    t.interest.reset();
    for (const spec of PROPS) expect(t.animation[spec.id]).toEqual({ attention: 0, action: 0, glint: 0 });
    expect(t.interest.framed).toBeNull();
    expect(t.interest.hovered).toBeNull();
    expect(t.interest.nextWakeMs()).toBeNull();
  });
});
