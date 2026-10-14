import { bar, cylinder, lathe, sphere, torus } from './shapes.ts';
import { box, quad } from './builder.ts';
import type { Buckets } from './buckets.ts';
import { linear, mulRgb, type Rgb } from './colour.ts';
import { BRASS_TINT } from './palette.ts';
import { CORRIDOR } from '../layout.ts';
import { RADIATOR } from './fixtures.ts';
import type { Vec3 } from './math.ts';

/**
 * Present-day care (founder feedback: show that someone has been here recently, not that the
 * building was abandoned). A few small, neat, ordinary things, each left where it would be left:
 * a coat and a cap on a hook rail, a mug on a radiator, a folded newspaper on another, a rubber
 * door wedge beside a door that has been propped. Nothing broken, nothing out of place, nothing
 * that implies a person is about (ADR 0004). They sit in the walkable bays, in view from the
 * first look down the corridor.
 */

const HW = CORRIDOR.width / 2;
/** The coat rail's length along the wall, metres. */
export const RAIL_LENGTH = 0.66;

/** Where each thing stands: world z (the corridor runs toward -z) and the wall it belongs to. */
export const CARE = {
  coat: { side: 'left', z: -2.05, railY: 1.74 },
  mug: { side: 'left', z: -6.25 + 0.2 },
  newspaper: { side: 'right', z: -9.6 - 0.12 },
  wedge: { side: 'right', z: -1.78 },
} as const;

const wallX = (side: 'left' | 'right'): number => (side === 'left' ? -HW : HW);
/** Out of the wall, into the corridor. */
const outward = (side: 'left' | 'right'): number => (side === 'left' ? 1 : -1);

const COAT: Rgb = linear('#4A3F36');
const COAT_DARK: Rgb = linear('#33291F');
const CAMEL: Rgb = linear('#8A6A44');
const TWEED: Rgb = CAMEL;
const CREAM: Rgb = linear('#E6DCC4');
const COFFEE: Rgb = linear('#2A170C');
const PAPER: Rgb = linear('#D8CFB8');
const INK: Rgb = linear('#3A352E');
const WEDGE_RED: Rgb = linear('#6B2A22');

/** A rail of oak with three brass hooks, a wool coat on the middle one and a flat cap on the last. */
export function coatAndCap(b: Buckets): void {
  const { side, z, railY } = CARE.coat;
  const x0 = wallX(side);
  const k = outward(side);
  const oak = { colour: [1.5, 1.28, 1.05] as Rgb };
  // The rail: 0.66 m long, 9 cm high, standing 3 cm off the wall: it fits between the first door's architrave
  // and the football the props lane hangs at z = -3.1, under the first sconce's reach.
  box(b.oak, [x0 + k * 0.015, railY, z], [0.03, 0.09, RAIL_LENGTH], 0.003, oak);
  const hookZ = [z + 0.24, z, z - 0.24];
  for (const hz of hookZ) {
    cylinder(b.brass, { at: [x0 + k * 0.048, railY, hz], rot: [0, 0, Math.PI / 2] }, 0.0045, 0.0045, 0.05, 6, { colour: BRASS_TINT });
    sphere(b.brass, { at: [x0 + k * 0.078, railY, hz] }, 0.0075, 8, 6, { colour: BRASS_TINT });
  }

  // The coat, hung by its loop from the middle hook: a flattened body, two sleeves, a collar.
  const hang: Vec3 = [x0 + k * 0.085, railY - 0.02, z];
  const top = hang[1] - 0.015;
  const wool = { colour: COAT };
  // Ten facets, so the light catches it in folds rather than as one flat slab.
  lathe(
    b.paint,
    { at: [hang[0] + k * 0.06, top, hang[2]], scale: [0.36, 1, 1] },
    [
      [0.001, -0.005],
      [0.05, -0.012],
      [0.16, -0.05],
      [0.2, -0.11],
      [0.185, -0.3],
      [0.17, -0.45],
      [0.2, -0.62],
      [0.235, -0.8],
      [0.24, -0.84],
    ],
    10,
    wool,
  );
  // The front opening: a darker lapel line down the middle.
  bar(b.paint, { at: [hang[0] + k * 0.135, top - 0.43, z] }, [0.006, 0.78, 0.012], { colour: COAT_DARK });
  // Sleeves, hanging a little forward of the body at its sides.
  for (const sign of [-1, 1]) {
    cylinder(b.paint, { at: [hang[0] + k * 0.105, top - 0.33, z + sign * 0.205], rot: [sign * 0.09, 0, k * 0.08] }, 0.046, 0.04, 0.6, 8, { colour: COAT_DARK });
  }
  // Collar and a darker lapel line down the front.
  torus(b.paint, { at: [hang[0] + k * 0.1, top - 0.045, z], rot: [Math.PI / 2, 0, 0] }, 0.075, 0.028, 6, 14, { colour: COAT_DARK });

  // The cap, on the third hook: a squashed dome with a short peak.
  const capAt: Vec3 = [x0 + k * 0.11, railY - 0.085, hookZ[2] ?? z - 0.27];
  sphere(b.paint, { at: capAt, scale: [0.55, 0.5, 1] }, 0.1, 14, 8, { colour: TWEED }, Math.PI * 2, Math.PI * 0.62);
  bar(b.paint, { at: [capAt[0] + k * 0.035, capAt[1] - 0.02, capAt[2]] }, [0.07, 0.012, 0.15], { colour: mulRgb(TWEED, 0.8) });
}

/** A cream enamel mug on the top rail of a radiator: a body, the coffee in it, a handle. */
export function mug(b: Buckets): void {
  const { side, z } = CARE.mug;
  const x = wallX(side) + outward(side) * (RADIATOR.depth * 0.55);
  const y = RADIATOR.height + 0.001;
  lathe(
    b.enamel,
    { at: [x, y, z] },
    [
      [0.001, 0],
      [0.034, 0],
      [0.04, 0.006],
      [0.043, 0.09],
      [0.0395, 0.092],
      [0.036, 0.084],
      [0.001, 0.08],
    ],
    18,
    { colour: CREAM },
  );
  // The coffee: a dark disc just under the lip.
  cylinder(b.enamel, { at: [x, y + 0.079, z] }, 0.0345, 0.0345, 0.002, 18, { colour: COFFEE });
  // The handle, a C on the side toward the viewer.
  torus(b.enamel, { at: [x, y + 0.048, z + 0.043], rot: [0, 0, 0] }, 0.024, 0.0055, 6, 12, { colour: CREAM }, Math.PI);
}

/** A newspaper folded to quarters, lying on a radiator top, with a few lines of print on it. */
export function newspaper(b: Buckets): void {
  const { side, z } = CARE.newspaper;
  // Centred 7.5 cm off the wall and turned only a little, so its corners stay clear of the plaster.
  const x = wallX(side) + outward(side) * 0.075;
  const y = RADIATOR.height + 0.0075;
  const yaw = 0.1;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  bar(b.paint, { at: [x, y, z], rot: [0, yaw, 0] }, [0.1, 0.014, 0.3], { colour: PAPER });
  // Print: a masthead bar and two columns, drawn as thin flat boxes on the top face.
  const place = (dx: number, dz: number): Vec3 => [x + dx * c + dz * s, y + 0.0076, z - dx * s + dz * c];
  bar(b.paint, { at: place(0, -0.105), rot: [0, yaw, 0] }, [0.07, 0.0012, 0.03], { colour: INK });
  for (const dx of [-0.025, 0.025]) bar(b.paint, { at: place(dx, 0.045), rot: [0, yaw, 0] }, [0.032, 0.0012, 0.17], { colour: mulRgb(INK, 1.6) });
}

/** A rubber door wedge on the floor beside a door: a triangular prism, thick end at the door. */
export function wedge(b: Buckets): void {
  const { side, z } = CARE.wedge;
  const x = wallX(side) + outward(side) * 0.1;
  const k = outward(side);
  const w = 0.06;
  const len = 0.15;
  const h = 0.05;
  const style = { colour: WEDGE_RED };
  const p = (dx: number, y: number, dz: number): Vec3 => [x + k * dx, y, z + dz];
  // Base (down), slope (up and toward the wall side), back (the thick end) and two triangular sides.
  quad(b.rubber, p(0, 0.0005, -w), p(len, 0.0005, -w), p(len, 0.0005, w), p(0, 0.0005, w), style, [0, -1, 0]);
  quad(b.rubber, p(0, h, -w), p(0, h, w), p(len, 0.0005, w), p(len, 0.0005, -w), style, [k * 0.3, 1, 0]);
  quad(b.rubber, p(0, 0.0005, -w), p(0, 0.0005, w), p(0, h, w), p(0, h, -w), style, [-k, 0, 0]);
  quad(b.rubber, p(0, 0.0005, -w), p(len, 0.0005, -w), p(0, h, -w), p(0, h, -w), style, [0, 0, -1]);
  quad(b.rubber, p(len, 0.0005, w), p(0, 0.0005, w), p(0, h, w), p(0, h, w), style, [0, 0, 1]);
}

export function buildCare(b: Buckets): void {
  coatAndCap(b);
  mug(b);
  newspaper(b);
  wedge(b);
}
