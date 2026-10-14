import { atlasUvs } from '../atlasLayout.ts';
import { IVORY, linear, METAL, mulRgb } from '../colours.ts';
import type { PropModel } from '../model.ts';
import { both, ramp, rad, X, type PoseSet } from '../motion.ts';
import { CABINET } from './trophyCabinet.ts';

/**
 * The team shirts (competition, kept): three folded shirts in the cabinet's open bay, teal,
 * maroon and cream hoops, and a brass label holder at the lip saying the team is disbanded and the
 * laundry is not. Lifting the top shirt peels it back from its front edge and lets it fall. The
 * loose cuff on the top shirt is the small ambient motion: it lifts a little in the lobby's draught.
 */

const FLOOR = 0.093;
const WIDTH = 0.34;
const THICK = 0.034;
const DEPTH = 0.235;
const CENTRE_Z = 0.1925;
/** The top shirt's front edge: the line it peels back from. */
const HINGE_Y = FLOOR + 3 * THICK + 0.001;
const HINGE_Z = CENTRE_Z + DEPTH / 2;
/** How far the cuff end stands from its hinge. */
const CUFF = { x: 0.105, width: 0.07, depth: 0.06 } as const;

export const SHIRT_LIFT = rad(26);
export const CUFF_STIR = rad(4);

const SHIRTS = [
  { colour: linear('#2F5F63'), hoops: false },
  { colour: linear('#6A3640'), hoops: false },
  { colour: linear('#D4CAAF'), hoops: true },
] as const;

export const teamShirts: PropModel = {
  id: 'team-shirts',

  parts: () => [
    { name: 'topShirt', pivot: [0, HINGE_Y, HINGE_Z] },
    { name: 'cuff', pivot: [CUFF.x, HINGE_Y, HINGE_Z] },
  ],

  build(a) {
    const top = a.part('topShirt');
    const cuff = a.part('cuff');

    SHIRTS.forEach((shirt, i) => {
      const y0 = FLOOR + i * THICK;
      const isTop = i === SHIRTS.length - 1;
      const cloth = shirt.colour;
      const draw = (): void => {
        // Body, folded in thirds: a soft slab, its edges rolled.
        a.box('matte', [0, y0 + THICK / 2, CENTRE_Z], [WIDTH, THICK, DEPTH], 0.009, cloth);
        // The sleeve folded across the right third, a little proud of the body.
        a.box('matte', [WIDTH / 2 - 0.058, y0 + THICK + 0.0015, CENTRE_Z], [0.112, 0.004, DEPTH - 0.01], 0.0015, mulRgb(cloth, 0.93));
        // The fold in the front edge: a darker crease.
        a.box('matte', [0, y0 + THICK * 0.52, CENTRE_Z + DEPTH / 2 + 0.0004], [WIDTH - 0.012, 0.0022, 0.0015], 0, mulRgb(cloth, 0.62));
        // The collar, a rolled knit ring lying flat at the back left.
        a.torus('matte', { at: [-0.075, y0 + THICK + 0.004, CENTRE_Z - DEPTH / 2 + 0.05], rot: [Math.PI / 2, 0, 0.12] }, 0.037, 0.0075, 5, 14, mulRgb(cloth, 0.84), Math.PI * 1.25);
        if (shirt.hoops) {
          // Maroon hoops across the chest, five of them.
          for (let k = 0; k < 5; k += 1) {
            a.box('matte', [-0.02, y0 + THICK + 0.0008, CENTRE_Z + DEPTH / 2 - 0.044 - k * 0.043], [WIDTH - 0.13, 0.0013, 0.02], 0, linear('#6A3640'));
          }
        }
      };
      if (isTop) a.on(top, draw);
      else draw();
    });

    // The loose cuff on the top shirt: a short hinged flap, striped like the rest.
    a.on(cuff, () => {
      const y = HINGE_Y + 0.0045;
      a.box('matte', [CUFF.x, y, HINGE_Z - 0.01 - CUFF.depth / 2], [CUFF.width, 0.004, CUFF.depth], 0.001, linear('#CBC1A6'));
      for (let k = 0; k < 3; k += 1) a.box('matte', [CUFF.x, y + 0.0025, HINGE_Z - 0.03 - k * 0.016], [CUFF.width - 0.004, 0.001, 0.007], 0, linear('#6A3640'));
    });

    // The label holder at the lip of the bay: a brass tray, the card in it, an ivory tab to lift it by.
    const lx = -0.01;
    const lz = CABINET.z1 - 0.017;
    const w = 0.2;
    const h = w * (88 / 560);
    a.span('brass', [lx - w / 2 - 0.004, lx + w / 2 + 0.004], [FLOOR, FLOOR + 0.004], [lz - 0.012, lz + 0.016], 0.0008, METAL.polished);
    a.span('brass', [lx - w / 2 - 0.004, lx + w / 2 + 0.004], [FLOOR, FLOOR + 0.007], [lz + 0.012, lz + 0.016], 0.0008, METAL.polished);
    const tilt = rad(-9);
    const cy = FLOOR + 0.005 + (h / 2) * Math.cos(tilt);
    const cz = lz + 0.005;
    const dz = (h / 2) * Math.sin(tilt);
    a.quad(
      'print',
      [lx - w / 2, cy - (h / 2) * Math.cos(tilt), cz - dz],
      [lx + w / 2, cy - (h / 2) * Math.cos(tilt), cz - dz],
      [lx + w / 2, cy + (h / 2) * Math.cos(tilt), cz + dz],
      [lx - w / 2, cy + (h / 2) * Math.cos(tilt), cz + dz],
      [0, 0.15, 1],
      undefined,
      atlasUvs('shirtLabel'),
    );
    a.ivory(() => {
      a.box('enamel', [lx + w / 2 - 0.016, cy + (h / 2) * Math.cos(tilt) + 0.003, cz + dz + 0.001], [0.026, 0.008, 0.0035], 0.001, IVORY);
    });

    a.hit([-0.2, 0.09, 0.07], [0.2, 0.25, CABINET.z1]);
  },

  pose(motion, ambient) {
    const set: PoseSet = {};
    const lift = ramp(motion.action, 0.0, 0.6);
    const stir = ambient.sleeve * CUFF_STIR;
    const total = lift * SHIRT_LIFT + stir;
    if (lift !== 0) set['topShirt'] = both([0, 0.035 * lift, 0], X, lift * SHIRT_LIFT);
    // The cuff goes where the shirt goes, and a little further when the draught takes it.
    if (lift !== 0 || stir !== 0) set['cuff'] = both([0, 0.035 * lift, 0], X, total);
    return set;
  },
};

