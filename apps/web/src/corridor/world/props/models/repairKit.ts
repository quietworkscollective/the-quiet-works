import { atlasUvs } from '../atlasLayout.ts';
import { hash2 } from '../../math.ts';
import { IVORY, linear, METAL, wood } from '../colours.ts';
import type { PropModel } from '../model.ts';
import { ramp, rad, turned, X, Y, type PoseSet } from '../motion.ts';

/**
 * The repair kit (making): a shallow bench shelf on the wall of bay 3 with what a household repairs
 * from: a sewing tin whose lid opens, a reel of thread to turn on its spindle, a saucer of
 * buttons, scissors, a tape measure, and a tomato stuck with pins. "Repairs department. Buttons
 * accepted without appointment." The tin's lid has the small ivory tab to lift it by.
 */

const TOP = 0.835;
const TIN = { x: -0.165, z: 0.155, w: 0.17, d: 0.11, h: 0.05, lid: 0.012 } as const;
const HINGE_Z = TIN.z - TIN.d / 2;
const HINGE_Y = TOP + TIN.h;
const REEL = { x: 0.02, z: 0.12 } as const;
export const LID_OPEN = rad(-106);

const BUTTONS = ['#C9BFA0', '#2F4A6B', '#7A3B2E', '#4E6B4A', '#B9954E', '#2A2A2C', '#8E4E6B', '#D8D0BA'].map(linear);

export const repairKit: PropModel = {
  id: 'repair-kit',

  parts: () => [
    { name: 'lid', pivot: [TIN.x, HINGE_Y, HINGE_Z] },
    { name: 'reel', pivot: [REEL.x, TOP + 0.02, REEL.z] },
  ],

  build(a) {
    const lid = a.part('lid');
    const reel = a.part('reel');

    // The shelf: a pine board with a rolled front edge, on two iron brackets.
    const pine = wood('#8B6A44');
    a.span('wood', [-0.325, 0.325], [TOP - 0.035, TOP], [0.03, 0.3], 0.003, pine);
    a.span('wood', [-0.325, 0.325], [TOP - 0.035, TOP - 0.008], [0.292, 0.306], 0.003, wood('#7C5C3A'));
    for (const x of [-0.24, 0.24]) {
      a.span('steel', [x - 0.014, x + 0.014], [TOP - 0.2, TOP - 0.035], [0, 0.006], 0.0015, METAL.iron);
      a.span('steel', [x - 0.014, x + 0.014], [TOP - 0.041, TOP - 0.035], [0.006, 0.25], 0.0015, METAL.iron);
      a.rod('steel', [x, TOP - 0.18, 0.008], [x, TOP - 0.04, 0.24], 0.0055, 5, METAL.iron);
      for (const y of [TOP - 0.19, TOP - 0.075]) a.cyl('brass', { at: [x, y, 0.0075], rot: [Math.PI / 2, 0, 0] }, 0.005, 0.005, 0.003, 8, METAL.brass);
    }

    // The sewing tin: teal enamel, hollow, lined in red, with buttons loose in it.
    const tin = linear('#4A8782');
    const lining = linear('#5A2A2A');
    const { x: tx, z: tz, w, d, h } = TIN;
    a.box('enamel', [tx, TOP + 0.002, tz], [w, 0.004, d], 0, tin);
    a.box('enamel', [tx, TOP + h / 2, tz - d / 2 + 0.002], [w, h, 0.004], 0, tin);
    a.box('enamel', [tx, TOP + h / 2, tz + d / 2 - 0.002], [w, h, 0.004], 0.0012, tin);
    a.box('enamel', [tx - w / 2 + 0.002, TOP + h / 2, tz], [0.004, h, d - 0.008], 0, tin);
    a.box('enamel', [tx + w / 2 - 0.002, TOP + h / 2, tz], [0.004, h, d - 0.008], 0, tin);
    a.quad('matte', [tx - w / 2 + 0.004, TOP + 0.0045, tz + d / 2 - 0.004], [tx + w / 2 - 0.004, TOP + 0.0045, tz + d / 2 - 0.004], [tx + w / 2 - 0.004, TOP + 0.0045, tz - d / 2 + 0.004], [tx - w / 2 + 0.004, TOP + 0.0045, tz - d / 2 + 0.004], [0, 1, 0], lining);
    for (let i = 0; i < 7; i += 1) {
      const px = tx - w / 2 + 0.02 + hash2(i, 3) * (w - 0.04);
      const pz = tz - d / 2 + 0.018 + hash2(i, 7) * (d - 0.036);
      const r = 0.0055 + hash2(i, 11) * 0.0035;
      a.cyl('enamel', { at: [px, TOP + 0.0063 + (i % 3) * 0.0022, pz], rot: [(hash2(i, 5) - 0.5) * 0.25, 0, (hash2(i, 9) - 0.5) * 0.25] }, r, r, 0.0024, 8, BUTTONS[i % BUTTONS.length]);
    }
    // The tin's lid, hinged at the back, with its label and the ivory tab.
    a.on(lid, () => {
      const lw = w + 0.004;
      const ld = d + 0.004;
      a.box('enamel', [tx, HINGE_Y + TIN.lid / 2, tz], [lw, TIN.lid, ld], 0.0025, linear('#D9CDAE'));
      a.span('enamel', [tx - lw / 2, tx + lw / 2], [HINGE_Y - 0.004, HINGE_Y + 0.002], [tz + ld / 2 - 0.003, tz + ld / 2], 0.0008, tin);
      const lh = 0.052;
      const lwid = lh * (448 / 152);
      const ly = HINGE_Y + TIN.lid + 0.0004;
      a.quad('print', [tx - lwid / 2, ly, tz + lh / 2], [tx + lwid / 2, ly, tz + lh / 2], [tx + lwid / 2, ly, tz - lh / 2], [tx - lwid / 2, ly, tz - lh / 2], [0, 1, 0], undefined, atlasUvs('kitLabel'));
      a.ivory(() => {
        a.box('enamel', [tx, HINGE_Y + 0.0065, tz + ld / 2 + 0.003], [0.034, 0.006, 0.012], 0.0016, IVORY);
      });
      a.cyl('steel', { at: [tx - 0.05, HINGE_Y, HINGE_Z - 0.001], rot: [0, 0, Math.PI / 2] }, 0.0028, 0.0028, 0.03, 6, METAL.steel);
      a.cyl('steel', { at: [tx + 0.05, HINGE_Y, HINGE_Z - 0.001], rot: [0, 0, Math.PI / 2] }, 0.0028, 0.0028, 0.03, 6, METAL.steel);
    });

    // The reel on its spindle: a wooden base, a pin, the reel itself.
    a.box('wood', [REEL.x, TOP + 0.005, REEL.z], [0.048, 0.01, 0.048], 0.003, wood('#7C5C3A'));
    a.cyl('steel', { at: [REEL.x, TOP + 0.03, REEL.z] }, 0.0032, 0.0032, 0.05, 8, METAL.steel);
    a.on(reel, () => {
      const y = TOP + 0.012;
      a.cyl('wood', { at: [REEL.x, y + 0.0015, REEL.z] }, 0.0175, 0.0175, 0.003, 12, wood('#B49365'));
      a.cyl('matte', { at: [REEL.x, y + 0.0195, REEL.z] }, 0.0128, 0.0128, 0.033, 12, linear('#A3472F'));
      a.cyl('wood', { at: [REEL.x, y + 0.0375, REEL.z] }, 0.0175, 0.0175, 0.003, 12, wood('#B49365'));
      // The free end of the thread, off the reel and across the shelf.
      a.rod('matte', [REEL.x + 0.0128, y + 0.012, REEL.z], [REEL.x + 0.05, TOP + 0.0015, REEL.z + 0.03], 0.0007, 4, linear('#A3472F'));
    });

    // The saucer of buttons.
    const sx = 0.155;
    const sz = 0.12;
    a.lathe('enamel', { at: [sx, TOP, sz] }, [[0, 0], [0.028, 0], [0.043, 0.009], [0.047, 0.0125], [0.0445, 0.013], [0.0335, 0.0055], [0, 0.0045]], 16, linear('#E1DAC6'));
    for (let i = 0; i < 9; i += 1) {
      const ang = hash2(i, 21) * Math.PI * 2;
      const rr = Math.sqrt(hash2(i, 23)) * 0.027;
      const r = 0.0062 + hash2(i, 25) * 0.0042;
      a.cyl('enamel', { at: [sx + Math.cos(ang) * rr, TOP + 0.0072 + (i % 3) * 0.0028, sz + Math.sin(ang) * rr], rot: [(hash2(i, 27) - 0.5) * 0.4, 0, (hash2(i, 29) - 0.5) * 0.4] }, r, r, 0.0027, 8, BUTTONS[(i * 3) % BUTTONS.length]);
    }

    // Scissors lying open at an angle: two blades, two bows.
    const cx = 0.236;
    const cz = 0.205;
    const turn = 0.5;
    const at = (u: number, v: number): [number, number] => [cx + u * Math.cos(turn) - v * Math.sin(turn), cz + u * Math.sin(turn) + v * Math.cos(turn)];
    for (const side of [-1, 1] as const) {
      const [bx0, bz0] = at(0, 0);
      const [bx1, bz1] = at(0.074, side * 0.01);
      a.rod('steel', [bx0, TOP + 0.003 + (side > 0 ? 0.0034 : 0), bz0], [bx1, TOP + 0.003 + (side > 0 ? 0.0034 : 0), bz1], 0.0028, 4, METAL.steel);
      const [hx, hz] = at(-0.026, side * 0.013);
      const [qx, qz] = at(0, 0);
      a.rod('steel', [qx, TOP + 0.003 + (side > 0 ? 0.0034 : 0), qz], [hx, TOP + 0.003 + (side > 0 ? 0.0034 : 0), hz], 0.0022, 4, METAL.steel);
      a.torus('enamel', { at: [hx - 0.006 * Math.cos(turn), TOP + 0.004, hz - 0.006 * Math.sin(turn)], rot: [Math.PI / 2, 0, 0] }, 0.0105, 0.0027, 4, 10, linear('#8C2F2A'));
    }
    a.cyl('brass', { at: [cx, TOP + 0.0082, cz] }, 0.0034, 0.0034, 0.0016, 8, METAL.brass);

    // A tape measure, boxed in yellow.
    a.cyl('enamel', { at: [-0.04, TOP + 0.0075, 0.225] }, 0.031, 0.031, 0.015, 16, linear('#C9A22E'));
    a.cyl('brass', { at: [-0.04, TOP + 0.0158, 0.225] }, 0.012, 0.012, 0.0014, 10, METAL.polished);
    a.box('enamel', [-0.04, TOP + 0.0045, 0.254], [0.022, 0.009, 0.012], 0, linear('#B08C1E'));

    // The pin cushion: a tomato, with a green star and a few pins.
    const px = -0.292;
    const pz = 0.14;
    a.sphere('matte', { at: [px, TOP + 0.0215, pz], scale: [1, 0.82, 1] }, 0.026, 10, 7, linear('#9B2D27'));
    for (let k = 0; k < 6; k += 1) {
      const ang = (k / 6) * Math.PI * 2;
      a.box('matte', [px + Math.cos(ang) * 0.01, TOP + 0.0375, pz + Math.sin(ang) * 0.01], [0.012, 0.0022, 0.005], 0, linear('#3E6B34'), undefined, []);
    }
    for (let k = 0; k < 5; k += 1) {
      const ang = hash2(k, 31) * Math.PI * 2;
      const rr = 0.012 + hash2(k, 33) * 0.01;
      const bx = px + Math.cos(ang) * rr;
      const bz = pz + Math.sin(ang) * rr;
      a.rod('steel', [bx, TOP + 0.02, bz], [bx + Math.cos(ang) * 0.012, TOP + 0.038, bz + Math.sin(ang) * 0.012], 0.0005, 3, METAL.steel);
      a.sphere('enamel', { at: [bx + Math.cos(ang) * 0.012, TOP + 0.0386, bz + Math.sin(ang) * 0.012] }, 0.0016, 5, 3, BUTTONS[k % BUTTONS.length]);
    }
  },

  pose(motion, _ambient, reduced, phase) {
    const set: PoseSet = {};
    const open = ramp(motion.action, 0.0, 0.45);
    // The reel is turned once on the way open; it is not unwound on the way shut.
    const spin = reduced || phase === 'falling' ? 0 : ramp(motion.action, 0.28, 1.0);
    if (open !== 0) set['lid'] = turned(X, LID_OPEN * open);
    if (spin !== 0) set['reel'] = turned(Y, Math.PI * 2 * spin);
    return set;
  },
};
