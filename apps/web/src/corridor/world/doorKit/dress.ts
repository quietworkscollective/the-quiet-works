import type { Rgb } from '../colour.ts';
import { cellUv } from '../marksLayout.ts';
import { nth } from '../math.ts';
import { cellDecalOnLeaf, decalOnLedge, decalOnLeaf, keepOnLeaf, type LeafBox } from './decals.ts';
import { LEAF_GAP } from './plan.ts';
import { surfaceUnder } from './motifs.ts';
import type { Ctx } from './ctx.ts';
import type { MarkPart } from './character.ts';

/**
 * Everything applied to a door's surface rather than built into it, from the plan's character:
 * wear where hands and feet go, chips where paint has failed, then the marks themselves (a
 * stencil, the ghost of a sign, a carved border, a stripe, a notice). Each is a decal quad in the
 * marks bucket of the leaf it is on (so it swings with the leaf), laid just over whatever the
 * leaf's relief is at that spot. Built last, so the relief the families and signatures recorded
 * is complete; wear goes down first, chips over it, marks on top.
 */

const INK: Rgb = [0.05, 0.05, 0.055];

/** Per-layer heights above the surface: wear, then chips, then marks. */
const LAYER = { wear: 0.0005, chip: 0.0009, mark: 0.0014 } as const;

/** The face of a leaf: what its decals must stay inside. */
function leafBox(c: Ctx, leaf: number): LeafBox {
  const l = nth(c.plan.leaves, leaf);
  return { x0: Math.min(l.x0, l.x1), x1: Math.max(l.x0, l.x1), y0: LEAF_GAP.bottom, y1: LEAF_GAP.bottom + l.height };
}

function rectOf(centre: readonly [number, number], size: readonly [number, number]): { x: [number, number]; y: [number, number] } {
  return { x: [centre[0] - size[0] / 2, centre[0] + size[0] / 2], y: [centre[1] - size[1] / 2, centre[1] + size[1] / 2] };
}

export function buildWear(c: Ctx): void {
  const ch = c.plan.character;
  if (!ch || c.lod !== 'near') return;
  for (const w of ch.wear) {
    if (w.kind === 'dust') {
      const half = w.size[0] / 2;
      decalOnLedge(c.fixed.marks, cellUv('dust'), [w.centre[0] - half, w.centre[0] + half], [0, w.size[1]], (w.ledgeY ?? 0) + 0.0012, w.colour);
      continue;
    }
    if (w.leaf === null) continue;
    const centre = keepOnLeaf(w.centre, w.size, w.rotDeg, leafBox(c, w.leaf));
    const r = rectOf(centre, w.size);
    const z = surfaceUnder(c, r.x, r.y) + LAYER.wear;
    cellDecalOnLeaf(nth(c.leaf, w.leaf).marks, w.cell, centre, w.size, z, w.colour, { rotDeg: w.rotDeg });
  }
}

export function buildChips(c: Ctx): void {
  const ch = c.plan.character;
  if (!ch || c.lod !== 'near') return;
  ch.chips.forEach((chip, n) => {
    const b = nth(c.leaf, chip.leaf).marks;
    const centre = keepOnLeaf(chip.centre, chip.size, chip.rotDeg, leafBox(c, chip.leaf));
    const r = rectOf(centre, chip.size);
    const z = surfaceUnder(c, r.x, r.y) + LAYER.chip;
    // The outer coat's loss first, then each deeper layer a little smaller and turned, so the
    // edge of a flake shows the coats in order: the finish, an older paint, primer or wood.
    chip.layers.forEach((colour, i) => {
      const k = 1 - 0.34 * i;
      cellDecalOnLeaf(b, chip.cell, centre, [chip.size[0] * k, chip.size[1] * k], z + i * 0.00012, colour, { rotDeg: chip.rotDeg + i * 17, flip: (n + i) % 2 === 1 });
    });
  });
}

/** A mark's own geometry: its decal quads, in the leaf the plan says. */
function buildMark(c: Ctx, m: MarkPart): void {
  const b = nth(c.leaf, m.leaf).marks;
  const at = keepOnLeaf(m.centre, m.size, m.rotDeg, leafBox(c, m.leaf));
  const r = rectOf(at, m.size);
  const z = surfaceUnder(c, r.x, r.y) + LAYER.mark;
  switch (m.kind) {
    case 'stencil':
      decalOnLeaf(b, c.marks.textUv(m.text ?? ''), at, m.size, z, m.colour, { rotDeg: m.rotDeg });
      break;
    case 'notice': {
      // A slip of paper pinned at its corners, the printed line across it.
      cellDecalOnLeaf(b, 'solid', at, m.size, z, m.colour, { rotDeg: m.rotDeg });
      const inner: [number, number] = [m.size[0] - 0.03, m.size[1] - 0.03];
      decalOnLeaf(b, c.marks.textUv(m.text ?? ''), at, inner, z + 0.0003, INK, { rotDeg: m.rotDeg });
      break;
    }
    case 'decal-residue':
      cellDecalOnLeaf(b, m.centre[0] < 0 ? 'residue0' : 'residue1', at, m.size, z, m.colour, { rotDeg: m.rotDeg });
      break;
    case 'carving': {
      // The border tiles along the member at its natural proportion: 3.5 wide to 1 high.
      const tile = m.size[1] * 3.5;
      const n = Math.max(1, Math.round(m.size[0] / tile));
      const w = m.size[0] / n;
      for (let i = 0; i < n; i += 1) {
        cellDecalOnLeaf(b, 'borderStraight', [at[0] - m.size[0] / 2 + w * (i + 0.5), at[1]], [w, m.size[1]], z, m.colour, { flip: i % 2 === 1 });
      }
      break;
    }
    case 'stripe':
      cellDecalOnLeaf(b, 'solid', at, m.size, z, m.colour);
      break;
  }
}

export function buildMarks(c: Ctx): void {
  const ch = c.plan.character;
  if (!ch || c.lod !== 'near') return;
  for (const m of ch.marks) buildMark(c, m);
}
