import { describe, expect, it } from 'vitest';
import { PROPS } from '../props.ts';
import { CUE_TUNING } from './cueTuning.ts';
import { handoverPose } from './viewpoints.ts';
import { placement, targetCorners } from './place.ts';
import type { Lens } from './framing.ts';
import { boardAnchor, propAnchor, propById, stationFor } from './stations.ts';
import { corridorBounds } from './viewpoints.ts';

const SIZE = { width: 1280, height: 720 };
const LENS: Lens = { vfovDeg: 48, aspect: 1280 / 720 };
const LABEL = { width: 200, height: 30 };
const doorSize = () => ({ width: 0.9, height: 2.3 });

describe('placing a label beside the object', () => {
  const corners = targetCorners({ kind: 'board' }, doorSize);
  const box = (view: Parameters<typeof placement>[1]) => {
    const p = placement(corners, view, LENS, SIZE, LABEL, { ring: true });
    return { p, ring: p.ring! };
  };

  it('stands 20 px to the right of the object when there is room, centred on it, and never over it', () => {
    // Looking so the board is well to the left of the picture, with room on its right.
    const view = { ...handoverPose(false) };
    const { p, ring } = box(view);
    expect(p.label?.side).toBe('right');
    // The ring is the object's box grown 5 px: the label starts a fixed offset beyond the object's own edge.
    expect(p.label!.x).toBeCloseTo(ring.x + ring.w - 5 + CUE_TUNING.labelOffsetPx, 6);
    expect(p.label!.x).toBeGreaterThan(ring.x + ring.w - 5);
    expect(p.label!.y).toBeCloseTo(ring.y + ring.h / 2, 0);
  });

  it('keeps the offset between 16 and 24 px', () => {
    const { p, ring } = box(handoverPose(false));
    const gap = p.label!.x - (ring.x + ring.w - 5);
    expect(gap).toBeGreaterThanOrEqual(16);
    expect(gap).toBeLessThanOrEqual(24);
  });

  it('goes above when there is room on neither side', () => {
    const narrow = placement(corners, handoverPose(false), LENS, { width: 330, height: 720 }, { width: 300, height: 44 });
    expect(narrow.label?.side).toBe('above');
  });

  it('never covers the object, on any side, at any heading or size of picture', () => {
    for (const size of [SIZE, { width: 900, height: 720 }, { width: 412, height: 839 }]) {
      for (let yaw = -55; yaw <= 5; yaw += 5) {
        const view = { ...handoverPose(false), yawDeg: yaw };
        const p = placement(corners, view, LENS, size, LABEL, { ring: true });
        if (!p.label || !p.ring) continue;
        const o = { l: p.ring.x + 5, r: p.ring.x + p.ring.w - 5, t: p.ring.y + 5, b: p.ring.y + p.ring.h - 5 };
        const { x, y, side } = p.label;
        const rect =
          side === 'right'
            ? { l: x, r: x + LABEL.width, t: y - LABEL.height / 2, b: y + LABEL.height / 2 }
            : side === 'left'
              ? { l: x - LABEL.width, r: x, t: y - LABEL.height / 2, b: y + LABEL.height / 2 }
              : { l: x - LABEL.width / 2, r: x + LABEL.width / 2, t: y - LABEL.height, b: y };
        const overlaps = rect.l < o.r && rect.r > o.l && rect.t < o.b && rect.b > o.t;
        // The object may fill the picture so that nothing fits beside it; then the label is held in the picture, above its top.
        const roomy = o.t > LABEL.height + 16 || side !== 'above';
        if (roomy) expect(overlaps, `${size.width}x${size.height} yaw ${yaw} ${side}`).toBe(false);
      }
    }
  });

  it('is held inside the picture, whichever side it takes', () => {
    for (let yaw = -60; yaw <= 10; yaw += 5) {
      const p = placement(corners, { ...handoverPose(false), yawDeg: yaw }, LENS, SIZE, LABEL);
      if (!p.label) continue;
      const { x, y, side } = p.label;
      const left = side === 'right' ? x : side === 'left' ? x - LABEL.width : x - LABEL.width / 2;
      expect(left, `yaw ${yaw}`).toBeGreaterThanOrEqual(0);
      expect(left + LABEL.width, `yaw ${yaw}`).toBeLessThanOrEqual(SIZE.width);
      expect(y, `yaw ${yaw}`).toBeGreaterThan(0);
      expect(y, `yaw ${yaw}`).toBeLessThan(SIZE.height);
    }
  });
});

describe('placing a cue', () => {
  it('puts the board’s label over the board and keeps it on the picture, from the starting view', () => {
    const p = placement(targetCorners({ kind: 'board' }, doorSize), handoverPose(false), LENS, SIZE, LABEL, { ring: true });
    expect(p.label).not.toBeNull();
    expect(p.label!.x).toBeGreaterThan(0);
    expect(p.label!.x).toBeLessThan(SIZE.width / 2);
    expect(p.label!.y).toBeGreaterThan(LABEL.height);
    expect(p.label!.y).toBeLessThan(SIZE.height);
    expect(p.ring).not.toBeNull();
    expect(p.ring!.w).toBeGreaterThan(40);
    expect(p.ring!.h).toBeGreaterThan(40);
  });

  it('draws a ring only when asked', () => {
    const corners = targetCorners({ kind: 'board' }, doorSize);
    expect(placement(corners, handoverPose(false), LENS, SIZE, LABEL).ring).toBeNull();
    expect(placement(corners, handoverPose(false), LENS, SIZE, LABEL, { ring: true }).ring).not.toBeNull();
  });

  it('drops both for what is behind the eye', () => {
    const behind = placement([[0, 1, 99]], handoverPose(false), LENS, SIZE, LABEL, { ring: true });
    expect(behind).toEqual({ label: null, ring: null });
  });

  it('drops both for what is wholly outside the picture', () => {
    // Looking down the corridor, the lobby’s right wall prop at the visitor’s side is off to one side.
    const view = { x: 0, z: 5, yawDeg: 180, pitchDeg: 0 };
    const off = placement(targetCorners({ kind: 'prop', id: 'chess' }, doorSize), view, LENS, SIZE, LABEL);
    expect(off).toEqual({ label: null, ring: null });
  });

  it('holds a label that would run off the edge inside the picture', () => {
    const corners = targetCorners({ kind: 'board' }, doorSize);
    // Looking so the board is at the far left edge.
    const view = { ...handoverPose(false), yawDeg: -28 };
    const p = placement(corners, view, LENS, SIZE, LABEL);
    if (p.label) {
      expect(p.label.x).toBeGreaterThanOrEqual(LABEL.width / 2);
      expect(p.label.x).toBeLessThanOrEqual(SIZE.width - LABEL.width / 2);
    }
  });

  it('finds every prop at its framing station, near the middle of the picture, so its label is on screen', () => {
    for (const spec of PROPS) {
      const station = stationFor(propAnchor(propById(spec.id)), LENS, corridorBounds());
      const p = placement(targetCorners({ kind: 'prop', id: spec.id }, doorSize), station, LENS, SIZE, LABEL, {
        ring: true,
      });
      expect(p.label, spec.id).not.toBeNull();
      expect(p.label!.x, spec.id).toBeGreaterThan(LABEL.width / 2 - 1);
      expect(p.label!.x, spec.id).toBeLessThan(SIZE.width - LABEL.width / 2 + 1);
      expect(p.label!.y, spec.id).toBeGreaterThan(0);
      expect(p.label!.y, spec.id).toBeLessThan(SIZE.height);
    }
    const board = stationFor(boardAnchor(), LENS, corridorBounds());
    expect(placement(targetCorners({ kind: 'board' }, doorSize), board, LENS, SIZE, LABEL).label).not.toBeNull();
  });
});
