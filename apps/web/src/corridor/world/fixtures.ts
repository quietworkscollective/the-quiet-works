import { Matrix4 } from 'three';
import { Bucket } from './builder.ts';
import { kelvinToLinear, mulRgb } from './colour.ts';
import { BRASS_TINT } from './palette.ts';
import { CORRIDOR, WALK_LIMITS } from '../layout.ts';
import { CORRIDOR_END_Z } from './extent.ts';
import { corridorSconceSlots, LOBBY_SCONCES, PROP_SCONCES } from './lighting.ts';
import type { Vec3 } from './math.ts';
import { lathe, stud, torus } from './shapes.ts';

/**
 * Wall sconces: the repeated fixtures, built once and instanced. Local
 * frames: a sconce's origin is on the wall plane at the lantern's centre height, +z out of the
 * wall; a radiator's origin is on the wall plane at the floor.
 */


/** A mounted instance: where on the wall, and which way the wall faces (yaw of local +z). */
export interface Mount {
  position: Vec3;
  /** Rotation about y so local +z points out of the wall. */
  yaw: number;
}

const YAW_FOR_NORMAL = { 'x+': Math.PI / 2, 'x-': -Math.PI / 2, 'z+': 0, 'z-': Math.PI } as const;

export function mountMatrix(m: Mount): Matrix4 {
  return new Matrix4().makeRotationY(m.yaw).setPosition(...m.position);
}

/** Every sconce: the corridor's two rows to the far fog, and the lobby's own. */
export function sconceMounts(): Mount[] {
  const out: Mount[] = [];
  for (const s of corridorSconceSlots(CORRIDOR_END_Z)) {
    out.push({ position: [s.side === 'left' ? -CORRIDOR.width / 2 : CORRIDOR.width / 2, CORRIDOR.sconce.y, s.z], yaw: s.side === 'left' ? YAW_FOR_NORMAL['x+'] : YAW_FOR_NORMAL['x-'] });
  }
  for (const s of PROP_SCONCES) {
    out.push({ position: [s.side === 'left' ? -CORRIDOR.width / 2 : CORRIDOR.width / 2, CORRIDOR.sconce.y, s.z], yaw: s.side === 'left' ? YAW_FOR_NORMAL['x+'] : YAW_FOR_NORMAL['x-'] });
  }
  for (const l of LOBBY_SCONCES) {
    out.push({ position: [l.x, l.y ?? CORRIDOR.sconce.y, l.z], yaw: YAW_FOR_NORMAL[l.face] });
  }
  return out;
}

/**
 * Beyond this z a sconce is only ever seen from the walkable end of the corridor, eight metres or
 * more off and half lost in fog, so it gets the light-weight lantern. Static: no per-frame work.
 */
export const SCONCE_FAR_Z = WALK_LIMITS.minZ - 8;

/** The sconces split by how close the visitor can get to them. */
export function sconceGroups(): { near: Mount[]; far: Mount[] } {
  const all = sconceMounts();
  return { near: all.filter((m) => m.position[2] >= SCONCE_FAR_Z), far: all.filter((m) => m.position[2] < SCONCE_FAR_Z) };
}

/** The lantern glass colour: 2700 K, over-bright so it reads as the source after tone mapping. */
export const SCONCE_GLASS = mulRgb(kelvinToLinear(CORRIDOR.sconce.kelvin), 2.6);

/**
 * A brass wall lantern: round backplate, a swan arm into a cup, an opal-glass tulip shade and a
 * capped top. The glass goes in `glass` (self-lit), the metal in `brass`.
 */
export function buildSconce(detail: 'near' | 'far' = 'near'): { brass: Bucket; glass: Bucket } {
  const brass = new Bucket();
  const glass = new Bucket();
  const metal = { colour: BRASS_TINT };
  const z = 0.13;
  const near = detail === 'near';
  const round = near ? 24 : 10;
  // Backplate and arm.
  stud(brass, [0, -0.06, 0.008], 0.07, 0.074, 0.016, near ? 28 : 12, metal);
  torus(brass, { at: [0, -0.06, 0.016] }, 0.062, 0.005, near ? 5 : 3, near ? 28 : 12, metal);
  stud(brass, [0, -0.1, 0.07], 0.0105, 0.0105, 0.12, near ? 12 : 6, metal);
  // Cup under the shade.
  lathe(
    brass,
    { at: [0, -0.1, z] },
    [
      [0.001, -0.026],
      [0.014, -0.022],
      [0.036, -0.012],
      [0.056, 0.0],
      [0.058, 0.012],
      [0.052, 0.014],
    ],
    round,
    metal,
  );
  // Opal glass tulip shade, closed over the top by a brass cap.
  lathe(
    glass,
    { at: [0, -0.1, z] },
    [
      [0.05, 0.012],
      [0.062, 0.05],
      [0.068, 0.1],
      [0.066, 0.15],
      [0.056, 0.2],
      [0.046, 0.232],
    ],
    round,
    // Brightest at the belly of the tulip, a shade dimmer at the cup and cap where the metal shadows it.
    { colour: SCONCE_GLASS, shade: (p) => 0.62 + 0.38 * Math.exp(-Math.pow((p[1] + 0.1 - 0.1) / 0.075, 2)) },
  );
  lathe(
    brass,
    { at: [0, -0.1, z] },
    [
      [0.001, 0.262],
      [0.02, 0.256],
      [0.046, 0.238],
      [0.052, 0.228],
      [0.044, 0.226],
      [0.03, 0.236],
    ],
    round,
    metal,
  );
  if (near) stud(brass, [0, 0.176, z + 0.0], 0.006, 0.006, 0.012, 8, metal);
  return { brass, glass };
}

/* ------------------------------------------------------------------------------------------ */
/* Scanned column radiators                                                                   */
/* ------------------------------------------------------------------------------------------ */

/** The scanned model's measured footprint: length along the wall, height and wall stand-off. */
export const RADIATOR = { length: 0.5784, height: 0.6855, depth: 0.106 } as const;

/** Radiators stand in front of the dado at these corridor positions (z, side): piers wide enough for one. */
export const RADIATOR_SLOTS: readonly { side: 'left' | 'right'; z: number }[] = [
  { side: 'left', z: -6.25 },
  { side: 'right', z: -9.6 },
  { side: 'left', z: -10.0 },
  { side: 'right', z: -13.6 },
  { side: 'right', z: -16.7 },
  { side: 'left', z: -16.4 },
];

export function radiatorMounts(): Mount[] {
  return RADIATOR_SLOTS.map((s) => ({
    position: [s.side === 'left' ? -CORRIDOR.width / 2 + RADIATOR.depth / 2 : CORRIDOR.width / 2 - RADIATOR.depth / 2, 0, s.z],
    yaw: s.side === 'left' ? YAW_FOR_NORMAL['x+'] : YAW_FOR_NORMAL['x-'],
  }));
}
