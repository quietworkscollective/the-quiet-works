import { tri, type Style } from '../builder.ts';
import type { Buckets } from '../buckets.ts';
import { ART, ART_ATLAS, uvRect } from '../artLayout.ts';
import type { Rgb } from '../colour.ts';
import type { Vec2, Vec3 } from '../math.ts';
import { BRASS_TINT } from '../palette.ts';
import { cylinder, lathe, sphere, stud, torus } from '../shapes.ts';
import { LOBBY } from '../../layout.ts';
import { LOBBY_FRAMES } from './lobby.ts';
import { FAN_SWITCH, LOBBY_CLOCK, PENDANTS } from './lobbyPlan.ts';
import { at, wallBox } from './wall.ts';

/**
 * The lobby's small furnishings (ADR 0004): two brass pendants, the fan's service switch, the
 * clock over the corridor doors. (The lobby's one plant is the props lane's, beside its watering can.)
 * Static parts only; whatever of these moves (the clock's hands, the switch's tag) is built beside its animation.
 */

/** A pendant lamp's glass: warm, over-bright so it reads as the source after tone mapping. */
const GLOBE: Rgb = [3.6, 2.3, 1.0];

/** Two brass pendants down the middle of the lobby: a ceiling rose, a rod, a dome shade and an opal globe. */
export function buildPendants(b: Buckets): void {
  const metal = { colour: BRASS_TINT };
  const ceiling = LOBBY.height;
  for (const z of PENDANTS) {
    const rodTop = ceiling - 0.02;
    const shadeTop = 3.42;
    cylinder(b.brass, { at: [0, rodTop - 0.01, z] }, 0.09, 0.09, 0.03, 20, metal);
    cylinder(b.brass, { at: [0, (rodTop + shadeTop) / 2, z] }, 0.011, 0.011, rodTop - shadeTop, 8, metal);
    // The shade: a shallow brass dome, flared at its lip.
    lathe(
      b.brass,
      { at: [0, shadeTop, z] },
      [
        [0.018, 0.0],
        [0.05, -0.012],
        [0.11, -0.04],
        [0.17, -0.09],
        [0.205, -0.155],
        [0.215, -0.185],
        [0.2, -0.19],
        [0.16, -0.135],
        [0.1, -0.085],
        [0.04, -0.05],
      ],
      24,
      metal,
    );
    torus(b.brass, { at: [0, shadeTop - 0.188, z], rot: [Math.PI / 2, 0, 0] }, 0.205, 0.007, 5, 28, metal);
    sphere(b.lamp, { at: [0, shadeTop - 0.2, z] }, 0.125, 18, 12, { colour: GLOBE });
  }
}

/** The fan's service switch: a brass plate with a toggle, on the wall under the window's right-hand end. */
export function buildFanSwitch(b: Buckets): void {
  const f = LOBBY_FRAMES.left;
  const metal = { colour: BRASS_TINT };
  const { s, y } = FAN_SWITCH;
  wallBox(b.brass, f, [s - 0.043, s + 0.043], [y - 0.065, y + 0.065], [0, 0.011], 0.002, metal);
  const toggle = at(f, 0.02, y + 0.006, s);
  cylinder(b.iron, { at: [toggle[0] + 0.012, toggle[1] + 0.004, toggle[2]], rot: [0, 0, Math.PI / 2 - 0.35] }, 0.005, 0.0068, 0.034, 8, { colour: [0.05, 0.05, 0.055] });
  for (const dy of [-0.05, 0.05]) {
    const screw = at(f, 0.011, y + dy, s);
    stud(b.brass, [screw[0], screw[1], screw[2]], 0.004, 0.004, 0.002, 6, metal);
  }
}

/** Where the clock's hands pivot, in the world: out of the end wall from the dial's centre. */
export function clockPivot(): [number, number, number] {
  const p = at(LOBBY_FRAMES.end, 0.086, LOBBY_CLOCK.y, LOBBY_CLOCK.x);
  return [p[0], p[1], p[2]];
}

/** The lobby clock's case, bezel and dial, on the end wall to the right of the lettering. */
export function buildClock(b: Buckets): void {
  const f = LOBBY_FRAMES.end;
  const metal = { colour: BRASS_TINT };
  const { x, y, radius } = LOBBY_CLOCK;
  const wallOf = (depth: number): Vec3 => at(f, depth, y, x);
  // The case: a dark drum on the wall, a brass bezel, and a short brass boss at the dial's centre.
  const drum = wallOf(0.03);
  cylinder(b.iron, { at: [drum[0], drum[1], drum[2]], rot: [Math.PI / 2, 0, 0] }, radius + 0.022, radius + 0.022, 0.06, 36, { colour: [0.05, 0.05, 0.055] });
  const bezel = wallOf(0.06);
  torus(b.brass, { at: [bezel[0], bezel[1], bezel[2]] }, radius + 0.006, 0.02, 7, 40, metal);
  // The dial: a disc of ivory with the dial art mapped onto it.
  const face = wallOf(0.064);
  const uv = uvRect(ART.clock, ART_ATLAS.width, ART_ATLAS.height);
  const n = 40;
  const r = radius - 0.008;
  const point = (i: number): [Vec3, Vec2] => {
    const a = (i / n) * Math.PI * 2;
    const u = Math.cos(a);
    const v = Math.sin(a);
    return [[face[0] + u * r, face[1] + v * r, face[2]], [(uv[0] + uv[2]) / 2 + (u * (uv[2] - uv[0])) / 2, (uv[1] + uv[3]) / 2 + (v * (uv[3] - uv[1])) / 2]];
  };
  const centreUv: Vec2 = [(uv[0] + uv[2]) / 2, (uv[1] + uv[3]) / 2];
  const style: Style = { colour: [1, 1, 1] };
  for (let i = 0; i < n; i += 1) {
    const [p0, uv0] = point(i);
    const [p1, uv1] = point(i + 1);
    tri(b.art, [face[0], face[1], face[2]], p0, p1, style, [0, 0, 1], [centreUv, uv0, uv1]);
  }
}

