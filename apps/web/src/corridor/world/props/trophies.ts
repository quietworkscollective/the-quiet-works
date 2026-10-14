import { CORRIDOR_PROPS } from '@tqw/engine';
import { atlasUvs, type AtlasId } from './atlasLayout.ts';
import { linear, METAL, wood } from './colours.ts';
import type { Assembly, Tint } from './parts.ts';
import type { Vec3 } from '../math.ts';

/**
 * The cabinet's contents: three engraved trophies, the last space kept, and the ordinary team
 * mug. The engravings are `CORRIDOR_PROPS.trophies`, in order; the plates are drawn from them
 * (see atlasPaint.ts), never retyped here.
 */

export const TROPHY_PLATES: readonly AtlasId[] = ['plateComposed', 'plateEffort', 'plateRunner'];
export const TROPHY_TEXT: readonly string[] = CORRIDOR_PROPS.trophies;

interface CupSpec {
  at: Vec3;
  scale: number;
  tint: Tint;
  /** A loving cup is broad, with a short stem. */
  broad?: boolean;
}

/** The cup, revolved: foot, knopped stem, flared bowl, rolled rim, a hollow inside. */
function cupProfile(broad: boolean): [number, number][] {
  if (broad) {
    return [
      [0, 0], [0.036, 0], [0.034, 0.01], [0.017, 0.015], [0.0095, 0.038], [0.015, 0.047], [0.011, 0.054], [0.034, 0.07],
      [0.057, 0.108], [0.056, 0.124], [0.0545, 0.139], [0.0495, 0.1345], [0.0515, 0.106], [0.032, 0.078], [0.0, 0.074],
    ];
  }
  return [
    [0, 0], [0.034, 0], [0.034, 0.009], [0.02, 0.0125], [0.009, 0.04], [0.0165, 0.0505], [0.0085, 0.076], [0.027, 0.094],
    [0.046, 0.138], [0.0405, 0.165], [0.0435, 0.17], [0.0385, 0.1655], [0.0435, 0.138], [0.0245, 0.095], [0.0, 0.09],
  ];
}

/** A cup with two ear handles, on its own centre line. */
export function cup(a: Assembly, spec: CupSpec): void {
  const { at, scale: s, tint } = spec;
  const broad = spec.broad ?? false;
  a.lathe('brass', { at, scale: [s, s, s] }, cupProfile(broad), 18, tint);
  const bowl = broad ? { y: 0.104, r: 0.058 } : { y: 0.134, r: 0.0455 };
  const arm = broad ? 0.03 : 0.028;
  for (const side of [-1, 1] as const) {
    a.torus('brass', { at: [at[0] + side * bowl.r * s, at[1] + bowl.y * s, at[2]], rot: [0, 0, side > 0 ? -Math.PI / 2 : Math.PI / 2], scale: [s, s, s] }, arm * 0.7, 0.0042, 4, 9, tint, Math.PI);
  }
}

/** A walnut plinth with a brass-framed engraved plate on its front. Returns the plinth's top y. */
export function plinth(a: Assembly, x: number, y: number, z: number, width: number, plate: AtlasId): number {
  const h = 0.032;
  const d = 0.09;
  a.box('wood', [x, y + h / 2, z], [width, h, d], 0.003, wood('#4A2F1F'));
  a.box('wood', [x, y + h + 0.004, z], [width - 0.012, 0.008, d - 0.012], 0.002, wood('#573626'));
  // The plate: about 5,600 px/m in the atlas, so a 20 mm plate is 112 px tall.
  const wide = plate === 'plateRunner';
  const pw = Math.min(width - 0.014, wide ? 0.104 : 0.082);
  const ph = pw * (96 / (wide ? 520 : 400));
  const py = y + h / 2;
  const pz = z + d / 2 + 0.0008;
  a.span('brass', [x - pw / 2 - 0.0025, x + pw / 2 + 0.0025], [py - ph / 2 - 0.0025, py + ph / 2 + 0.0025], [pz - 0.0006, pz + 0.0004], 0, METAL.polished);
  a.quad('print', [x - pw / 2, py - ph / 2, pz + 0.0006], [x + pw / 2, py - ph / 2, pz + 0.0006], [x + pw / 2, py + ph / 2, pz + 0.0006], [x - pw / 2, py + ph / 2, pz + 0.0006], [0, 0, 1], undefined, atlasUvs(plate));
  return y + h + 0.008;
}

/** The ordinary team mug: white enamel with a maroon band, a worn rim, one handle. */
export function teamMug(a: Assembly, at: Vec3): void {
  const cream = linear('#E2DCCB');
  const band = linear('#6C2E38');
  a.lathe(
    'enamel',
    { at },
    [
      [0, 0], [0.03, 0], [0.0355, 0.0045], [0.0365, 0.02], [0.0365, 0.078], [0.0375, 0.0805], [0.0365, 0.083], [0.0345, 0.0815],
      [0.0335, 0.0785], [0.034, 0.02], [0.0325, 0.007], [0, 0.0055],
    ],
    16,
    (p) => (p[1] - at[1] > 0.04 && p[1] - at[1] < 0.054 ? band : cream),
  );
  a.torus('enamel', { at: [at[0] + 0.0365, at[1] + 0.045, at[2]], rot: [0, 0, -Math.PI / 2] }, 0.0215, 0.0046, 4, 9, cream, Math.PI);
}

/**
 * The kept space on the lowest shelf: a disc of clean polish in the dust of the rest, where
 * something will stand, and a small brass-footed tent card saying so.
 */
export function reservedSpace(a: Assembly, x: number, shelfTop: number, zRing: number, zCard: number): void {
  a.cyl('enamel', { at: [x, shelfTop + 0.0004, zRing] }, 0.05, 0.05, 0.0008, 20, linear('#24150E'));
  const w = 0.058;
  const h = 0.0326;
  const cy = shelfTop + 0.0215;
  a.span('brass', [x - w / 2 - 0.002, x + w / 2 + 0.002], [shelfTop, shelfTop + 0.004], [zCard - 0.008, zCard + 0.004], 0.0006, METAL.polished);
  a.span('matte', [x - w / 2, x + w / 2], [cy - h / 2, cy + h / 2], [zCard - 0.0016, zCard], 0, linear('#CFC6AF'));
  a.quad('print', [x - w / 2, cy - h / 2, zCard + 0.0006], [x + w / 2, cy - h / 2, zCard + 0.0006], [x + w / 2, cy + h / 2, zCard + 0.0006], [x - w / 2, cy + h / 2, zCard + 0.0006], [0, 0, 1], undefined, atlasUvs('reserved'));
}
