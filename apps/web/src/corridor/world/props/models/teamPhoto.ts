import { atlasUvs } from '../atlasLayout.ts';
import { IVORY, linear, METAL, wood } from '../colours.ts';
import type { PropModel } from '../model.ts';
import { moved, ramp, type PoseSet } from '../motion.ts';

/**
 * The team photograph (competition, remembered): a framed sepia group on the lobby's right wall,
 * hung by its cord from a brass hook. "Attendance complete. Several members are behind the
 * camera." The caption is a typed slip kept in a slot under the frame; an ivory tab on it is the
 * pull. Choosing the photograph draws the slip out so it can be read, and it stays out until the
 * action is released.
 */

export const PHOTO = { w: 0.42, h: 0.3, depth: 0.03, bar: 0.02 } as const;
/** How far the slip is drawn out, metres. */
export const SLIP_TRAVEL = 0.0335;
const SLIP = { w: 0.3, h: 0.0375 } as const;
/** The lower rail is deeper than the others: it holds the caption slip. */
const RAIL = 0.04;

export const teamPhoto: PropModel = {
  id: 'team-photo',

  parts: (placement) => [{ name: 'slip', pivot: [0, placement.height - PHOTO.h / 2, 0.016] }],

  build(a, placement) {
    const H = placement.height;
    const { w, h, depth, bar } = PHOTO;
    const slip = a.part('slip');

    // The frame: a black-stained timber, four bars, a rebate for the glass; the lower bar is split
    // front and back so there is a slot between for the slip.
    const black = wood('#2A1E17');
    a.span('wood', [-w / 2, w / 2], [H + h / 2 - bar, H + h / 2], [0, depth], 0.0025, black);
    a.span('wood', [-w / 2, -w / 2 + bar], [H - h / 2 + RAIL, H + h / 2 - bar], [0, depth], 0.0025, black);
    a.span('wood', [w / 2 - bar, w / 2], [H - h / 2 + RAIL, H + h / 2 - bar], [0, depth], 0.0025, black);
    a.span('wood', [-w / 2, -w / 2 + bar], [H - h / 2, H - h / 2 + RAIL], [0, depth], 0.0025, black);
    a.span('wood', [w / 2 - bar, w / 2], [H - h / 2, H - h / 2 + RAIL], [0, depth], 0.0025, black);
    a.span('wood', [-w / 2 + bar, w / 2 - bar], [H - h / 2, H - h / 2 + RAIL], [depth - 0.011, depth], 0.0025, black);
    a.span('wood', [-w / 2 + bar, w / 2 - bar], [H - h / 2, H - h / 2 + RAIL], [0, 0.011], 0.0025, black);
    // A cream mount and the photograph on it, a little high so the mount is heavier below.
    a.quad('matte', [-w / 2 + bar, H - h / 2 + RAIL, 0.012], [w / 2 - bar, H - h / 2 + RAIL, 0.012], [w / 2 - bar, H + h / 2 - bar, 0.012], [-w / 2 + bar, H + h / 2 - bar, 0.012], [0, 0, 1], linear('#CFC6AC'));
    const iw = 0.318;
    const ih = iw * (448 / 704);
    const iy = H + 0.014;
    a.quad('print', [-iw / 2, iy - ih / 2, 0.0135], [iw / 2, iy - ih / 2, 0.0135], [iw / 2, iy + ih / 2, 0.0135], [-iw / 2, iy + ih / 2, 0.0135], [0, 0, 1], undefined, atlasUvs('photo'));
    // Glass over the whole opening.
    a.quad('glass', [-w / 2 + bar, H - h / 2 + RAIL, depth - 0.006], [w / 2 - bar, H - h / 2 + RAIL, depth - 0.006], [w / 2 - bar, H + h / 2 - bar, depth - 0.006], [-w / 2 + bar, H + h / 2 - bar, depth - 0.006], [0, 0, 1], linear('#b8c8c8'));

    // The slip: drawn from the slot, a typed card with a small ivory tab.
    a.on(slip, () => {
      const sy = H - h / 2 + 0.0015 + SLIP.h / 2;
      a.quad('print', [-SLIP.w / 2, sy - SLIP.h / 2, 0.0178], [SLIP.w / 2, sy - SLIP.h / 2, 0.0178], [SLIP.w / 2, sy + SLIP.h / 2, 0.0178], [-SLIP.w / 2, sy + SLIP.h / 2, 0.0178], [0, 0, 1], undefined, atlasUvs('slip'));
      a.span('matte', [-SLIP.w / 2, SLIP.w / 2], [sy - SLIP.h / 2, sy + SLIP.h / 2], [0.0148, 0.0176], 0.0003, linear('#CFC5A8'));
      a.ivory(() => {
        a.box('enamel', [SLIP.w / 2 - 0.03, sy - SLIP.h / 2 - 0.004, 0.0165], [0.034, 0.012, 0.0045], 0.0014, IVORY);
      });
    });

    // Hung by two cords to a brass hook, as the building's own prints are.
    const hookY = H + h / 2 + 0.17;
    a.sphere('brass', { at: [0, hookY, 0.016] }, 0.007, 10, 6, METAL.brass);
    a.cyl('brass', { at: [0, hookY, 0.008], rot: [Math.PI / 2, 0, 0] }, 0.0035, 0.0035, 0.016, 8, METAL.brass);
    for (const sx of [-1, 1] as const) {
      a.rod('matte', [sx * (w / 2 - 0.035), H + h / 2 - 0.002, 0.01], [0, hookY, 0.0175], 0.0009, 4, linear('#2C2418'));
      a.cyl('brass', { at: [sx * (w / 2 - 0.035), H + h / 2 + 0.002, 0.011], rot: [Math.PI / 2, 0, 0] }, 0.0045, 0.0045, 0.004, 8, METAL.brass);
    }
    a.hit([-w / 2, H - h / 2 - 0.05, 0], [w / 2, H + h / 2, depth + 0.02]);
  },

  pose(motion) {
    const set: PoseSet = {};
    // Out, and held out: this is a reading, not a flourish.
    const out = ramp(motion.action, 0.0, 0.6);
    if (out !== 0) set['slip'] = moved(0, -SLIP_TRAVEL * out, 0);
    return set;
  },
};
