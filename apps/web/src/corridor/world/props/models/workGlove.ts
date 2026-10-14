import { atlasUvs } from '../atlasLayout.ts';
import { IVORY, linear, METAL, mulRgb, wood } from '../colours.ts';
import type { PropModel } from '../model.ts';
import { both, ramp, Y, type PoseSet } from '../motion.ts';
import type { Assembly } from '../parts.ts';

/**
 * The mended work glove (making): a leather work glove hanging by its cuff loop from an ivory peg
 * on an oak rail, its palm mended with a denim patch, a seam on the back darned in cream thread, one
 * fingertip replaced from another glove. Choosing it brings it forward and turns it over to show the
 * mend, then it turns back and hangs again.
 */

const PEG_Z = 0.045;
const PEG_LEN = 0.062;
/** Glove-local origin: the peg tip. */
const DEPTH = 0.0165;

const LEATHER = linear('#A07C4C');
const LEATHER_DARK = linear('#7B5A33');
const CUFF = linear('#6E4A3A');
const THREAD = linear('#E6DCBF');

export const GLOVE_TURN = Math.PI;
export const GLOVE_OUT = 0.05;

function finger(a: Assembly, x: number, top: number, length: number, splay: number, curl: number, tip: readonly [number, number, number]): void {
  const segs = 2;
  const r = 0.0105;
  let px = x;
  let py = top;
  let pz = PEG_Z;
  const seg = length / segs;
  for (let i = 0; i < segs; i += 1) {
    const dx = Math.sin(splay) * seg;
    const dy = -Math.cos(splay) * Math.cos(curl) * seg;
    const dz = Math.sin(curl) * seg * 0.6;
    const mx = px + dx / 2;
    const my = py + dy / 2;
    const mz = pz + dz / 2;
    a.cyl('matte', { at: [mx, my, mz], rot: [-curl * 0.6, 0, splay] }, r, r * 0.97, seg * 1.02, 8, i === segs - 1 ? tip : LEATHER);
    a.sphere('matte', { at: [px + dx, py + dy, pz + dz] }, r * 0.98, 8, 4, i === segs - 1 ? tip : LEATHER);
    px += dx;
    py += dy;
    pz += dz;
  }
}

export const workGlove: PropModel = {
  id: 'work-glove',

  parts: (placement) => [{ name: 'glove', pivot: [0, placement.height + 0.13, PEG_Z] }],

  build(a, placement) {
    const H = placement.height;
    const top = H + 0.13;
    const glove = a.part('glove');

    // The rail and the peg: oak, and a turned bone peg through a brass collar.
    a.span('wood', [-0.11, 0.11], [top - 0.02, top + 0.024], [0, 0.02], 0.003, wood('#4F3624'));
    a.cyl('brass', { at: [0, top, 0.0215], rot: [Math.PI / 2, 0, 0] }, 0.0105, 0.0105, 0.003, 10, METAL.polished);
    a.ivory(() => {
      a.cyl('enamel', { at: [0, top, 0.0485], rot: [Math.PI / 2, 0, 0] }, 0.0062, 0.0075, 0.058, 8, IVORY);
      a.sphere('enamel', { at: [0, top, PEG_Z + PEG_LEN / 2 - 0.0035], scale: [1, 1, 0.8] }, 0.0105, 9, 6, IVORY);
    });
    for (const x of [-0.088, 0.088]) a.cyl('brass', { at: [x, top, 0.0215], rot: [Math.PI / 2, 0, 0] }, 0.0045, 0.0045, 0.003, 6, METAL.brass);

    a.on(glove, () => {
      const loopY = top - 0.004;
      // The loop over the peg, and the cuff under it.
      a.torus('matte', { at: [0, loopY, PEG_Z] }, 0.0125, 0.0028, 4, 12, LEATHER_DARK);
      const cuffTop = top - 0.014;
      a.lathe(
        'matte',
        { at: [0, cuffTop, PEG_Z], scale: [1, 1, 0.52] },
        [[0.0555, 0], [0.056, -0.002], [0.05, -0.044], [0.0445, -0.072], [0.0405, -0.074], [0.0455, -0.044], [0.0505, -0.0035], [0.0535, 0]],
        16,
        CUFF,
      );
      // Palm and back of the hand: one rounded slab.
      const palmTop = cuffTop - 0.07;
      a.box('matte', [0, palmTop - 0.0425, PEG_Z], [0.088, 0.088, 0.032], 0.009, LEATHER);
      // A darning patch on the back of the hand, stitched round its edge.
      a.box('matte', [-0.004, palmTop - 0.045, PEG_Z + 0.0165], [0.04, 0.034, 0.0016], 0.0005, LEATHER_DARK);
      for (let k = 0; k < 6; k += 1) {
        const x = -0.022 + k * 0.0088;
        a.box('matte', [x, palmTop - 0.0285, PEG_Z + 0.0178], [0.0022, 0.0034, 0.0006], 0, THREAD);
        a.box('matte', [x, palmTop - 0.0615, PEG_Z + 0.0178], [0.0022, 0.0034, 0.0006], 0, THREAD);
      }
      // The wrist seam, darned: nine cream stitches across it.
      for (let k = 0; k < 7; k += 1) a.box('matte', [-0.036 + k * 0.012, palmTop + 0.0015, PEG_Z + 0.0163], [0.0026, 0.0125, 0.0007], 0, THREAD);
      // Fingers, longest in the middle; the index one carries a patch of another glove's leather.
      const baseY = palmTop - 0.088;
      finger(a, -0.0345, baseY, 0.066, -0.05, 0.1, mulRgb(LEATHER, 0.78));
      finger(a, -0.0115, baseY, 0.076, -0.012, 0.14, LEATHER);
      finger(a, 0.0115, baseY, 0.07, 0.025, 0.12, LEATHER);
      finger(a, 0.0345, baseY, 0.054, 0.07, 0.1, LEATHER);
      // The thumb comes off the side, angled out and down.
      a.cyl('matte', { at: [0.056, palmTop - 0.062, PEG_Z + 0.004], rot: [0, 0, 0.55] }, 0.0118, 0.0105, 0.05, 8, LEATHER);
      a.sphere('matte', { at: [0.0675, palmTop - 0.0845, PEG_Z + 0.004] }, 0.0108, 8, 4, LEATHER);

      // The mend on the palm side (toward the wall): a denim patch with a stitched border.
      const pz = PEG_Z - DEPTH - 0.0006;
      const pw = 0.054;
      a.quad('print', [pw / 2, palmTop - 0.07, pz], [-pw / 2, palmTop - 0.07, pz], [-pw / 2, palmTop - 0.07 + pw, pz], [pw / 2, palmTop - 0.07 + pw, pz], [0, 0, -1], undefined, atlasUvs('patch'));
      // The palm's wear: a darker pad where the work was done.
      a.box('matte', [0, palmTop - 0.043, PEG_Z - 0.0163], [0.07, 0.082, 0.0008], 0, mulRgb(LEATHER, 0.82), undefined, ['+z']);
    });

    a.hit([-0.13, H - 0.14, 0], [0.13, H + 0.17, 0.09]);
  },

  pose(motion) {
    const set: PoseSet = {};
    const t = motion.action;
    // Forward off the wall, a half-turn to show the palm, held there; the fall turns it back.
    const out = ramp(t, 0.0, 0.2);
    const turn = ramp(t, 0.1, 1.0);
    if (out !== 0 || turn !== 0) set['glove'] = both([0, 0, GLOVE_OUT * out], Y, GLOVE_TURN * turn);
    return set;
  },
};
