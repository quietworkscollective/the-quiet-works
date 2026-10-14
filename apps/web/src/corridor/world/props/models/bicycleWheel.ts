import { linear, METAL, IVORY, wood } from '../colours.ts';
import { easeOut, turned, Z, type PoseSet } from '../motion.ts';
import type { PropModel } from '../model.ts';

/**
 * The bicycle wheel (play): a rear wheel hung by its axle from a wall post, a spoke key on a hook
 * beside it. Turning it sends it round on its post and lets it run down over three seconds; a
 * little brass tick is the sound. The valve and the quick-release lever mark where it is, so the
 * turn is legible; the wheel ends exactly where it began.
 */

const R = { tyre: 0.318, tyreTube: 0.0145, rim: 0.298, flange: 0.03, spokeRim: 0.2955 };
/** The wheel plane's distance from the wall: the post is 0.07 m long and the hub sits on it. */
const HUB_Z = 0.112;

/**
 * Full turns of the wheel over the action: whole, so at action 1 it sits exactly where it began and
 * the interaction lane's cut from 1 to 0 (the wheel has no return) cannot be seen.
 */
export const WHEEL_TURNS = 2;
/** How hard the wheel spins down: higher is faster at first and longer at the end. */
const EASE = 2.2;
/** Under reduced motion the wheel is moved, not spun: one nudge that is undone after the hold. */
export const WHEEL_NUDGE = Math.PI / 4;

const TYRE_TAN = linear('#8D8264');
const TYRE_BLACK = linear('#17181A');
const RIM_ALLOY = linear('#B7BCBE');
const SPOKE = linear('#C5CACB');

/** The wheel's angle for an action, in radians about its axle (clockwise as seen from the room is negative). */
export function wheelAngle(action: number, reduced = false): number {
  if (reduced) return -WHEEL_NUDGE * action;
  return -2 * Math.PI * WHEEL_TURNS * easeOut(action, EASE);
}

export const bicycleWheel: PropModel = {
  id: 'bicycle-wheel',

  parts: (placement) => [{ name: 'wheel', pivot: [0, placement.height, HUB_Z] }],

  build(a, placement) {
    const H = placement.height;
    const wheel = a.part('wheel');

    // The post and plate it hangs from: a steel plate on the plaster, a post out to the hub.
    a.span('steel', [-0.05, 0.05], [H - 0.06, H + 0.06], [0, 0.007], 0.002, METAL.steel);
    a.cyl('steel', { at: [0, H, 0.045], rot: [Math.PI / 2, 0, 0] }, 0.0095, 0.0095, 0.09, 8, METAL.steel);
    for (const [x, y] of [[-0.035, H - 0.045], [0.035, H - 0.045], [-0.035, H + 0.045], [0.035, H + 0.045]] as const) {
      a.cyl('brass', { at: [x, y, 0.0095], rot: [Math.PI / 2, 0, 0] }, 0.0055, 0.0055, 0.005, 8, METAL.brass);
    }

    a.on(wheel, () => {
      // Tyre: gum sidewalls, black tread.
      a.torus(
        'matte',
        { at: [0, H, HUB_Z] },
        R.tyre,
        R.tyreTube,
        8,
        40,
        (_p, n) => (Math.abs(n[2]) > 0.55 ? TYRE_TAN : TYRE_BLACK),
      );
      // Rim: a shallow channel, bright alloy.
      a.lathe(
        'steel',
        { at: [0, H, HUB_Z], rot: [Math.PI / 2, 0, 0] },
        [
          [0.2885, -0.0105],
          [0.3, -0.0115],
          [0.3045, -0.0075],
          [0.3045, 0.0075],
          [0.3, 0.0115],
          [0.2885, 0.0105],
          [0.2885, -0.0105],
        ],
        40,
        RIM_ALLOY,
      );
      // Hub: barrel and two flanges, a lathe about the axle.
      a.lathe(
        'steel',
        { at: [0, H, HUB_Z], rot: [Math.PI / 2, 0, 0] },
        [
          [0.0, -0.036],
          [0.0125, -0.036],
          [0.0125, -0.025],
          [0.03, -0.024],
          [0.03, -0.019],
          [0.0125, -0.018],
          [0.0125, 0.018],
          [0.03, 0.019],
          [0.03, 0.024],
          [0.0125, 0.025],
          [0.0125, 0.036],
          [0.0, 0.036],
        ],
        12,
        METAL.steel,
      );
      // Spokes: thirty-two, laced three-cross, sixteen to a flange.
      const per = 16;
      for (let i = 0; i < per * 2; i += 1) {
        const side = i % 2 === 0 ? 1 : -1;
        const k = Math.floor(i / 2);
        const phi = (k / per) * Math.PI * 2 + (side > 0 ? 0 : Math.PI / per);
        const lean = (side > 0 ? 1 : -1) * 1.18 * (k % 2 === 0 ? 1 : -1);
        const flangeZ = HUB_Z + side * 0.0215;
        const from: [number, number, number] = [Math.cos(phi) * R.flange, H + Math.sin(phi) * R.flange, flangeZ];
        const to: [number, number, number] = [Math.cos(phi + lean) * R.spokeRim, H + Math.sin(phi + lean) * R.spokeRim, HUB_Z + side * 0.0012];
        a.rod('steel', from, to, 0.00085, 3, SPOKE);
      }
      // Cassette on the room side: six sprockets, smallest outermost.
      [0.034, 0.03, 0.026, 0.022, 0.019].forEach((r, i) => {
        a.cyl('steel', { at: [0, H, HUB_Z + 0.027 + i * 0.0052], rot: [Math.PI / 2, 0, 0] }, r, r, 0.0036, 14, i % 2 === 0 ? METAL.steel : METAL.iron);
      });
      // Valve stem and cap, at the top of the rim.
      a.cyl('brass', { at: [0, H + 0.275, HUB_Z] }, 0.0035, 0.0045, 0.028, 6, METAL.polished);
      a.cyl('brass', { at: [0, H + 0.2885, HUB_Z] }, 0.0045, 0.0045, 0.008, 6, METAL.polished);
      // Quick-release lever: a skewer end and its cam, turned a few degrees so it is never ruled.
      a.cyl('steel', { at: [0, H, HUB_Z + 0.075], rot: [Math.PI / 2, 0, 0] }, 0.0085, 0.0085, 0.02, 8, METAL.steel);
      a.box('steel', [0.026, H + 0.012, HUB_Z + 0.078], [0.056, 0.01, 0.007], 0.0015, METAL.steel);
    });

    // The spoke key on its brass hook: an ivory handle and a steel nipple wrench.
    const hookX = 0.41;
    const hookY = H + 0.18;
    a.cyl('brass', { at: [hookX, hookY, 0.016], rot: [Math.PI / 2, 0, 0] }, 0.0042, 0.0042, 0.032, 8, METAL.brass);
    a.sphere('brass', { at: [hookX, hookY, 0.033] }, 0.0065, 8, 6, METAL.brass);
    a.rod('matte', [hookX, hookY - 0.002, 0.033], [hookX, hookY - 0.045, 0.036], 0.0011, 4, linear('#5A4B35'));
    a.ivory(() => {
      a.cyl('enamel', { at: [hookX, hookY - 0.068, 0.037] }, 0.0075, 0.0095, 0.046, 12, IVORY);
      a.sphere('enamel', { at: [hookX, hookY - 0.0455, 0.037] }, 0.0075, 10, 6, IVORY, undefined, Math.PI * 2, Math.PI / 2);
    });
    a.cyl('steel', { at: [hookX, hookY - 0.104, 0.037] }, 0.0042, 0.0042, 0.026, 6, METAL.steel);
    a.box('steel', [hookX, hookY - 0.121, 0.037], [0.011, 0.009, 0.005], 0.001, METAL.steel);
    // A little oak rosette behind the hook, where the plaster has been drilled.
    a.cyl('wood', { at: [hookX, hookY, 0.0045], rot: [Math.PI / 2, 0, 0] }, 0.02, 0.02, 0.009, 14, wood('#4a3322'));
  },

  pose(motion, _ambient, reducedMotion) {
    const set: PoseSet = {};
    const angle = wheelAngle(motion.action, reducedMotion);
    if (angle !== 0) set['wheel'] = turned(Z, angle);
    return set;
  },
};
