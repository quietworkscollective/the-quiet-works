import { add, cross, dot, hash2, normalize, scale, sub, type Vec3 } from '../math.ts';

/**
 * The football's skin as a function of direction: twelve dark pentagons and twenty pale hexagons of
 * a truncated icosahedron, dark seams between them, a bicycle puncture patch on one panel, and the
 * scuffing of a ball that has been kicked about. It is evaluated per texel into the props' atlas
 * (an equirectangular map), so the panel edges are as sharp as the texture, not as coarse as a mesh.
 * Pure arithmetic: no canvas, so it is testable in node.
 */

const PHI = (1 + Math.sqrt(5)) / 2;
const at = <T>(list: readonly T[], i: number, fallback: T): T => list[i] ?? fallback;
const ICO: readonly Vec3[] = (
  [
    [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
    [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
    [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
  ] as const
).map((v) => normalize(v));
const FACES: readonly (readonly [number, number, number])[] = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];
const ORIGIN: Vec3 = [0, 1, 0];
const HEXAGONS: readonly Vec3[] = FACES.map(([a, b, c]) => normalize(add(add(at(ICO, a, ORIGIN), at(ICO, b, ORIGIN)), at(ICO, c, ORIGIN))));

interface Pentagon {
  centre: Vec3;
  /** Corners, in order round the centre. */
  corners: Vec3[];
  /** Inward normals of the five edge planes (geodesic edges). */
  edges: Vec3[];
}

/** A pentagon is the corner of the icosahedron cut off a third of the way along each of its five edges. */
const PENTAGONS: readonly Pentagon[] = ICO.map((centre) => {
  const neighbours = ICO.filter((v) => dot(v, centre) > 0.4 && dot(v, centre) < 0.5);
  const e1 = normalize(sub(at(neighbours, 0, ORIGIN), scale(centre, dot(at(neighbours, 0, ORIGIN), centre))));
  const e2 = cross(centre, e1);
  const ordered = [...neighbours].sort((p, q) => Math.atan2(dot(p, e2), dot(p, e1)) - Math.atan2(dot(q, e2), dot(q, e1)));
  const corners = ordered.map((n) => normalize(add(scale(centre, 2), n)));
  const edges = corners.map((c, i) => {
    const normal = normalize(cross(c, at(corners, (i + 1) % corners.length, c)));
    return dot(normal, centre) >= 0 ? normal : scale(normal, -1);
  });
  return { centre, corners, edges };
});

/** Half-width of a seam, in radians (a little over a degree each side). */
const SEAM = 0.021;

/** Where the puncture patch sits, as a direction from the ball's centre (front left, a little up). */
export const PATCH_DIRECTION: Vec3 = normalize([-0.42, 0.28, 0.86]);
const PATCH_RADIUS = 0.15;
const PATCH_RING = 0.19;

/** A pentagon's edge that has been stitched by hand: its two corners, on the right-hand side of the ball. */
export const STITCHED_EDGE: { from: Vec3; to: Vec3 } = (() => {
  const target = normalize([0.85, 0.12, 0.5]);
  let best = PENTAGONS[0];
  for (const p of PENTAGONS) if (best === undefined || dot(p.centre, target) > dot(best.centre, target)) best = p;
  const corners = best?.corners ?? [];
  return { from: at(corners, 0, ORIGIN), to: at(corners, 1, ORIGIN) };
})();

export type Rgb8 = readonly [number, number, number];

const WHITE: Rgb8 = [212, 204, 180];
const BLACK: Rgb8 = [38, 38, 41];
const SEAM_TONE: Rgb8 = [112, 104, 86];
const RUBBER: Rgb8 = [24, 24, 26];
const GLUE: Rgb8 = [196, 186, 158];

const angleTo = (p: Vec3, q: Vec3): number => Math.acos(Math.max(-1, Math.min(1, dot(p, q))));

export type Panel = 'pentagon' | 'hexagon' | 'seam' | 'patch' | 'glue';

/** Which panel a direction on the ball falls in. */
export function panelAt(p: Vec3): Panel {
  const patch = angleTo(p, PATCH_DIRECTION);
  if (patch < PATCH_RADIUS) return 'patch';
  if (patch < PATCH_RING) return 'glue';
  for (const pentagon of PENTAGONS) {
    if (dot(p, pentagon.centre) < 0.55) continue;
    // Signed angular distance to the nearest edge: positive inside the pentagon.
    let nearest = Infinity;
    for (const normal of pentagon.edges) nearest = Math.min(nearest, Math.asin(Math.max(-1, Math.min(1, dot(p, normal)))));
    if (nearest > SEAM) return 'pentagon';
    if (nearest > -SEAM) return 'seam';
  }
  // Hexagon-to-hexagon seams lie where two hexagon centres are equally near.
  let d1 = -1;
  let d2 = -1;
  for (const c of HEXAGONS) {
    const d = dot(p, c);
    if (d > d1) {
      d2 = d1;
      d1 = d;
    } else if (d > d2) d2 = d;
  }
  return d1 - d2 < 0.02 ? 'seam' : 'hexagon';
}

/** The colour of a texel (sRGB, 0 to 255): the panel, scuffed. `tx`, `ty` are texel coordinates for the scuff noise. */
export function ballTexel(p: Vec3, tx: number, ty: number): Rgb8 {
  const base = { pentagon: BLACK, hexagon: WHITE, seam: SEAM_TONE, patch: RUBBER, glue: GLUE }[panelAt(p)];
  // Scuffs: fine grain, a few broad rubbed patches, and a duller, dirtier underside.
  const grain = 0.93 + 0.07 * hash2(tx, ty * 7 + 3);
  const rub = 0.9 + 0.1 * hash2(Math.floor(tx / 9), Math.floor(ty / 9) + 101);
  const under = p[1] < -0.25 ? 0.84 : 1;
  const k = grain * rub * under;
  return [Math.round(base[0] * k), Math.round(base[1] * k), Math.round(base[2] * k)];
}

/** The map's size: 256 texels round the equator, 128 pole to pole, with a wrapped margin each side. */
export const BALL_MAP = { width: 256, height: 128, margin: 4 } as const;

/** The direction a texel looks at: column `x` (0..width-1, wrapping) and row `y` (0 at the north pole). */
export function texelDirection(x: number, y: number): Vec3 {
  const phi = ((x + 0.5) / BALL_MAP.width) * Math.PI * 2;
  const theta = ((y + 0.5) / BALL_MAP.height) * Math.PI;
  return [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
}
