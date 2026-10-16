import type { Placement } from '../input/cues.ts';
import type { CueTarget } from './cueText.ts';
import { CUE_TUNING } from './cueTuning.ts';
import { boardCorners, extentOf, type Extent, type Lens, type Point3, type View } from './framing.ts';
import { boxCorners, doorCorners, propAnchor, propById } from './stations.ts';

/**
 * Where a cue's label and focus ring land on screen (ADR 0004, art consult 6): the label is a
 * screen-space DOM element beside the object it names, the ring is a box around it, both found by
 * projecting the object's corners through the camera the frame was drawn with. Pure, so the
 * overlay's placement is tested without a browser.
 */
export interface DoorSize {
  width: number;
  height: number;
}

export function targetCorners(target: CueTarget, doorSize: (id: string) => DoorSize): Point3[] {
  switch (target.kind) {
    case 'prop':
      return boxCorners(propAnchor(propById(target.id)));
    case 'board':
      return boardCorners();
    case 'door': {
      const { width, height } = doorSize(target.id);
      return doorCorners(target.id, height, width);
    }
  }
}

export interface Viewport {
  width: number;
  height: number;
}

/** Room kept clear at the screen's edges for a label, in CSS pixels. */
const EDGE_PX = 8;
/** The gap between a ring and what it surrounds. */
const RING_PAD_PX = 5;

/**
 * The placement for `corners` seen from `view` through `lens` on a picture of this size. The label
 * stands beside the object, `CUE_TUNING.labelOffsetPx` from its nearest edge, on the right if it
 * fits, else on the left, else above it, so it never covers the object (and with it the hand-action
 * point the ivory fitting marks). It is held inside the picture; both it and the ring are dropped
 * when the object is wholly behind the eye or wholly outside the picture.
 */
export function placement(
  corners: readonly Point3[],
  view: View,
  lens: Lens,
  size: Viewport,
  label: { width: number; height: number },
  options: { ring: boolean; offsetPx?: number } = { ring: false },
): Placement {
  const box: Extent | null = extentOf(view, lens, corners);
  if (!box) return { label: null, ring: null };
  if (box.maxX < -1 || box.minX > 1 || box.maxY < -1 || box.minY > 1) return { label: null, ring: null };
  const offset = options.offsetPx ?? CUE_TUNING.labelOffsetPx;
  const toX = (ndc: number) => ((ndc + 1) / 2) * size.width;
  const toY = (ndc: number) => ((1 - ndc) / 2) * size.height;
  const left = toX(box.minX);
  const right = toX(box.maxX);
  const top = toY(box.maxY);
  const bottom = toY(box.minY);
  // Beside the part of the object that is on the picture.
  const seenLeft = Math.max(0, left);
  const seenRight = Math.min(size.width, right);
  const midY = Math.min(size.height - EDGE_PX - label.height / 2, Math.max(EDGE_PX + label.height / 2, (top + bottom) / 2));
  let placed: NonNullable<Placement['label']>;
  if (seenRight + offset + label.width + EDGE_PX <= size.width) {
    placed = { x: seenRight + offset, y: midY, side: 'right' };
  } else if (seenLeft - offset - label.width - EDGE_PX >= 0) {
    placed = { x: seenLeft - offset, y: midY, side: 'left' };
  } else {
    const half = label.width / 2;
    placed = {
      x: Math.min(size.width - EDGE_PX - half, Math.max(EDGE_PX + half, (seenLeft + seenRight) / 2)),
      y: Math.max(EDGE_PX + label.height, top - offset),
      side: 'above',
    };
  }
  return {
    label: placed,
    ring: options.ring
      ? { x: left - RING_PAD_PX, y: top - RING_PAD_PX, w: right - left + 2 * RING_PAD_PX, h: bottom - top + 2 * RING_PAD_PX }
      : null,
  };
}
