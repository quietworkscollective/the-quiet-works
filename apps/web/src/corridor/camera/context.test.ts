import { describe, expect, it } from 'vitest';
import { CHAMBER_SLOTS, CORRIDOR, START_VIEW } from '../layout.ts';
import { PROPS } from '../props.ts';
import { candidates, find, gazeAngleDeg, reachOf, unobstructed } from './context.ts';
import { sameCueTarget, type CueTarget } from './cueText.ts';
import { CUE_TUNING } from './cueTuning.ts';
import type { Lens, View } from './framing.ts';
import { boardAnchor, propAnchor, propById } from './stations.ts';
import { doorFrame, FOV } from './viewpoints.ts';

const list = candidates();
const BOARD: CueTarget = { kind: 'board' };

/** A view `distance` metres out from a wall object, facing it squarely, `offDeg` turned away. */
function facing(at: { x: number; z: number; nx: number; nz: number }, distance: number, offDeg = 0): View {
  const x = at.x + at.nx * distance;
  const z = at.z + at.nz * distance;
  const yaw = (Math.atan2(-at.nx, at.nz) * 180) / Math.PI;
  return { x, z, yawDeg: yaw + offDeg, pitchDeg: 0 };
}
/** The same view tilted to look straight at `y` (the eye is 1.62 m up). */
const tilted = (view: View, at: { x: number; z: number }, y: number): View => ({
  ...view,
  pitchDeg: (Math.atan2(y - CORRIDOR.eyeHeight, Math.hypot(at.x - view.x, at.z - view.z)) * 180) / Math.PI,
});
const boardAt = () => {
  const b = boardAnchor();
  return { x: b.x, z: b.z, nx: b.nx, nz: b.nz };
};

describe('the tuning (art consult 6)', () => {
  it('is 2.2 m (3 m for doors and large destinations), a 25 degree half-angle, 250 ms to settle and 120 ms to fade in', () => {
    expect(CUE_TUNING.reachM).toBe(2.2);
    expect(CUE_TUNING.reachLargeM).toBe(3);
    expect(CUE_TUNING.gazeDeg).toBe(25);
    expect(CUE_TUNING.dwellMs).toBe(250);
    expect(CUE_TUNING.fadeInMs).toBe(120);
  });

  it('drops a label beyond 2.7 m, outside 35 degrees, or after 350 ms occluded', () => {
    expect(CUE_TUNING.leaveReachM).toBe(2.7);
    expect(CUE_TUNING.leaveGazeDeg).toBe(35);
    expect(CUE_TUNING.occludedMs).toBe(350);
  });

  it('keeps the label 16 to 24 px from the fitting, in 16 to 18 px type, with a 44 px target', () => {
    expect(CUE_TUNING.labelOffsetPx).toBeGreaterThanOrEqual(16);
    expect(CUE_TUNING.labelOffsetPx).toBeLessThanOrEqual(24);
    expect(CUE_TUNING.labelFontPx).toBeGreaterThanOrEqual(16);
    expect(CUE_TUNING.labelFontPx).toBeLessThanOrEqual(18);
    expect(CUE_TUNING.labelMinTargetPx).toBeGreaterThanOrEqual(44);
  });

  it('lets go later than it takes hold, for large destinations too', () => {
    expect(CUE_TUNING.leaveReachM).toBeGreaterThan(CUE_TUNING.reachM);
    expect(CUE_TUNING.leaveReachLargeM).toBeGreaterThan(CUE_TUNING.reachLargeM);
    expect(CUE_TUNING.leaveGazeDeg).toBeGreaterThan(CUE_TUNING.gazeDeg);
  });
});

describe('what can be found', () => {
  it('is the chamber doors, the board and every prop, and no blank door', () => {
    expect(list.filter((c) => c.target.kind === 'door')).toHaveLength(CHAMBER_SLOTS.filter((s) => s.chamber).length);
    expect(list.filter((c) => c.target.kind === 'board')).toHaveLength(1);
    expect(list.filter((c) => c.target.kind === 'prop')).toHaveLength(PROPS.length);
  });

  it('counts doors, the board and the big props as large destinations, and the small props not', () => {
    const large = (t: CueTarget) => list.find((c) => sameCueTarget(c.target, t))!.large;
    expect(large(BOARD)).toBe(true);
    expect(large({ kind: 'door', id: 'certification-office' })).toBe(true);
    expect(large({ kind: 'prop', id: 'trophy-cabinet' })).toBe(true);
    expect(large({ kind: 'prop', id: 'football' })).toBe(false);
    expect(large({ kind: 'prop', id: 'work-glove' })).toBe(false);
  });
});

describe('the angle from the centre of view', () => {
  it('is nothing straight ahead, 90 degrees to the side and 180 behind', () => {
    const view: View = { x: 0, z: 0, yawDeg: 0, pitchDeg: 0 };
    expect(gazeAngleDeg(view, [0, 1.62, -5])).toBeCloseTo(0, 6);
    expect(gazeAngleDeg(view, [3, 1.62, 0])).toBeCloseTo(90, 6);
    expect(gazeAngleDeg(view, [0, 1.62, 4])).toBeCloseTo(180, 6);
  });

  it('follows the heading and the pitch', () => {
    expect(gazeAngleDeg({ x: 0, z: 0, yawDeg: 90, pitchDeg: 0 }, [3, 1.62, 0])).toBeCloseTo(0, 6);
    expect(gazeAngleDeg({ x: 0, z: 0, yawDeg: 0, pitchDeg: -45 }, [0, 1.62 - 2, -2])).toBeCloseTo(0, 4);
  });

  it('measures reach along the floor, not through the eye height', () => {
    expect(reachOf({ x: 0, z: 0, yawDeg: 0, pitchDeg: 0 }, [3, 0.1, 4])).toBe(5);
  });
});

describe('finding something', () => {
  it('finds nothing from the starting view: the board is four metres off', () => {
    for (const view of [START_VIEW.desktop, START_VIEW.portrait]) expect(find(view, list)).toBeNull();
  });

  it('finds the board (a large destination) from 3 m, looking at it, and not a step beyond', () => {
    expect(find(facing(boardAt(), 2.9), list)?.target).toEqual(BOARD);
    expect(find(facing(boardAt(), 3.1), list)).toBeNull();
  });

  it('finds a small prop from 2.2 m and not beyond', () => {
    const a = propAnchor(propById('football'));
    const at = { x: a.x, z: a.z, nx: a.nx, nz: a.nz };
    expect(find(facing(at, 2.1), list)?.target).toEqual({ kind: 'prop', id: 'football' });
    expect(find(facing(at, 2.4), list)).toBeNull();
  });

  it('finds it only inside a 25 degree half-angle around the view direction', () => {
    expect(find(facing(boardAt(), 2.0, 22), list)?.target).toEqual(BOARD);
    expect(find(facing(boardAt(), 2.0, 28), list)).toBeNull();
    expect(find(facing(boardAt(), 2.0, 180), list)).toBeNull();
  });

  it('finds a prop the visitor has walked up to and is looking at, wherever it is', () => {
    for (const spec of PROPS) {
      const a = propAnchor(spec);
      // Looking at it: facing it, the head tilted to its height, as the framing station does.
      const view = tilted(facing({ x: a.x, z: a.z, nx: a.nx, nz: a.nz }, 1.8), a, a.y);
      expect(find(view, list)?.target, spec.id).toEqual({ kind: 'prop', id: spec.id });
    }
  });

  it('finds a chamber door from the place the door view puts the visitor', () => {
    for (const slot of CHAMBER_SLOTS) {
      if (!slot.chamber) continue;
      const view: View = doorFrame(slot.chamber);
      expect(find(view, list)?.target, slot.chamber).toEqual({ kind: 'door', id: slot.chamber });
    }
  });

  it('finds nothing walking down the middle of the corridor, looking along it', () => {
    for (let z = -2; z > -18; z -= 0.5) expect(find({ x: 0, z, yawDeg: 0, pitchDeg: 0 }, list), `z ${z}`).toBeNull();
  });

  it('needs the thing on screen: a phone, whose picture is narrow, does not label what is off its edge', () => {
    const lens: Lens = { vfovDeg: FOV.portrait, aspect: 412 / 839 };
    // The board 20 degrees off the centre is inside the 25 degree half-angle but outside a phone's picture.
    const view = facing(boardAt(), 2.0, 20);
    expect(find(view, list)?.target).toEqual(BOARD);
    expect(find(view, list, { lens })).toBeNull();
    expect(find(facing(boardAt(), 2.0, 5), list, { lens })?.target).toEqual(BOARD);
  });

  it('picks the thing nearest the centre of view when two are in reach', () => {
    const a = propAnchor(propById('football'));
    const b = propAnchor(propById('cricket-bat'));
    const atA = tilted({ x: 0, z: a.z, yawDeg: -90, pitchDeg: 0 }, a, a.y);
    const atB = tilted({ x: 0, z: b.z, yawDeg: -90, pitchDeg: 0 }, b, b.y);
    expect(find(atA, list)?.target).toEqual({ kind: 'prop', id: 'football' });
    expect(find(atB, list)?.target).toEqual({ kind: 'prop', id: 'cricket-bat' });
  });
});

describe('a wall in the way', () => {
  it('blocks the line from the lobby to the corridor except through the inner opening', () => {
    const eye = { x: 0, z: 3, yawDeg: 0, pitchDeg: 0 };
    expect(unobstructed(eye, [0, 1.3, -3])).toBe(true);
    expect(unobstructed({ ...eye, x: 2 }, [1.5, 1.3, -1])).toBe(false);
    expect(unobstructed({ ...eye, x: 0.5 }, [1.55, 1.3, -1.2])).toBe(true);
  });

  it('keeps the line inside the building: nothing is seen through a side wall', () => {
    expect(unobstructed({ x: 0, z: -5, yawDeg: 0, pitchDeg: 0 }, [3, 1.3, -5])).toBe(false);
    expect(unobstructed({ x: 0, z: -5, yawDeg: 0, pitchDeg: 0 }, [1.55, 1.3, -5])).toBe(true);
  });

  it('reports a thing behind the end wall as blocked, though it is in reach and in the middle of the view', () => {
    // From just inside the corridor, looking into the lobby past the opening's jamb at a prop on the end wall's far side.
    const view: View = { x: 1.5, z: 0.4, yawDeg: 180, pitchDeg: 0 };
    const probe = [{ target: { kind: 'prop', id: 'trophy-cabinet' } as CueTarget, at: [1.5, 1.3, 1.5] as [number, number, number], large: true }];
    expect(find(view, probe)?.blocked).toBe(true);
    // The same prop seen through the opening is in the clear.
    expect(find({ ...view, x: 0.5 }, [{ ...probe[0]!, at: [0.5, 1.3, 1.5] }])?.blocked).toBe(false);
  });
});

describe('holding on to what was found', () => {
  it('keeps it a little beyond where it was first found (2.7 m small, 3.5 m large), but does not find it there afresh', () => {
    const a = propAnchor(propById('football'));
    const at = { x: a.x, z: a.z, nx: a.nx, nz: a.nz };
    const prop: CueTarget = { kind: 'prop', id: 'football' };
    expect(find(facing(at, 2.5), list)).toBeNull();
    expect(find(facing(at, 2.5), list, { previous: prop })?.target).toEqual(prop);
    expect(find(facing(at, 2.9), list, { previous: prop })).toBeNull();
    expect(find(facing(boardAt(), 3.3), list)).toBeNull();
    expect(find(facing(boardAt(), 3.3), list, { previous: BOARD })?.target).toEqual(BOARD);
    expect(find(facing(boardAt(), 3.7), list, { previous: BOARD })).toBeNull();
  });

  it('keeps it a little further off the centre than it was found: out to 35 degrees', () => {
    expect(find(facing(boardAt(), 2.0, 30), list)).toBeNull();
    expect(find(facing(boardAt(), 2.0, 30), list, { previous: BOARD })?.target).toEqual(BOARD);
    expect(find(facing(boardAt(), 2.0, 38), list, { previous: BOARD })).toBeNull();
  });

  it('hands the label to another thing only when it is clearly closer to the centre of view', () => {
    // Two small things on the left wall, a metre apart, seen from 1.5 m out.
    const one: CueTarget = { kind: 'prop', id: 'football' };
    const two: CueTarget = { kind: 'prop', id: 'cricket-bat' };
    const pair = [
      { target: one, at: [-1.5, 1.62, -5] as [number, number, number], large: false },
      { target: two, at: [-1.5, 1.62, -6] as [number, number, number], large: false },
    ];
    const at = (z: number): View => ({ x: 0, z, yawDeg: -90, pitchDeg: 0 });
    // Nearer the first: it is the one.
    expect(find(at(-5.1), pair)?.target).toEqual(one);
    // Walking toward the second: it draws level, then a little ahead, but not clearly: the label stays.
    expect(find(at(-5.5), pair, { previous: one })?.target).toEqual(one);
    expect(find(at(-5.55), pair, { previous: one })?.target).toEqual(one);
    // Clearly nearer the second (by more than the margin): the label moves.
    expect(find(at(-5.9), pair, { previous: one })?.target).toEqual(two);
    // And back: the same margin the other way.
    expect(find(at(-5.45), pair, { previous: two })?.target).toEqual(two);
    expect(find(at(-5.1), pair, { previous: two })?.target).toEqual(one);
    expect(CUE_TUNING.switchGainDeg).toBeGreaterThan(0);
  });
});
