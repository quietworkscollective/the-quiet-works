import { atlasUvs } from '../atlasLayout.ts';
import { IVORY, linear, METAL, mulRgb } from '../colours.ts';
import type { PropModel } from '../model.ts';
import { both, ramp, rad, X, type PoseSet } from '../motion.ts';
import type { Assembly } from '../parts.ts';
import type { Vec3 } from '../../math.ts';

/**
 * The walking boots (care): a pair, resoled, laces tied, standing at the foot of the wall with a
 * luggage tag on one. "Outing postponed; boots remain available." Choosing them lifts the near
 * boot and tips it to show its sole, new rubber with a pebble of the last walk still in the tread,
 * then sets it down. The tag swings a little on its string: the second of the props' own ambient
 * motions.
 */

const LEATHER = linear('#6A4426');
const LEATHER_WORN = linear('#4C3019');
const SOLE = linear('#34312E');
const MIDSOLE = linear('#C9BE9F');
const LACE = linear('#E0D8C0');
const BOOT_X = [0.078, -0.082] as const;
/** Boot geometry, boot-local: toe toward +z, heel at the wall side. */
const BOOT = { length: 0.29, width: 0.105, heelZ: 0.07 } as const;

/** The near boot is lifted by this and turned up onto its heel to show the sole. */
export const BOOT_TIP = { lift: 0.15, out: 0.1, angle: rad(-78) } as const;
export const TAG_SWING = rad(7);
const TIP_PIVOT: Vec3 = [BOOT_X[0], 0.07, BOOT.heelZ + BOOT.length / 2];

function boot(a: Assembly, cx: number, mirrored: boolean, tipped: boolean): void {
  const z0 = BOOT.heelZ;
  const z1 = BOOT.heelZ + BOOT.length;
  const zc = (z0 + z1) / 2;
  const hw = BOOT.width / 2;
  const lean = mirrored ? -1 : 1;
  const leatherAt = (y: number): readonly [number, number, number] => {
    // Darker and more worn toward the sole.
    const t = Math.min(1, Math.max(0, (y - 0.045) / 0.07));
    return [LEATHER_WORN[0] + (LEATHER[0] - LEATHER_WORN[0]) * t, LEATHER_WORN[1] + (LEATHER[1] - LEATHER_WORN[1]) * t, LEATHER_WORN[2] + (LEATHER[2] - LEATHER_WORN[2]) * t];
  };

  // Sole: a slab with a raised toe and a heel block, black rubber.
  a.box('matte', [cx, 0.0135, zc], [BOOT.width, 0.027, BOOT.length], 0.005, SOLE);
  a.box('matte', [cx, 0.0135, z0 + 0.02], [BOOT.width - 0.004, 0.03, 0.05], 0.004, SOLE);
  a.sphere('matte', { at: [cx, 0.02, z1 - 0.025], scale: [hw / 0.05, 0.5, 1.3] }, 0.05, 10, 6, SOLE);
  // Midsole: a cream stripe stepped in above it.
  a.box('matte', [cx, 0.036, zc], [BOOT.width - 0.006, 0.014, BOOT.length - 0.008], 0.004, MIDSOLE);
  // Lugs on the underside: new and sharp, in two rows of five.
  if (tipped) {
    for (let i = 0; i < 5; i += 1) {
      for (const dx of [-0.026, 0.026]) a.box('matte', [cx + dx, -0.0012, z0 + 0.04 + i * 0.045], [0.026, 0.004, 0.026], 0, mulRgb(SOLE, 2.0));
    }
  }
  // The pebble of the last walk, caught between lugs.
  if (tipped) a.sphere('matte', { at: [cx + 0.003, -0.0018, z0 + 0.062 + 0.0225] }, 0.0068, 6, 4, linear('#8E8A80'));

  // Upper: the foot, a toe cap, the shaft and its padded collar.
  a.box('matte', [cx, 0.069, zc - 0.018], [BOOT.width - 0.012, 0.05, BOOT.length - 0.05], 0.01, leatherAt(0.07));
  a.sphere('matte', { at: [cx, 0.066, z1 - 0.044], scale: [(hw - 0.006) / 0.045, 0.62, 1.1] }, 0.045, 10, 6, mulRgb(LEATHER, 0.92));
  a.cyl('matte', { at: [cx, 0.138, z0 + 0.075], scale: [1, 1, 1.12] }, 0.047, 0.052, 0.096, 12, (p) => leatherAt(p[1]));
  a.torus('matte', { at: [cx, 0.186, z0 + 0.075], rot: [Math.PI / 2, 0, 0], scale: [1, 1.12, 1] }, 0.0475, 0.0105, 5, 14, mulRgb(LEATHER_WORN, 1.15));
  // The dark of the boot's inside, just under the collar.
  a.cyl('matte', { at: [cx, 0.1868, z0 + 0.075], scale: [1, 1, 1.12] }, 0.0415, 0.0415, 0.001, 12, linear('#140D08'));
  // The dark of the boot's inside, just under the collar.
  a.cyl('matte', { at: [cx, 0.1868, z0 + 0.075], scale: [1, 1, 1.12] }, 0.0415, 0.0415, 0.001, 12, linear('#140D08'));
  // Tongue and lace field.
  a.box('matte', [cx, 0.123, z0 + 0.14], [0.05, 0.1, 0.012], 0.003, mulRgb(LEATHER, 0.88), undefined, []);
  // Eyelets and laces, crossed four times and tied in a bow.
  for (let k = 0; k < 5; k += 1) {
    const y = 0.088 + k * 0.021;
    const z = z0 + 0.152 - k * 0.0125;
    for (const dx of [-0.024, 0.024]) a.cyl('brass', { at: [cx + dx, y, z + 0.0045], rot: [Math.PI / 2, 0, 0] }, 0.0035, 0.0035, 0.003, 6, METAL.brass);
    a.rod('matte', [cx - 0.024, y, z + 0.007], [cx + 0.024, y + 0.012, z + 0.0085], 0.0023, 4, LACE);
    a.rod('matte', [cx + 0.024, y, z + 0.007], [cx - 0.024, y + 0.012, z + 0.0085], 0.0023, 4, LACE);
  }
  const bowY = 0.196;
  const bowZ = z0 + 0.1;
  for (const side of [-1, 1] as const) {
    a.torus('matte', { at: [cx + side * 0.016, bowY, bowZ], rot: [0, Math.PI / 2, 0], scale: [1, 1.6, 1] }, 0.0085, 0.0022, 4, 8, LACE);
    a.rod('matte', [cx, bowY - 0.002, bowZ], [cx + side * 0.012 * lean, bowY - 0.04, bowZ + 0.006], 0.002, 4, LACE);
  }
}

export const walkingBoots: PropModel = {
  id: 'walking-boots',

  parts: () => [
    { name: 'boot', pivot: TIP_PIVOT },
    { name: 'tag', pivot: [BOOT_X[1] - 0.04, 0.2, BOOT.heelZ + 0.075] },
  ],

  build(a) {
    const near = a.part('boot');
    const tag = a.part('tag');

    a.on(near, () => boot(a, BOOT_X[0], false, true));
    boot(a, BOOT_X[1], true, false);

    // The luggage tag, tied to the far boot's collar by a string, swinging from it.
    const tx = BOOT_X[1] - 0.04;
    const ty = 0.2;
    const tz = BOOT.heelZ + 0.075;
    a.on(tag, () => {
      a.rod('matte', [tx, ty, tz], [tx - 0.002, ty - 0.036, tz + 0.018], 0.0009, 4, linear('#B0A07A'));
      a.cyl('brass', { at: [tx - 0.002, ty - 0.038, tz + 0.0185], rot: [Math.PI / 2, 0, 0] }, 0.0042, 0.0042, 0.003, 6, METAL.brass);
      // Two faces: the front reads as lettered, the back reads true from behind.
      const w = 0.07;
      const h = 0.105;
      const cx = tx - 0.002;
      const top = ty - 0.04;
      const z = tz + 0.0192;
      a.quad('print', [cx - w / 2, top - h, z], [cx + w / 2, top - h, z], [cx + w / 2, top, z], [cx - w / 2, top, z], [0, 0, 1], undefined, atlasUvs('bootTag'));
      a.quad('print', [cx + w / 2, top - h, z - 0.0012], [cx - w / 2, top - h, z - 0.0012], [cx - w / 2, top, z - 0.0012], [cx + w / 2, top, z - 0.0012], [0, 0, -1], undefined, atlasUvs('bootTag'));
    });

    // An ivory toggle on the near boot's lace ends: where a hand would take it.
    a.on(near, () => {
      a.ivory(() => {
        a.cyl('enamel', { at: [BOOT_X[0] + 0.012, 0.171, BOOT.heelZ + 0.108], rot: [0.3, 0, 1.35] }, 0.0038, 0.0038, 0.026, 8, IVORY);
        a.sphere('enamel', { at: [BOOT_X[0] + 0.0, 0.1615, BOOT.heelZ + 0.114] }, 0.0042, 7, 5, IVORY);
      });
    });

    a.hit([-0.15, 0, 0.05], [0.15, 0.24, 0.38]);
  },

  pose(motion, ambient) {
    const set: PoseSet = {};
    const tip = ramp(motion.action, 0.0, 0.7);
    if (tip !== 0) set['boot'] = both([0, BOOT_TIP.lift * tip, BOOT_TIP.out * tip], X, BOOT_TIP.angle * tip);
    if (ambient.tag !== 0) set['tag'] = both([0, 0, 0], X, ambient.tag * TAG_SWING);
    return set;
  },
};
