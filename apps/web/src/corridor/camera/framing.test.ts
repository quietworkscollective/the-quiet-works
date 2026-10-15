import { describe, expect, it } from 'vitest';
import { CORRIDOR, LOBBY, START_VIEW } from '../layout.ts';
import { boardCorners, extentOf, framingOf, horizontalFov, inside, project, visibleWidth, type Lens, type View } from './framing.ts';
import { FOV } from './viewpoints.ts';

/** A lens for a screen of this size in CSS pixels, as the rig chooses it. */
const lens = (width: number, height: number): Lens => ({
  vfovDeg: height > width ? FOV.portrait : FOV.landscape,
  aspect: width / height,
});

/** Screens the starting view is written for: laptops and monitors, and the phones people hold. */
const DESKTOPS = [
  ['16:10 laptop', lens(1440, 900)],
  ['16:9 monitor', lens(1280, 720)],
  ['4:3 window', lens(1024, 768)],
] as const;
const PHONES = [
  ['Pixel 7 (412 x 839)', lens(412, 839)],
  ['iPhone 14 (390 x 844)', lens(390, 844)],
  ['9:16 phone', lens(360, 640)],
] as const;

const TO_AXIS: [number, number, number] = [0, CORRIDOR.eyeHeight, -20];

describe('the projection', () => {
  const view: View = { x: 0, z: 5, yawDeg: 0, pitchDeg: 0 };
  const l: Lens = { vfovDeg: 48, aspect: 1.6 };

  it('puts a point straight ahead in the middle of the picture', () => {
    const p = project(view, l, [0, CORRIDOR.eyeHeight, 0]);
    expect(p?.x).toBeCloseTo(0, 9);
    expect(p?.y).toBeCloseTo(0, 9);
  });

  it('puts the edge of the field of view at +-1', () => {
    const half = horizontalFov(l) / 2;
    const at = (deg: number) => project(view, l, [Math.tan((deg * Math.PI) / 180) * 5, CORRIDOR.eyeHeight, 0]);
    expect(at(half)?.x).toBeCloseTo(1, 6);
    expect(at(-half)?.x).toBeCloseTo(-1, 6);
  });

  it('puts things to the visitor’s right on the right, and things above the eye above the middle', () => {
    expect(project(view, l, [1, CORRIDOR.eyeHeight, 0])?.x).toBeGreaterThan(0);
    expect(project(view, l, [0, CORRIDOR.eyeHeight + 1, 0])?.y).toBeGreaterThan(0);
  });

  it('turns with the yaw: facing the left wall (negative yaw) moves the left wall toward the middle', () => {
    const wall: [number, number, number] = [-2.5, CORRIDOR.eyeHeight, 2];
    const straight = project(view, l, wall)?.x ?? 0;
    const turned = project({ ...view, yawDeg: -30 }, l, wall)?.x ?? 0;
    expect(Math.abs(turned)).toBeLessThan(Math.abs(straight));
  });

  it('looks down with negative pitch: the floor rises in the picture', () => {
    const floor: [number, number, number] = [0, 0, 0];
    expect(project({ ...view, pitchDeg: -10 }, l, floor)?.y).toBeGreaterThan(project(view, l, floor)?.y ?? 0);
  });

  it('returns null for what is behind the eye', () => {
    expect(project(view, l, [0, CORRIDOR.eyeHeight, 9])).toBeNull();
  });
});

describe('the board and the opening', () => {
  it('describe the same board the contract states', () => {
    const corners = boardCorners(0);
    const zs = corners.map((c) => c[2]);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(LOBBY.board.width, 9);
    expect(Math.max(...corners.map((c) => c[1])) - Math.min(...corners.map((c) => c[1]))).toBeCloseTo(LOBBY.board.height, 9);
  });

  it('swivels about the hinged edge with the far end into the room, toward the entrance', () => {
    const flat = boardCorners(0);
    const turned = boardCorners(LOBBY.board.swivelDeg);
    // Corner 0 is the hinged, visitor's-left end (+z); corner 1 is the free edge (-z).
    expect(turned[1]?.[0]).toBeGreaterThan(flat[1]?.[0] ?? 0);
    expect(turned[0]?.[0]).toBeLessThan(flat[0]?.[0] ?? 0);
    expect(turned[0]?.[0]).toBeCloseTo(flat[0]?.[0] ?? 0, 2);
  });
});

describe('the starting view (ADR 0004)', () => {
  const swivels = [0, LOBBY.board.swivelDeg];

  describe.each(DESKTOPS)('on a desktop: %s', (_name, l) => {
    it('has the whole notice board in the first frame, with room to spare', () => {
      for (const swivel of swivels) {
        const { board } = framingOf(START_VIEW.desktop, l, swivel);
        expect(board, `swivel ${swivel}`).not.toBeNull();
        expect(inside(board!, 0.1), `swivel ${swivel}: ${JSON.stringify(board)}`).toBe(true);
      }
    });

    it('has the whole of the corridor’s inner opening in the first frame, and the corridor beyond it', () => {
      const { opening } = framingOf(START_VIEW.desktop, l);
      expect(opening).not.toBeNull();
      expect(inside(opening!, 0.04), JSON.stringify(opening)).toBe(true);
      const axis = project(START_VIEW.desktop, l, TO_AXIS);
      expect(Math.abs(axis?.x ?? 9)).toBeLessThan(0.9);
    });
  });

  describe.each(PHONES)('on a phone: %s', (_name, l) => {
    it('has the whole notice board in the first frame', () => {
      for (const swivel of swivels) {
        const { board } = framingOf(START_VIEW.portrait, l, swivel);
        expect(board, `swivel ${swivel}`).not.toBeNull();
        expect(inside(board!, 0.03), `swivel ${swivel}: ${JSON.stringify(board)}`).toBe(true);
      }
    });

    it('has the corridor in the first frame: most of the inner opening, and the corridor beyond it', () => {
      const { opening } = framingOf(START_VIEW.portrait, l);
      expect(opening).not.toBeNull();
      // The lens is not widened to fit it all: a narrow portrait picture holds the board and the
      // opening only because both are well within it, and the opening’s far edge may be cut.
      expect(visibleWidth(opening!)).toBeGreaterThanOrEqual(0.7);
      expect(opening!.minX).toBeGreaterThan(-0.5);
      const axis = project(START_VIEW.portrait, l, TO_AXIS);
      expect(Math.abs(axis?.x ?? 9)).toBeLessThan(0.9);
    });
  });

  it('stands inside the lobby, with its back to the entrance wall and clear of it', () => {
    for (const view of [START_VIEW.desktop, START_VIEW.portrait]) {
      expect(view.z).toBeGreaterThan(CORRIDOR.innerDoorZ + 3);
      expect(view.z).toBeLessThanOrEqual(LOBBY.startZ - 1.2);
      expect(Math.abs(view.x)).toBeLessThan(LOBBY.width / 2 - 1);
    }
  });

  it('stays within half a metre and five degrees of the candidates in art consult 5', () => {
    const candidates = {
      desktop: { x: 0.35, z: 6.5, yawDeg: -12, pitchDeg: -2 },
      portrait: { x: 0.45, z: 9.4, yawDeg: -9, pitchDeg: -1 },
    };
    for (const kind of ['desktop', 'portrait'] as const) {
      const v = START_VIEW[kind];
      const c = candidates[kind];
      expect(Math.abs(v.x - c.x), `${kind} x`).toBeLessThanOrEqual(0.5 + 1e-9);
      expect(Math.abs(v.z - c.z), `${kind} z`).toBeLessThanOrEqual(0.5 + 1e-9);
      expect(Math.abs(v.yawDeg - c.yawDeg), `${kind} yaw`).toBeLessThanOrEqual(5 + 1e-9);
      expect(Math.abs(v.pitchDeg - c.pitchDeg), `${kind} pitch`).toBeLessThanOrEqual(5 + 1e-9);
    }
  });

  it('reports a box for a set of points and nothing when one is behind the eye', () => {
    const l = lens(1280, 720);
    expect(extentOf(START_VIEW.desktop, l, boardCorners())).not.toBeNull();
    expect(extentOf(START_VIEW.desktop, l, [[0, 1, 99]])).toBeNull();
  });
});
