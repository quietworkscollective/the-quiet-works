import { atlasUvs } from '../atlasLayout.ts';
import { hash2 } from '../../math.ts';
import { IVORY, linear, METAL, mulRgb, wood } from '../colours.ts';
import { brassFrame } from '../kit.ts';
import type { PropModel } from '../model.ts';
import { both, moved, ramp, rad, X, type PoseSet } from '../motion.ts';

/**
 * The recipe drawer (care): a small painted wall cabinet in bay 5 with a pinboard above and one
 * card-index drawer below it. "Serves four. Additional chairs may be borrowed." Pulling the drawer
 * brings one card up and forward so it can be read, and it stays out until the action is
 * released. A jug of wooden spoons stands on top, and a tea towel hangs from a hook at the side.
 */

const W = 0.45;
const D = 0.16;
const HALF_H = 0.175;
/** The drawer slides this far out; the card rises and tips forward. */
export const DRAWER_TRAVEL = 0.11;
export const CARD_RISE = 0.075;
export const CARD_TIP = rad(20);

/** The drawer's inside: its floor, its front edge, and where the lifting card stands in it. */
const DRAWER = { floor: 0.0, back: 0.02 } as const;
const CARD_W = 0.127;
const CARD_H = 0.084;
const CARD_X = -0.087;

const PAINT = wood('#B9A97E');
const PAINT_EDGE = wood('#9C8B62');
const CARD = linear('#EEE6D0');

export const recipeDrawer: PropModel = {
  id: 'recipe-drawer',

  parts: (placement) => [
    { name: 'drawer', pivot: [0, placement.height, D] },
    { name: 'card', pivot: [CARD_X, placement.height - HALF_H + 0.03 + DRAWER.floor + 0.004, D - 0.014 - 0.008] },
  ],

  build(a, placement) {
    const H = placement.height;
    const drawer = a.part('drawer');
    const dz0 = DRAWER.back;
    const dz1 = D - 0.014;
    const dy0 = H - HALF_H + 0.03 + DRAWER.floor;
    const dy1 = H - 0.05;
    const cardZ = dz1 - 0.008;
    const card = a.part('card');

    const top = H + HALF_H;
    const bottom = H - HALF_H;
    // The dado cap carries a shallow oak shelf under the cabinet; two brass angle brackets make
    // the support visible below its front edge instead of leaving the cabinet to float above it.
    const shelfTop = bottom - 0.045;
    a.span('wood', [-W / 2 - 0.025, W / 2 + 0.025], [shelfTop - 0.035, shelfTop], [0.018, D + 0.055], 0, PAINT_EDGE);
    for (const x of [-0.16, 0.16]) {
      a.box('brass', [x, shelfTop - 0.07, 0.045], [0.042, 0.13, 0.025], 0, METAL.brass);
      a.rod('brass', [x, shelfTop - 0.125, D + 0.08], [x, shelfTop - 0.008, 0.055], 0.011, 3, METAL.brass);
    }
    // Carcass: back, sides, top, bottom, and a rail between pinboard and drawer.
    // Omit faces enclosed by the wall or adjoining panels; visible surfaces keep their bevels.
    a.span('wood', [-W / 2, W / 2], [bottom, top], [0, 0.012], 0, PAINT_EDGE, undefined, ['-z']);
    a.span('wood', [-W / 2, -W / 2 + 0.014], [bottom, top], [0.012, D], 0.002, PAINT, undefined, ['-z', '-y', '+y']);
    a.span('wood', [W / 2 - 0.014, W / 2], [bottom, top], [0.012, D], 0.002, PAINT, undefined, ['-z', '-y', '+y']);
    a.span('wood', [-W / 2, W / 2], [top - 0.014, top], [0.012, D + 0.008], 0.0015, PAINT, undefined, ['-z']);
    a.span('wood', [-W / 2, W / 2], [bottom, bottom + 0.014], [0.012, D + 0.004], 0.002, PAINT, undefined, ['-z']);
    const railY = H - 0.03;
    a.span('wood', [-W / 2 + 0.014, W / 2 - 0.014], [railY - 0.007, railY + 0.007], [0.012, D - 0.002], 0.002, PAINT, undefined, ['-z', '-x', '+x']);

    // The pinboard: cork in a frame, with three blank cards pinned to it.
    const cork = linear('#8E6C44');
    a.quad('matte', [-W / 2 + 0.014, railY + 0.007, 0.0145], [W / 2 - 0.014, railY + 0.007, 0.0145], [W / 2 - 0.014, top - 0.014, 0.0145], [-W / 2 + 0.014, top - 0.014, 0.0145], [0, 0, 1], (p) => mulRgb(cork, 0.85 + 0.3 * hash2(Math.floor(p[0] * 220), Math.floor(p[1] * 220))));
    const pinned: [number, number, number, number][] = [[-0.12, H + 0.09, 0.09, 0.062], [0.01, H + 0.08, 0.1, 0.07], [0.125, H + 0.095, 0.085, 0.056]];
    pinned.forEach(([x, y, w, h]) => {
      a.box('matte', [x, y, 0.0165], [w, h, 0.0016], 0, CARD, undefined, ['-z']);
      a.sphere('brass', { at: [x, y + h / 2 - 0.008, 0.0195] }, 0.0034, 6, 4, METAL.brass);
    });

    // The drawer: front, hollow box, two columns of cards standing in it.
    a.on(drawer, () => {
      a.span('wood', [-W / 2 + 0.018, W / 2 - 0.018], [dy0 - 0.004, dy1 + 0.014], [D - 0.014, D], 0.002, PAINT);
      a.span('wood', [-W / 2 + 0.02, W / 2 - 0.02], [dy0, dy0 + 0.004], [dz0, dz1], 0, PAINT_EDGE, undefined, ['-x', '+x', '-z', '+z']);
      a.span('wood', [-W / 2 + 0.02, -W / 2 + 0.024], [dy0, dy1], [dz0, dz1], 0, PAINT_EDGE, undefined, ['-z', '+z', '-y']);
      a.span('wood', [W / 2 - 0.024, W / 2 - 0.02], [dy0, dy1], [dz0, dz1], 0, PAINT_EDGE, undefined, ['-z', '+z', '-y']);
      a.span('wood', [-W / 2 + 0.02, W / 2 - 0.02], [dy0, dy1], [dz0, dz0 + 0.004], 0, PAINT_EDGE, undefined, ['-x', '+x', '-y']);
      // Cards: a row of thin boxes on edge in each column, tall dividers with coloured tabs now and then.
      for (const col of [-1, 1] as const) {
        for (let i = 0; i < 12; i += 1) {
          if (col < 0 && i === 0) continue; // the front card on the left is its own part: it lifts
          const tall = i % 4 === 3;
          const h = tall ? 0.078 : 0.07;
          const z = dz1 - 0.008 - i * 0.0082;
          a.box('matte', [col * 0.087, dy0 + 0.004 + h / 2, z], [CARD_W, h, 0.0022], 0, tall ? linear('#D6C9A2') : CARD, undefined, ['-y']);
          if (tall) a.box('matte', [col * 0.087 + 0.04, dy0 + 0.004 + h + 0.004, z], [0.026, 0.008, 0.0022], 0, linear(['#7A3B2E', '#2F4A6B', '#4E6B4A'][(i - 3) / 4] ?? '#7A3B2E'), undefined, ['-y']);
        }
      }
      // Front: a brass-framed label, and the ivory pull below it.
      brassFrame(a, [0, H - 0.062, D + 0.0005], [0.114, 0.0346], 0.0025, 0.0028);
      const lw = 0.108;
      const lh = lw * (96 / 336);
      a.quad('print', [-lw / 2, H - 0.062 - lh / 2, D + 0.0027], [lw / 2, H - 0.062 - lh / 2, D + 0.0027], [lw / 2, H - 0.062 + lh / 2, D + 0.0027], [-lw / 2, H - 0.062 + lh / 2, D + 0.0027], [0, 0, 1], undefined, atlasUvs('recipeLabel'));
      a.cyl('brass', { at: [0, H - 0.098, D + 0.0015], rot: [Math.PI / 2, 0, 0] }, 0.0105, 0.0105, 0.003, 10, METAL.polished);
      a.ivory(() => {
        a.cyl('enamel', { at: [0, H - 0.098, D + 0.0095], rot: [Math.PI / 2, 0, 0] }, 0.0055, 0.0068, 0.013, 8, IVORY);
        a.sphere('enamel', { at: [0, H - 0.098, D + 0.0155], scale: [1, 1, 0.75] }, 0.0095, 9, 6, IVORY);
      });
    });
    // The card that lifts: blank on its back, written on its face.
    a.on(card, () => {
      a.box('matte', [CARD_X, dy0 + 0.004 + CARD_H / 2, cardZ], [CARD_W, CARD_H, 0.0022], 0, CARD, undefined, []);
      const fw = CARD_W - 0.006;
      const fh = CARD_H - 0.006;
      const z = cardZ + 0.0012;
      const yb = dy0 + 0.004 + 0.003;
      a.quad('print', [CARD_X - fw / 2, yb, z], [CARD_X + fw / 2, yb, z], [CARD_X + fw / 2, yb + fh, z], [CARD_X - fw / 2, yb + fh, z], [0, 0, 1], undefined, atlasUvs('recipeCard'));
    });

    // The jug's underside is enclosed by the cabinet top; the teal inset covers its inner base.
    const jx = -0.12;
    const jz = 0.08;
    a.lathe('enamel', { at: [jx, top, jz] }, [[0.03, 0], [0.034, 0.004], [0.035, 0.05], [0.032, 0.075], [0.036, 0.082], [0.03, 0.079], [0.028, 0.06]], 12, linear('#E0D6BC'));
    a.torus('enamel', { at: [jx + 0.034, top + 0.045, jz], rot: [0, 0, -Math.PI / 2] }, 0.016, 0.0036, 4, 8, linear('#E0D6BC'), Math.PI);
    a.cyl('enamel', { at: [jx, top + 0.0735, jz] }, 0.0345, 0.0345, 0.0045, 12, linear('#3A6663'));
    for (const [dx, lean, hgt] of [[-0.01, -0.12, 0.12], [0.004, 0.05, 0.105], [0.014, 0.2, 0.115]] as const) {
      a.rod('wood', [jx + dx, top + 0.04, jz], [jx + dx + lean * hgt, top + 0.04 + hgt, jz + 0.002], 0.0036, 5, wood('#A98458'));
      a.sphere('wood', { at: [jx + dx + lean * hgt, top + 0.04 + hgt + 0.012, jz + 0.002], scale: [1, 1.5, 0.35] }, 0.011, 7, 4, wood('#A98458'));
    }

    // A tea towel on a brass hook at the right side.
    const tx = W / 2 + 0.065;
    a.cyl('brass', { at: [tx, H + 0.1, 0.034], rot: [0, 0, Math.PI / 2] }, 0.0045, 0.0045, 0.11, 8, METAL.brass);
    for (const dx of [-0.05, 0.05]) a.rod('brass', [tx + dx, H + 0.1, 0.012], [tx + dx, H + 0.1, 0.034], 0.003, 5, METAL.brass);
    const towel = linear('#D8D2C0');
    a.span('matte', [tx - 0.04, tx + 0.04], [H - 0.09, H + 0.087], [0.038, 0.0405], 0, towel);
    for (const y of [H - 0.07, H - 0.04, H - 0.01]) a.span('matte', [tx - 0.0402, tx + 0.0402], [y, y + 0.009], [0.0378, 0.0408], 0, linear('#3E5E80'));
    a.span('matte', [tx - 0.04, tx + 0.04], [H + 0.07, H + 0.088], [0.0376, 0.0408], 0, mulRgb(towel, 0.9));

    a.hit([-W / 2 - 0.02, H - HALF_H - 0.05, 0], [W / 2 + 0.1, H + HALF_H + 0.1, D + 0.02]);
  },

  pose(motion) {
    const set: PoseSet = {};
    const t = motion.action;
    const out = ramp(t, 0.0, 0.5);
    const up = ramp(t, 0.42, 1.0);
    if (out !== 0) set['drawer'] = moved(0, 0, DRAWER_TRAVEL * out);
    // The card rides out with the drawer, then rises and tips toward the visitor.
    if (out !== 0 || up !== 0) set['card'] = both([0, CARD_RISE * up, DRAWER_TRAVEL * out], X, CARD_TIP * up);
    return set;
  },
};
