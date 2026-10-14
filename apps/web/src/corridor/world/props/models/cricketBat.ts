import { atlasUvs } from '../atlasLayout.ts';
import { IVORY, linear, METAL, mulRgb, wood } from '../colours.ts';
import { loft } from '../kit.ts';
import type { PropModel } from '../model.ts';
import { both, plateau, ramp, turned, Y, Z, rad, type PoseSet } from '../motion.ts';

/**
 * The cricket bat and its scorebook (competition, kept with affection): a willow bat on a brass
 * toe-shelf, held at the handle by an ivory turn-button, a cloth scorebook and its pencil on a
 * hook beside it. Choosing the bat turns the button, lifts the bat off its shelf and turns it once
 * round on its long axis, so the maker's mark and the back of the blade show; then back it goes.
 */

const CX = 0;
const CZ = 0.068;
const TOE = 0.175;
const TOP = 1.025;
/** Height of the turn-button's post. */
const BUTTON_Y = 0.935;
const BUTTON = { x: 0.04, z: 0.084 } as const;

const WILLOW = wood('#C7A877');
const WILLOW_OILED = wood('#A9803F');
const GRIP = linear('#2C4636');
const TWINE = linear('#CDC4A7');

export const BAT_LIFT = { out: 0.07, up: 0.012 } as const;

export const cricketBat: PropModel = {
  id: 'cricket-bat',

  parts: () => [
    { name: 'bat', pivot: [CX, 0.6, CZ] },
    { name: 'button', pivot: [BUTTON.x, BUTTON_Y, BUTTON.z] },
  ],

  build(a) {
    const bat = a.part('bat');
    const button = a.part('button');

    a.on(bat, () => {
      // The blade: a flat face, a back with a raised spine, a toe oiled darker than the rest.
      const grainTint = (p: readonly [number, number, number]) => (p[1] < TOE + 0.07 ? WILLOW_OILED : WILLOW);
      loft(
        a,
        'wood',
        [
          { y: TOE, hw: 0.044, zf: CZ + 0.009, zb: CZ - 0.008 },
          { y: TOE + 0.012, hw: 0.0525, zf: CZ + 0.011, zb: CZ - 0.01 },
          { y: 0.48, hw: 0.054, zf: CZ + 0.0115, zb: CZ - 0.0105 },
          { y: 0.7, hw: 0.054, zf: CZ + 0.0115, zb: CZ - 0.0105 },
          { y: 0.73, hw: 0.0485, zf: CZ + 0.0115, zb: CZ - 0.0105 },
          { y: 0.765, hw: 0.0305, zf: CZ + 0.011, zb: CZ - 0.011 },
          { y: 0.795, hw: 0.0185, zf: CZ + 0.0105, zb: CZ - 0.0105 },
          { y: 0.806, hw: 0.0165, zf: CZ + 0.0105, zb: CZ - 0.0105 },
        ],
        grainTint,
        CX,
        { swap: true },
      );
      // The spine on the back: a long ridge, tapered at both ends.
      loft(
        a,
        'wood',
        [
          { y: 0.24, hw: 0.012, zf: CZ - 0.0105, zb: CZ - 0.0135 },
          { y: 0.32, hw: 0.03, zf: CZ - 0.0105, zb: CZ - 0.0205 },
          { y: 0.62, hw: 0.03, zf: CZ - 0.0105, zb: CZ - 0.0205 },
          { y: 0.74, hw: 0.012, zf: CZ - 0.0105, zb: CZ - 0.014 },
        ],
        WILLOW,
        CX,
        { swap: true },
      );
      // The handle: cane, binding, grip, and a rubber cap.
      a.cyl('wood', { at: [CX, 0.83, CZ] }, 0.0118, 0.0135, 0.1, 10, wood('#B79A68'));
      a.cyl('matte', { at: [CX, 0.806, CZ] }, 0.0142, 0.0142, 0.028, 10, TWINE);
      a.cyl('matte', { at: [CX, 0.93, CZ] }, 0.0138, 0.0142, 0.19, 10, GRIP);
      for (let k = 0; k < 5; k += 1) a.torus('matte', { at: [CX, 0.85 + k * 0.034, CZ], rot: [Math.PI / 2, 0, 0] }, 0.0143, 0.0013, 4, 10, mulRgb(GRIP, 1.35));
      a.cyl('matte', { at: [CX, TOP - 0.004, CZ] }, 0.0148, 0.0152, 0.012, 10, mulRgb(GRIP, 0.6));
      // The maker's mark, stamped small on the face.
      a.span('matte', [CX - 0.02, CX + 0.02], [0.5, 0.52], [CZ + 0.0115, CZ + 0.0118], 0, linear('#8A5A24'));
    });

    // The toe shelf: brass, on the panelling, with the bat's toe resting on it.
    a.span('brass', [CX - 0.04, CX + 0.04], [TOE - 0.006, TOE - 0.0005], [0.032, CZ + 0.034], 0.001, METAL.polished);
    a.span('brass', [CX - 0.04, CX + 0.04], [TOE - 0.05, TOE - 0.0005], [0.03, 0.036], 0.001, METAL.polished);
    for (const dx of [-0.026, 0.026]) a.cyl('brass', { at: [CX + dx, TOE - 0.03, 0.0375], rot: [Math.PI / 2, 0, 0] }, 0.0045, 0.0045, 0.003, 8, METAL.brass);

    // The handle's rest: an oak pad behind it, and the ivory turn-button over it.
    a.span('wood', [CX - 0.022, CX + 0.022], [BUTTON_Y - 0.035, BUTTON_Y + 0.035], [0.03, 0.054], 0.002, wood('#5B3E28'));
    a.cyl('brass', { at: [BUTTON.x, BUTTON_Y, (0.03 + BUTTON.z) / 2] , rot: [Math.PI / 2, 0, 0] }, 0.0045, 0.0045, BUTTON.z - 0.03, 8, METAL.brass);
    a.on(button, () => {
      a.ivory(() => {
        a.box('enamel', [BUTTON.x, BUTTON_Y, BUTTON.z + 0.003], [0.064, 0.012, 0.006], 0.0018, IVORY);
      });
      a.cyl('brass', { at: [BUTTON.x, BUTTON_Y, BUTTON.z + 0.0075], rot: [Math.PI / 2, 0, 0] }, 0.0058, 0.0058, 0.003, 10, METAL.polished);
    });

    // The scorebook on its hook: cloth cover, paper edge, a spine tape, a pencil on a string.
    const bx = -0.16;
    const by = 0.86;
    const bw = 0.09;
    const bh = 0.126;
    const bz = 0.05;
    a.cyl('brass', { at: [bx, by + 0.072, 0.0395], rot: [Math.PI / 2, 0, 0] }, 0.0035, 0.0035, 0.019, 8, METAL.brass);
    a.sphere('brass', { at: [bx, by + 0.072, 0.0495] }, 0.0055, 8, 6, METAL.brass);
    a.rod('matte', [bx - 0.018, by + 0.064, bz + 0.011], [bx, by + 0.072, 0.0495], 0.0009, 4, TWINE);
    a.rod('matte', [bx + 0.018, by + 0.064, bz + 0.011], [bx, by + 0.072, 0.0495], 0.0009, 4, TWINE);
    a.box('matte', [bx, by, bz], [bw, bh, 0.02], 0.002, linear('#46202A'));
    a.span('matte', [bx - bw / 2 + 0.004, bx + bw / 2 - 0.003], [by - bh / 2 + 0.003, by + bh / 2 - 0.003], [bz + 0.0099, bz + 0.0103], 0, linear('#D9D1B8'), undefined, []);
    a.quad('print', [bx - bw / 2 + 0.006, by - bh / 2 + 0.002, bz + 0.0108], [bx + bw / 2, by - bh / 2 + 0.002, bz + 0.0108], [bx + bw / 2, by + bh / 2 - 0.002, bz + 0.0108], [bx - bw / 2 + 0.006, by + bh / 2 - 0.002, bz + 0.0108], [0, 0, 1], undefined, atlasUvs('scoreCover'));
    a.span('matte', [bx - bw / 2 - 0.0005, bx - bw / 2 + 0.006], [by - bh / 2, by + bh / 2], [bz - 0.0105, bz + 0.0108], 0.0008, linear('#2A2F3B'));
    // Pencil on a string from the spine, hanging down alongside.
    a.rod('matte', [bx + bw / 2 - 0.004, by + bh / 2 - 0.004, bz + 0.011], [bx + bw / 2 + 0.012, by - bh / 2 - 0.03, bz + 0.012], 0.0007, 4, TWINE);
    a.cyl('wood', { at: [bx + bw / 2 + 0.012, by - bh / 2 - 0.085, bz + 0.012], rot: [0, 0, rad(2)] }, 0.0034, 0.0034, 0.105, 6, wood('#B33B2A'));
    a.cyl('wood', { at: [bx + bw / 2 + 0.012, by - bh / 2 - 0.139, bz + 0.012] }, 0.0012, 0.0034, 0.008, 6, wood('#D9C08C'));
    a.hit([-0.22, TOE - 0.02, 0.03], [0.08, TOP + 0.02, 0.12]);
  },

  pose(motion, _ambient, reduced, phase) {
    const set: PoseSet = {};
    const t = motion.action;
    if (reduced) {
      // The button is turned aside and the bat stands a little off its shelf, until the action ends.
      if (t !== 0) {
        set['button'] = turned(Z, rad(90));
        set['bat'] = both([0, BAT_LIFT.up, BAT_LIFT.out], Y, rad(35));
      }
      return set;
    }
    // On the way down the bat is simply home: the turn is done and is not run backwards.
    if (phase === 'falling') return set;
    // The button turns aside first and is put back last; the bat comes forward and up, turns once, and settles.
    const hold = plateau(t, 0.0, 0.1, 0.9, 1.0);
    if (hold !== 0) set['button'] = turned(Z, rad(90) * hold);
    const lifted = plateau(t, 0.08, 0.2, 0.8, 0.92);
    const turn = ramp(t, 0.16, 0.84) * Math.PI * 2;
    if (lifted !== 0 || turn !== 0) set['bat'] = both([0, BAT_LIFT.up * lifted, BAT_LIFT.out * lifted], Y, turn);
    return set;
  },
};
