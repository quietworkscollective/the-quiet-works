import { CHAMBERS, CORRIDOR_PROPS } from '@tqw/engine';
import { describe, expect, it } from 'vitest';
import { boardAnchor, propAnchor, propById } from './stations.ts';
import { FRAME, inCorridor, OFFICE, rig } from './testkit.ts';
import { doorFrame } from './viewpoints.ts';

/** ADR 0004 through the director: the board pin's glint at arrival, the cue near an object, and acting on props. */

describe('arriving at the starting view', () => {
  it('lights the board pin once, for 800 ms, and then leaves it alone', () => {
    const r = inCorridor();
    let peak = 0;
    let litFrames = 0;
    r.run(800 + 400, () => {
      peak = Math.max(peak, r.boardMotion.glint);
      if (r.boardMotion.glint > 0) litFrames += 1;
    });
    expect(peak).toBeGreaterThan(0.95);
    expect(litFrames * FRAME).toBeGreaterThan(800 - 100);
    expect(litFrames * FRAME).toBeLessThan(800 + 100);
    expect(r.boardMotion.glint).toBe(0);
    // The next glint is a full quiet interval away.
    let again = false;
    r.run(18_000 - 2000, () => {
      if (r.boardMotion.glint > 0) again = true;
    });
    expect(again).toBe(false);
  });

  it('waits until the walk-in has handed over: nothing glints on the landing', () => {
    const r = rig({ progress: 0.3 });
    let lit = false;
    r.run(18_000 * 2, () => {
      if (r.boardMotion.glint > 0) lit = true;
    });
    expect(lit).toBe(false);
  });

  it('does not glint under reduced motion, at arrival or after', () => {
    const r = inCorridor({ reduced: true });
    let lit = false;
    r.run(18_000 * 4, () => {
      if (r.boardMotion.glint > 0) lit = true;
    });
    expect(lit).toBe(false);
  });

  it('tells the shell the visitor has arrived, once, and not before the hand-over', () => {
    const r = rig({ progress: 0.3 });
    r.run(2000);
    expect(r.log.arrivals).toBe(0);
    r.progress.set(1);
    r.d.setEngaged(true);
    r.spine.dispatch({ type: 'ENTRANCE_DONE' });
    r.run(8000);
    expect(r.log.arrivals).toBe(1);
    r.run(60_000);
    expect(r.log.arrivals).toBe(1);
  });
});

/** Runs frames as the rig does: the cue is asked for after every step. */
const runCue = (r: ReturnType<typeof inCorridor>, ms: number): void => r.run(ms, () => r.d.cue());

/** The yaw at which the framing stations look at a wall's object (see `DOOR_VIEW_YAW_DEG`). */
const OBLIQUE_YAW = 40;

/**
 * Puts the visitor 2 m from the board, looking at it (head tilted to it) from up the lobby: the
 * stage keeps the view within about 55 degrees of the axis, so the board is seen 40 degrees to
 * the left, as its framing station does.
 */
function standAtBoard(r: ReturnType<typeof inCorridor>, distance = 2): void {
  const b = boardAnchor();
  const yaw = -OBLIQUE_YAW;
  const pitch = (Math.atan2(b.y - 1.62, distance) * 180) / Math.PI;
  r.d.controller.setPose({
    x: b.x - distance * Math.sin((yaw * Math.PI) / 180),
    z: b.z + distance * Math.cos((yaw * Math.PI) / 180),
    yawDeg: yaw,
    pitchDeg: pitch,
  });
}

describe('the cue near an object (contextual: found, not hovered)', () => {
  it('is nothing from the starting view, with the pointer on a door, the board or a prop: hovering alone shows no label', () => {
    const r = inCorridor();
    r.settle();
    expect(r.d.cue()).toBeNull();
    r.d.setHover(OFFICE);
    r.d.interest.hoverBoard(true);
    r.d.interest.hoverProp('bicycle-wheel');
    runCue(r, 2000);
    expect(r.d.cue()).toBeNull();
  });

  it('appears when the visitor has walked up to the board and is looking at it, after 250 ms of steady targeting', () => {
    const r = inCorridor();
    r.settle();
    standAtBoard(r);
    expect(r.d.cue()).toBeNull();
    runCue(r, 200);
    expect(r.d.cue()).toBeNull();
    runCue(r, 80);
    expect(r.d.cue()).toMatchObject({ target: { kind: 'board' }, text: 'Read notices', framed: false, focused: false, visible: true });
  });

  it('does not appear for a visitor only passing: a target lost before the wait is over starts it again', () => {
    const r = inCorridor();
    r.settle();
    standAtBoard(r);
    runCue(r, 200);
    r.d.controller.setPose({ ...r.d.pose, yawDeg: r.d.pose.yawDeg + 90 });
    runCue(r, 100);
    standAtBoard(r);
    runCue(r, 200);
    expect(r.d.cue()).toBeNull();
    runCue(r, 100);
    expect(r.d.cue()?.target).toEqual({ kind: 'board' });
  });

  it('is a door\u2019s own label from the place the door view puts the visitor: open doors say so, sealed doors say they are not yet open', () => {
    for (const chamber of CHAMBERS) {
      const r = inCorridor();
      r.settle();
      const f = doorFrame(chamber.id);
      r.d.controller.setPose(f);
      runCue(r, 300);
      expect(r.d.cue()?.target, chamber.id).toEqual({ kind: 'door', id: chamber.id });
      expect(r.d.cue()?.text, chamber.id).toBe(
        chamber.status === 'open' ? `${chamber.title}, open the door` : CORRIDOR_PROPS.sealedDoor,
      );
    }
  });

  it('is a prop\u2019s verb from up the corridor, looking at it', () => {
    const r = inCorridor();
    r.settle();
    const a = propAnchor(propById('bicycle-wheel'));
    // The wheel is on the left wall: seen 40 degrees to the left from 1.5 m away.
    const yaw = -OBLIQUE_YAW;
    r.d.controller.setPose({
      x: a.x - 1.5 * Math.sin((yaw * Math.PI) / 180),
      z: a.z + 1.5 * Math.cos((yaw * Math.PI) / 180),
      yawDeg: yaw,
      pitchDeg: (Math.atan2(a.y - 1.62, 1.5) * 180) / Math.PI,
    });
    runCue(r, 300);
    expect(r.d.cue()).toMatchObject({ target: { kind: 'prop', id: 'bicycle-wheel' }, text: CORRIDOR_PROPS.verbs['bicycle-wheel'] });
  });

  it('fades out over 120 ms once the visitor turns away or steps back, and is then gone', () => {
    const r = inCorridor();
    r.settle();
    standAtBoard(r);
    runCue(r, 300);
    expect(r.d.cue()?.visible).toBe(true);
    r.d.controller.setPose({ ...r.d.pose, yawDeg: r.d.pose.yawDeg + 90 });
    expect(r.d.cue()).toMatchObject({ target: { kind: 'board' }, visible: false });
    runCue(r, 130);
    expect(r.d.cue()).toBeNull();
  });

  it('does not fade under reduced motion: a label that is dropped is gone at once', () => {
    const r = inCorridor({ reduced: true });
    r.settle();
    standAtBoard(r);
    runCue(r, 300);
    expect(r.d.cue()?.visible).toBe(true);
    r.d.controller.setPose({ ...r.d.pose, yawDeg: r.d.pose.yawDeg + 90 });
    expect(r.d.cue()).toBeNull();
  });

  it('keeps a label through a stray look and drops it beyond 35 degrees: no flicker at the edge of the view', () => {
    const r = inCorridor();
    r.settle();
    standAtBoard(r);
    runCue(r, 300);
    r.d.controller.setPose({ ...r.d.pose, yawDeg: r.d.pose.yawDeg + 30 });
    expect(r.d.cue()).toMatchObject({ target: { kind: 'board' }, visible: true });
    r.d.controller.setPose({ ...r.d.pose, yawDeg: r.d.pose.yawDeg + 10 });
    expect(r.d.cue()?.visible).toBe(false);
  });

  it('becomes a button to press, at once, once the visitor is sent to the object and has arrived', () => {
    const r = inCorridor();
    r.settle();
    r.d.interest.clickBoard();
    // On its way there is no label: it comes with the arrival.
    expect(r.d.cue()).toBeNull();
    r.settle();
    expect(r.d.cue()).toMatchObject({ target: { kind: 'board' }, framed: true, visible: true });
    r.d.interest.clickBoard();
    expect(r.spine.getState().boardOpen).toBe(true);
    expect(r.d.cue()).toBeNull();
  });

  it('gives keyboard focus priority over a framed object, and a framed one over what was found', () => {
    const r = inCorridor();
    r.settle();
    r.d.interest.clickProp('football');
    r.settle();
    expect(r.d.cue()).toMatchObject({ target: { kind: 'prop', id: 'football' }, framed: true });
    r.d.setFocusTarget({ kind: 'prop', id: 'chess' });
    expect(r.d.cue()).toMatchObject({ target: { kind: 'prop', id: 'chess' }, focused: true });
    r.d.setFocusTarget({ kind: 'board' });
    expect(r.d.cue()).toMatchObject({ target: { kind: 'board' }, focused: true });
    r.d.setFocusTarget(null);
    expect(r.d.cue()).toMatchObject({ framed: true });
  });

  it('never takes a focused control\u2019s label away because the visitor has moved off or a timer ran out', () => {
    const r = inCorridor();
    r.settle();
    r.d.setFocusTarget({ kind: 'prop', id: 'chess' });
    runCue(r, 60_000);
    expect(r.d.cue()).toMatchObject({ target: { kind: 'prop', id: 'chess' }, focused: true, visible: true });
  });

  it('goes while a door opens or the board is open, and on the landing', () => {
    const r = rig();
    r.d.setHover(OFFICE);
    expect(r.d.cue()).toBeNull();
    const c = inCorridor();
    c.settle();
    standAtBoard(c);
    runCue(c, 300);
    expect(c.d.cue()).not.toBeNull();
    c.spine.dispatch({ type: 'OPEN_BOARD' });
    expect(c.d.cue()).toBeNull();
  });

  it('says when a label would settle or fade with no frame drawn, so a still scene gets it up to date', () => {
    const r = inCorridor();
    r.settle();
    standAtBoard(r);
    r.d.cue();
    expect(r.d.nextWakeMs()).toBeGreaterThan(0);
    expect(r.d.nextWakeMs()).toBeLessThanOrEqual(250);
  });
});

describe('acting on things from the director', () => {
  it('sends the visitor to a distant prop and runs its action on the next click', () => {
    const r = inCorridor();
    r.settle();
    r.d.interest.clickProp('football');
    r.settle();
    expect(r.log.acts).toEqual([]);
    r.d.interest.clickProp('football');
    expect(r.log.acts).toEqual(['football']);
    r.run(2000);
    expect(r.props['football'].action).toBe(1);
  });

  it('draws frames while an action runs, and none while it holds', () => {
    const r = inCorridor();
    r.settle();
    r.d.interest.clickProp('football');
    r.settle();
    r.d.interest.clickProp('football');
    expect(r.d.step(FRAME)).toBe(true);
    r.run(1700);
    // Holding at 1: nothing moves, so no frame is asked for, and the shell is told when to wake.
    expect(r.d.step(FRAME)).toBe(false);
    expect(r.d.nextWakeMs()).toBeGreaterThan(0);
    expect(r.d.nextWakeMs()).toBeLessThan(800);
  });

  it('forgets a framed prop when the visitor leaves for a door', () => {
    const r = inCorridor();
    r.settle();
    r.d.interest.clickProp('football');
    r.settle();
    r.spine.dispatch({ type: 'FOCUS_DOOR', id: OFFICE });
    expect(r.d.interest.framed).toBeNull();
  });

  it('puts everything back to rest when the visitor leaves the corridor for a chamber', () => {
    const r = inCorridor();
    r.settle();
    r.d.interest.hoverProp('football');
    r.run(300);
    expect(r.props.football.attention).toBe(1);
    r.spine.dispatch({ type: 'OPEN_DOOR', id: OFFICE, via: 'board' });
    expect(r.props.football.attention).toBe(0);
  });

  it('lists every place and action', () => {
    const r = inCorridor();
    r.settle();
    expect(r.d.places()).toHaveLength(13);
  });
});
