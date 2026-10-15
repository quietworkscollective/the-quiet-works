import { describe, expect, it } from 'vitest';
import { contains } from '../../firstPerson/bounds.ts';
import { CORRIDOR, LOBBY } from '../layout.ts';
import { PROPS } from '../props.ts';
import { placementOf } from '../world/props/placement.ts';
import { extentOf, inside, project, type Lens } from './framing.ts';
import {
  boardAnchor,
  boardCorners,
  boxCorners,
  doorCorners,
  propAnchor,
  propById,
  stationFor,
  stationYawCapDeg,
} from './stations.ts';
import { corridorBounds, FOV } from './viewpoints.ts';

const DESKTOP: Lens = { vfovDeg: FOV.landscape, aspect: 1.6 };
const PHONE: Lens = { vfovDeg: FOV.portrait, aspect: 412 / 839 };
const LENSES = [
  ['a laptop', DESKTOP],
  ['a phone', PHONE],
] as const;
const bounds = corridorBounds();

describe('prop anchors', () => {
  it('stand where the props lane built the props, not where the contract first put them', () => {
    for (const spec of PROPS) {
      const placed = placementOf(spec.id);
      expect(propAnchor(spec).z, spec.id).toBe(placed.z);
    }
    // The bicycle wheel was moved 2.8 m along its wall, out of the Tomorrow Engine's door opening.
    expect(propAnchor(propById('bicycle-wheel')).z).toBeCloseTo(-13.0 + 2.8, 6);
  });

  it('put every prop on its own wall, inside the building, against it', () => {
    for (const spec of PROPS) {
      const a = propAnchor(spec);
      const half = spec.bay === 'lobby' ? LOBBY.width / 2 : CORRIDOR.width / 2;
      const side = spec.side === 'right' ? 1 : -1;
      expect(Math.sign(a.x), spec.id).toBe(side);
      expect(Math.abs(a.x) + a.depth / 2, spec.id).toBeCloseTo(half, 9);
      expect(a.nx, spec.id).toBe(-side);
      expect(a.nz).toBe(0);
    }
  });

  it('stand floor props on the floor and hang the rest at their stated height', () => {
    expect(propAnchor(propById('walking-boots')).y).toBeCloseTo(0.15, 9);
    // The contract hangs the wheel at 1.5 m; the props lane hangs it 0.1 m higher (`MOVES`), and the anchor follows the built one.
    expect(propAnchor(propById('bicycle-wheel')).y).toBe(placementOf('bicycle-wheel').height);
    expect(propAnchor(propById('bicycle-wheel')).y).toBeGreaterThanOrEqual(propById('bicycle-wheel').height);
  });

  it('place lobby props within the lobby and bay props within their bay', () => {
    for (const spec of PROPS) {
      const a = propAnchor(spec);
      if (spec.bay === 'lobby') {
        expect(a.z, spec.id).toBeGreaterThan(CORRIDOR.innerDoorZ);
        expect(a.z, spec.id).toBeLessThan(LOBBY.startZ);
      } else {
        expect(a.z, spec.id).toBeLessThan(CORRIDOR.innerDoorZ);
      }
    }
  });
});

describe.each(LENSES)('the framing stations on %s', (_name, lens) => {
  it('are inside the walkable ground', () => {
    for (const spec of PROPS) {
      const s = stationFor(propAnchor(spec), lens, bounds);
      expect(contains(bounds, s), spec.id).toBe(true);
    }
    expect(contains(bounds, stationFor(boardAnchor(), lens, bounds))).toBe(true);
  });

  it('look at each prop from up the corridor with a little wall around it', () => {
    const cap = stationYawCapDeg(lens);
    for (const spec of PROPS) {
      const anchor = propAnchor(spec);
      const s = stationFor(anchor, lens, bounds);
      // Keep an oblique composition on the side of the wall the prop is on, from behind it.
      expect(Math.abs(s.yawDeg), spec.id).toBeLessThanOrEqual(cap + 1e-6);
      expect(Math.abs(s.yawDeg), spec.id).toBeGreaterThan(cap - 2);
      expect(Math.sign(s.yawDeg), spec.id).toBe(-anchor.nx);
      expect(s.z, spec.id).toBeGreaterThan(anchor.z);
      expect(s.pitchDeg, spec.id).toBeGreaterThanOrEqual(-25);
      expect(s.pitchDeg, spec.id).toBeLessThanOrEqual(25);
      const at = project(s, lens, [anchor.x, anchor.y, anchor.z]);
      expect(at, spec.id).not.toBeNull();
      expect(Math.abs(at!.x), `${spec.id} across`).toBeLessThan(0.2);
      expect(Math.abs(at!.y), `${spec.id} up`).toBeLessThan(0.7);
    }
  });

  it('keeps the composed angle consistent across screen shapes', () => {
    expect(stationYawCapDeg(lens)).toBe(40);
    for (const spec of PROPS) expect(Math.abs(stationFor(propAnchor(spec), lens, bounds).yawDeg), spec.id).toBeLessThanOrEqual(40 + 1e-6);
    expect(Math.abs(stationFor(boardAnchor(), lens, bounds).yawDeg)).toBeLessThanOrEqual(40 + 1e-6);
  });

  it('put the whole of each prop inside the picture with room around it', () => {
    for (const spec of PROPS) {
      const anchor = propAnchor(spec);
      const s = stationFor(anchor, lens, bounds);
      const box = extentOf(s, lens, boxCorners(anchor));
      expect(box, spec.id).not.toBeNull();
      expect(inside(box!, 0.02), `${spec.id}: ${JSON.stringify(box)}`).toBe(true);
    }
  });

  it('frame the whole notice board', () => {
    const s = stationFor(boardAnchor(), lens, bounds);
    const box = extentOf(s, lens, boardCorners());
    expect(box).not.toBeNull();
    expect(inside(box!, 0.05), JSON.stringify(box)).toBe(true);
  });

  it('look at the board from the lobby\u2019s side nearest its face, at the chosen oblique angle', () => {
    const s = stationFor(boardAnchor(), lens, bounds);
    const cap = stationYawCapDeg(lens);
    // The board faces +x turned 15 degrees toward the entrance: the station is up the lobby from it, and
    // the view is left of the axis by the cap.
    expect(s.yawDeg).toBeLessThan(0);
    expect(Math.abs(s.yawDeg)).toBeLessThanOrEqual(cap + 1e-6);
    expect(Math.abs(s.yawDeg)).toBeGreaterThan(cap - 2);
    expect(s.z).toBeGreaterThan(boardAnchor().z);
  });

  it('stands further from a floor prop than from a hanging one, to look down at it gently', () => {
    const boots = stationFor(propAnchor(propById('walking-boots')), lens, bounds);
    const wheel = stationFor(propAnchor(propById('bicycle-wheel')), lens, bounds);
    const away = (s: { x: number; z: number }, id: 'walking-boots' | 'bicycle-wheel') =>
      Math.hypot(s.x - propAnchor(propById(id)).x, s.z - propAnchor(propById(id)).z);
    expect(away(boots, 'walking-boots')).toBeGreaterThan(away(wheel, 'bicycle-wheel'));
  });
});

describe('door corners', () => {
  it('are on the wall the door is set in, at the door', () => {
    const corners = doorCorners('certification-office', 2.3, 0.9);
    for (const c of corners) expect(c[0]).toBeCloseTo(CORRIDOR.width / 2 - 0.02, 9);
    expect(Math.max(...corners.map((c) => c[1]))).toBe(2.3);
  });
});
