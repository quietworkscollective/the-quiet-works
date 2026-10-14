import { atlasUvs } from '../atlasLayout.ts';
import { IVORY, linear, METAL, mulRgb, wood } from '../colours.ts';
import { brassFrame, screw } from '../kit.ts';
import type { PropModel } from '../model.ts';
import { ramp, rad, turned, Y, Z, type PoseSet } from '../motion.ts';
import type { Assembly } from '../parts.ts';
import { cup, plinth, reservedSpace, teamMug } from '../trophies.ts';

/**
 * The trophy cabinet (competition, softened): a walnut cabinet on the lobby's right wall, three
 * glazed shelves and an open bay below. Inside: a gold cup that was won, a trophy still in its box
 * because it is not shown, a silver runner-up cup, the ordinary team mug, and a clean ring on the
 * lowest shelf where the next one will stand. Its catch is brass; the pull is ivory. On top, a
 * ship in a bottle, because someone in the team also made things.
 */

export const CABINET = {
  half: 0.5,
  top: 1.45,
  z0: 0.058,
  z1: 0.335,
  /** Tops of the three shelves, bottom to top. */
  shelves: [0.61, 0.91, 1.17] as const,
  /** The right-hand door is hinged at this x and swings out. */
  hinge: 0.482,
  doorOpen: rad(74),
  catchOpen: rad(-92),
};

const WALNUT = wood('#4B3021');
const WALNUT_LIGHT = wood('#5E3D29');
const WALNUT_DARK = wood('#3B2418');

export const trophyCabinet: PropModel = {
  id: 'trophy-cabinet',

  parts: () => [
    { name: 'door', pivot: [CABINET.hinge, 0, 0.32] },
    { name: 'catch', pivot: [-0.047, 1.0, 0.338] },
  ],

  build(a) {
    const { half: H, z0, z1 } = CABINET;
    const [s1, s2, s3] = CABINET.shelves;
    const door = a.part('door');
    const latch = a.part('catch');

    // Plinth, with a step and a shadow gap so the case stands off the floor.
    a.span('wood', [-H + 0.012, H - 0.012], [0, 0.07], [z0 + 0.004, z1 - 0.012], 0.003, WALNUT_DARK);
    a.span('wood', [-H, H], [0.07, 0.092], [z0, z1], 0.004, WALNUT_LIGHT);

    // The carcass: sides, back, top, and a solid apron under the glazing.
    a.span('wood', [-H, -H + 0.018], [0.092, 1.41], [z0 + 0.004, z1 - 0.004], 0, WALNUT);
    a.span('wood', [H - 0.018, H], [0.092, 1.41], [z0 + 0.004, z1 - 0.004], 0, WALNUT);
    a.span('wood', [-H + 0.018, H - 0.018], [0.092, 1.41], [z0 + 0.004, z0 + 0.014], 0, WALNUT_DARK);
    a.span('wood', [-H + 0.018, H - 0.018], [0.44, 0.592], [z0 + 0.014, z1 - 0.014], 0, WALNUT);
    // Raised panel on the apron: a fielded rectangle with a bevel.
    a.span('wood', [-H + 0.04, H - 0.04], [0.458, 0.576], [z1 - 0.014, z1 - 0.005], 0.004, WALNUT_LIGHT);
    // The three shelves.
    for (const top of [s1, s2, s3]) a.span('wood', [-H + 0.018, H - 0.018], [top - 0.02, top], [z0 + 0.012, z1 - 0.026], 0, WALNUT_LIGHT);
    // Top, and a stepped cornice.
    a.span('wood', [-H, H], [1.4, 1.42], [z0, z1], 0, WALNUT);
    a.span('wood', [-H - 0.014, H + 0.014], [1.42, 1.44], [z0 - 0.004, z1 + 0.012], 0.004, WALNUT_LIGHT);
    a.span('wood', [-H - 0.004, H + 0.004], [1.44, 1.45], [z0 + 0.004, z1 + 0.002], 0.003, WALNUT);

    // Baize back to the glazed bays, a dark bottle green.
    a.quad('matte', [-H + 0.018, s1, z0 + 0.0145], [H - 0.018, s1, z0 + 0.0145], [H - 0.018, 1.4, z0 + 0.0145], [-H + 0.018, 1.4, z0 + 0.0145], [0, 0, 1], linear('#33503A'));

    // The open bay below: a plain dark back and a polished floor to stand shirts on.
    a.quad('matte', [-H + 0.018, 0.092, z0 + 0.0145], [H - 0.018, 0.092, z0 + 0.0145], [H - 0.018, 0.44, z0 + 0.0145], [-H + 0.018, 0.44, z0 + 0.0145], [0, 0, 1], linear('#2A2018'));

    // Doors: the left is fixed, the right swings. Each is a frame, one pane and a glazing bar.
    const doorFrame = (x0: number, x1: number, bone: number): void => {
      a.on(bone, () => {
        const zf = z1 - 0.026;
        const zb = z1 - 0.004;
        const stile = 0.032;
        a.span('wood', [x0, x0 + stile], [0.6, 1.4], [zf, zb], 0, WALNUT);
        a.span('wood', [x1 - stile, x1], [0.6, 1.4], [zf, zb], 0, WALNUT);
        a.span('wood', [x0 + stile, x1 - stile], [0.6, 0.632], [zf, zb], 0, WALNUT);
        a.span('wood', [x0 + stile, x1 - stile], [1.368, 1.4], [zf, zb], 0, WALNUT);
        // Two slim glazing bars, level with the shelves so they read as the shelf lines continued.
        for (const y of [0.9, 1.16]) a.span('wood', [x0 + stile, x1 - stile], [y - 0.003, y + 0.003], [zf + 0.004, zb - 0.004], 0, WALNUT_LIGHT);
        // The pane: clear glass, slightly inboard of the frame's face.
        const gz = (zf + zb) / 2;
        a.quad('glass', [x0 + stile, 0.632, gz], [x1 - stile, 0.632, gz], [x1 - stile, 1.368, gz], [x0 + stile, 1.368, gz], [0, 0, 1], linear('#a9c0c0'));
      });
    };
    doorFrame(-H + 0.018 + 0.002, -0.0035, 0);
    doorFrame(0.0035, H - 0.018 - 0.002, door);

    a.on(door, () => {
      // Three brass hinge barrels on the swinging stile.
      for (const y of [0.72, 1.0, 1.28]) a.cyl('brass', { at: [CABINET.hinge - 0.002, y, z1 - 0.012] }, 0.0055, 0.0055, 0.05, 8, METAL.polished);
      // The ivory pull: a bone knob on a brass rose, where the hand goes.
      a.cyl('brass', { at: [0.043, 1.0, z1 - 0.002], rot: [Math.PI / 2, 0, 0] }, 0.012, 0.012, 0.004, 16, METAL.polished);
      a.ivory(() => {
        a.cyl('enamel', { at: [0.043, 1.0, z1 + 0.006], rot: [Math.PI / 2, 0, 0] }, 0.0065, 0.0075, 0.014, 14, IVORY);
        a.sphere('enamel', { at: [0.043, 1.0, z1 + 0.0135], scale: [1, 1, 0.8] }, 0.0105, 14, 8, IVORY);
      });
    });

    // The catch: a brass thumb-turn on the left door's meeting stile, and the keeper opposite.
    a.cyl('brass', { at: [-0.047, 1.0, z1 - 0.002], rot: [Math.PI / 2, 0, 0] }, 0.0105, 0.0105, 0.004, 16, METAL.polished);
    a.on(latch, () => {
      a.cyl('brass', { at: [-0.047, 1.0, z1 + 0.002], rot: [Math.PI / 2, 0, 0] }, 0.0045, 0.0045, 0.008, 10, METAL.polished);
      a.span('brass', [-0.047 - 0.003, -0.047 + 0.003], [1.0, 1.0 + 0.036], [z1 + 0.0035, z1 + 0.0075], 0.0008, METAL.polished);
    });
    a.span('brass', [0.004, 0.012], [0.98, 1.02], [z1 - 0.005, z1 - 0.002], 0.0005, METAL.brass);
    // A keyhole escutcheon below the catch.
    a.span('brass', [-0.0485, -0.0455], [0.935, 0.951], [z1 - 0.003, z1 - 0.0015], 0.0003, mulRgb(METAL.brass, 0.8));

    // The polishing rota's card, in a brass frame on the apron.
    const cardW = 0.3;
    const cardH = 0.075;
    brassFrame(a, [0, 0.517, z1 - 0.0045], [cardW + 0.014, cardH + 0.014], 0.0055);
    a.quad('print', [-cardW / 2, 0.517 - cardH / 2, z1 + 0.0004], [cardW / 2, 0.517 - cardH / 2, z1 + 0.0004], [cardW / 2, 0.517 + cardH / 2, z1 + 0.0004], [-cardW / 2, 0.517 + cardH / 2, z1 + 0.0004], [0, 0, 1], undefined, atlasUvs('rota'));
    for (const x of [-0.162, 0.162]) screw(a, [x, 0.517, z1 - 0.0005], 0.0034);

    // Contents. Top shelf: the cup that was won, and the trophy still in its box.
    const mid = (z0 + z1) / 2 - 0.022;
    const plinthTop3 = plinth(a, -0.2, s3, mid, 0.13, 'plateComposed');
    cup(a, { at: [-0.2, plinthTop3, mid], scale: 1.16, tint: METAL.gold });
    const plinthTopC = plinth(a, 0.185, s3, mid, 0.12, 'plateEffort');
    boxed(a, 0.185, plinthTopC, mid);
    // Middle shelf: the runner-up cup, and the ordinary team mug.
    const plinthTop2 = plinth(a, -0.19, s2, mid, 0.15, 'plateRunner');
    cup(a, { at: [-0.19, plinthTop2, mid], scale: 0.9, tint: METAL.silver, broad: true });
    teamMug(a, [0.2, s2, mid + 0.01]);
    // Lowest shelf: the space that is kept.
    reservedSpace(a, 0.2, s1, mid, mid + 0.07);

    // On top, a ship in a bottle on its cradle.
    shipInBottle(a, 0.17, CABINET.top);

    // What a hand can find: this lets the cabinet be chosen above the shirts' bay.
    a.hit([-H, 0.44, z0], [H, CABINET.top + 0.06, z1]);
  },

  pose(motion) {
    const t = motion.action;
    const set: PoseSet = {};
    // The thumb-turn goes first, then the door follows it and stays open while the action holds.
    const catchAngle = ramp(t, 0.0, 0.16) * CABINET.catchOpen;
    const doorAngle = ramp(t, 0.12, 0.68) * CABINET.doorOpen;
    if (catchAngle !== 0) set['catch'] = turned(Z, catchAngle);
    if (doorAngle !== 0) set['door'] = turned(Y, doorAngle);
    return set;
  },
};

/**
 * The trophy that is not shown: still in its box, the lid on and the string tied. It was awarded;
 * it has never been taken out.
 */
function boxed(a: Assembly, x: number, y: number, z: number): void {
  const kraft = linear('#9C7E55');
  const lid = linear('#AD9162');
  const string = linear('#DCD3B8');
  a.box('matte', [x, y + 0.0365, z], [0.088, 0.073, 0.074], 0.003, kraft);
  // The lid sits a little off true, as lids do.
  a.box('matte', [x + 0.003, y + 0.0845, z + 0.002], [0.094, 0.024, 0.079], 0.003, lid);
  // String round the box, front over the lid to the back, with a bow on top.
  a.box('matte', [x, y + 0.037, z + 0.0372], [0.005, 0.074, 0.0016], 0, string);
  a.box('matte', [x + 0.003, y + 0.0966, z + 0.002], [0.005, 0.0016, 0.08], 0, string);
  a.box('matte', [x + 0.003, y + 0.0845, z + 0.0418], [0.005, 0.024, 0.0016], 0, string);
  for (const side of [-1, 1] as const) a.torus('matte', { at: [x + 0.003 + side * 0.0085, y + 0.1005, z + 0.002], rot: [Math.PI / 2, 0, 0], scale: [1, 1.4, 1] }, 0.0075, 0.0017, 4, 8, string);
  // A paper label tied on, blank: nobody wrote what is in it.
  a.box('matte', [x - 0.02, y + 0.04, z + 0.0385], [0.026, 0.017, 0.0008], 0, linear('#E2DAC2'));
}

/** A ship in a bottle: a green bottle lying on two blocks, a hull and three sails inside. */
function shipInBottle(a: Assembly, x: number, y: number): void {
  const z = 0.19;
  const bottle = linear('#6FA58C');
  // Cradle blocks.
  for (const dx of [-0.07, 0.065]) a.span('wood', [x + dx - 0.012, x + dx + 0.012], [y, y + 0.022], [z - 0.034, z + 0.034], 0.004, WALNUT_LIGHT);
  const axisY = y + 0.047;
  // Body, shoulder and neck: a lathe on its side, glass.
  a.lathe(
    'glass',
    { at: [x - 0.1, axisY, z], rot: [0, 0, -Math.PI / 2] },
    [[0, 0], [0.026, 0.002], [0.0355, 0.02], [0.037, 0.07], [0.0345, 0.14], [0.026, 0.165], [0.014, 0.185], [0.0115, 0.2], [0.0115, 0.225], [0.0145, 0.231], [0.0145, 0.238], [0.012, 0.238], [0.0095, 0.226], [0.0095, 0.2], [0.012, 0.183], [0.0235, 0.163], [0.0325, 0.138], [0.0345, 0.07], [0.033, 0.02], [0.0235, 0.006], [0, 0.004]],
    14,
    bottle,
  );
  // The cork, in the neck.
  a.cyl('wood', { at: [x + 0.126, axisY, z], rot: [0, 0, Math.PI / 2] }, 0.0095, 0.0085, 0.022, 10, wood('#9A7A52'));
  // The ship: a hull, a stern deck, two masts and three sails, all standing in a blue-putty sea.
  const sea = linear('#3B5E70');
  a.span('matte', [x - 0.062, x + 0.052], [axisY - 0.031, axisY - 0.021], [z - 0.0195, z + 0.0195], 0.003, sea);
  a.span('wood', [x - 0.04, x + 0.036], [axisY - 0.021, axisY - 0.0085], [z - 0.012, z + 0.012], 0.002, wood('#2F2018'));
  a.span('wood', [x - 0.04, x - 0.024], [axisY - 0.0085, axisY - 0.0015], [z - 0.011, z + 0.011], 0.001, wood('#4C3426'));
  for (const [mx, h] of [[-0.012, 0.047], [0.016, 0.039]] as const) {
    a.cyl('wood', { at: [x + mx, axisY - 0.0085 + h / 2, z] }, 0.0013, 0.0013, h, 5, wood('#3B2A1F'));
    for (const [k, sw] of [[0.62, 0.014], [0.32, 0.017]] as const) {
      const sy = axisY - 0.0085 + h * k;
      a.quad('matte', [x + mx - sw, sy - 0.0105, z + 0.0013], [x + mx + sw, sy - 0.0105, z + 0.0013], [x + mx + sw * 0.8, sy + 0.0105, z + 0.0013], [x + mx - sw * 0.8, sy + 0.0105, z + 0.0013], [0, 0, 1], linear('#D6CFBA'));
      a.quad('matte', [x + mx + sw, sy - 0.0105, z - 0.0013], [x + mx - sw, sy - 0.0105, z - 0.0013], [x + mx - sw * 0.8, sy + 0.0105, z - 0.0013], [x + mx + sw * 0.8, sy + 0.0105, z - 0.0013], [0, 0, -1], linear('#D6CFBA'));
    }
  }
}
