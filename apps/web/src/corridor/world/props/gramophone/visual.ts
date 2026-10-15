import { CylinderGeometry, Matrix4, Quaternion, Vector3 } from 'three';
import { addGeometry, box, Bucket, type FaceName, type Style } from '../../builder.ts';
import { mulRgb, type Rgb } from '../../colour.ts';
import type { Vec3 } from '../../math.ts';
import { cylinder, lathe, sphere, torus } from '../../shapes.ts';
import { IVORY, linear, METAL, wood } from '../colours.ts';
import type { Channel } from '../parts.ts';
import { ARM, PARTS, PLATTER, REST_AT, type PartName } from './model.ts';
import { TABLE } from './placement.ts';
import type { Target } from './reading.ts';

/**
 * What the gramophone looks like: a table-top horn gramophone of about 1910 on a small oak table,
 * with a shelf of records under it. Procedural, clean and original: no library model of a
 * gramophone or record player exists in the CC0 collections (Poly Haven has none, and ambientCG's
 * models are not of this kind), so this is a stand-in whose moving parts are named and separate
 * (`platter`, `tonearm`) and whose behaviour is in `model.ts`, which is why a real model could take
 * its place without touching what it does. The Blender lane can replace it.
 *
 * Built into per-part, per-material buckets in the prop's own frame (see `placement.ts`); the parts
 * that move are then shifted so that each turns about its own origin. Pure data: no GL, so a test
 * can build it, measure it and check it clear of the route in node.
 *
 * The ivory fittings are where a hand would act, and the only ivory on it: a cap on the arm's
 * rest (the needle) and a tab on the stack of records (the change).
 */

/** The parts of the build: the cabinet and everything fixed, and the two that move. */
export type BuildPart = 'body' | PartName;
export const BUILD_PARTS: readonly BuildPart[] = ['body', 'platter', 'tonearm'];

const CHANNELS: readonly Channel[] = ['wood', 'brass', 'steel', 'enamel', 'matte', 'print', 'glass'];

/** A run of the enamel channel's vertices that is one ivory fitting. */
export interface FittingRange {
  target: Target;
  part: BuildPart;
  start: number;
  end: number;
}

export interface HitArea {
  /** Prop-local centre and size, metres. */
  centre: Vec3;
  size: Vec3;
}

export interface BuiltGramophone {
  readonly buckets: Record<BuildPart, Record<Channel, Bucket>>;
  readonly fittings: readonly FittingRange[];
  /** Where each target is acted on, and where its cue hangs (prop-local). */
  readonly hits: Record<Target, HitArea>;
  readonly fittingAt: Record<Target, Vec3>;
  readonly triangles: number;
  /** Bounds of everything, prop-local, after the moving parts are returned to where they are authored. */
  bounds(): { min: Vec3; max: Vec3 };
  /** The most the moving geometry can reach from the part's own origin: for culling. */
  readonly radius: number;
}

// Palette ---------------------------------------------------------------------------------------

const OAK = wood('#4A3322');
const OAK_DARK = wood('#352416');
const OAK_PALE = wood('#6A4B31');
const BLACK = linear('#101112');
const LABEL = linear('#6B2A22');
const GILT = linear('#C9A257');
const FELT = linear('#2F4A3A');
const PAPER = linear('#8F7753');
const BRASS = METAL.polished;

const brassStyle = (k = 1): Style => ({ colour: mulRgb(BRASS, k) });

class Sink {
  readonly buckets = Object.fromEntries(BUILD_PARTS.map((part) => [part, Object.fromEntries(CHANNELS.map((c) => [c, new Bucket()]))])) as Record<BuildPart, Record<Channel, Bucket>>;
  readonly fittings: FittingRange[] = [];
  private part: BuildPart = 'body';
  private fitting: Target | null = null;

  on(part: BuildPart, build: () => void): void {
    const before = this.part;
    this.part = part;
    build();
    this.part = before;
  }

  /** Everything `build` adds to enamel is the ivory fitting of `target`. */
  ivory(target: Target, build: () => void): void {
    this.fitting = target;
    build();
    this.fitting = null;
  }

  /** The bucket to write to, noting the vertices that follow if this is a fitting. */
  take(channel: Channel, write: (b: Bucket) => void): void {
    const b = this.buckets[this.part][channel];
    const start = b.vertexCount;
    write(b);
    if (this.fitting !== null) {
      if (channel !== 'enamel') throw new Error('an ivory fitting is written in the enamel channel');
      const last = this.fittings[this.fittings.length - 1];
      if (last && last.target === this.fitting && last.part === this.part && last.end === start) last.end = b.vertexCount;
      else this.fittings.push({ target: this.fitting, part: this.part, start, end: b.vertexCount });
    }
  }

  box(channel: Channel, centre: Vec3, size: Vec3, bevel: number, colour: Rgb, skip: readonly FaceName[] = []): void {
    this.take(channel, (b) => box(b, centre, size, bevel, { colour }, skip));
  }

  /** A box from corners: x, y, z each as [low, high]. */
  span(channel: Channel, x: readonly [number, number], y: readonly [number, number], z: readonly [number, number], bevel: number, colour: Rgb, skip: readonly FaceName[] = []): void {
    this.box(channel, [(x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2], [Math.abs(x[1] - x[0]), Math.abs(y[1] - y[0]), Math.abs(z[1] - z[0])], bevel, colour, skip);
  }

  cyl(channel: Channel, at: Vec3, rot: Vec3, rTop: number, rBottom: number, height: number, segments: number, style: Style): void {
    this.take(channel, (b) => cylinder(b, { at, rot }, rTop, rBottom, height, segments, style));
  }

  lathe(channel: Channel, at: Vec3, profile: readonly (readonly [number, number])[], segments: number, style: Style): void {
    this.take(channel, (b) => lathe(b, { at }, profile, segments, style));
  }

  sphere(channel: Channel, at: Vec3, radius: number, scale: Vec3, colour: Rgb): void {
    this.take(channel, (b) => sphere(b, { at, scale }, radius, 12, 8, { colour }));
  }

  torus(channel: Channel, at: Vec3, rot: Vec3, radius: number, tube: number, radial: number, tubular: number, colour: Rgb): void {
    this.take(channel, (b) => torus(b, { at, rot }, radius, tube, radial, tubular, { colour }));
  }

  /** A straight round rod between two points, optionally tapering. */
  rod(channel: Channel, from: Vec3, to: Vec3, radius: number, segments: number, colour: Rgb, radiusEnd = radius): void {
    this.take(channel, (b) => {
      const d = new Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
      const length = d.length();
      if (length < 1e-9) return;
      const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize());
      const m = new Matrix4().compose(new Vector3((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2), q, new Vector3(1, 1, 1));
      const g = new CylinderGeometry(radiusEnd, radius, length, segments, 1, false);
      addGeometry(b, g, m, { colour }, true);
      g.dispose();
    });
  }
}

// The horn --------------------------------------------------------------------------------------

/** The horn's spine, from the cabinet's top up and round to its mouth, which faces the room. */
const HORN_PATH: readonly Vec3[] = [
  [-0.02, 0.962, 0.14],
  [-0.02, 1.05, 0.142],
  [-0.021, 1.13, 0.162],
  [-0.03, 1.19, 0.226],
  [-0.042, 1.218, 0.33],
  [-0.05, 1.225, 0.43],
  [-0.052, 1.225, 0.5],
];
export const HORN = { mouthRadius: 0.175, throatRadius: 0.022, mouth: HORN_PATH[HORN_PATH.length - 1] as Vec3 } as const;

/** The direction, in the prop's frame, from the horn to the lamps that light it (the board's, and the sconce beyond it). */
const LAMP: Vec3 = [-0.84, 0.46, -0.28];

/** A point on the spine, by arc position 0..1 (Catmull-Rom through the control points). */
function spine(path: readonly Vec3[], u: number): { p: Vec3; t: Vec3 } {
  const n = path.length - 1;
  const x = Math.min(n - 1e-9, Math.max(0, u * n));
  const i = Math.floor(x);
  const f = x - i;
  const at = (k: number): Vec3 => path[Math.min(n, Math.max(0, k))] as Vec3;
  const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
  const cr = (a: number, b: number, c: number, d: number, t: number): number => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  const dcr = (a: number, b: number, c: number, d: number, t: number): number => 0.5 * ((-a + c) + 2 * (2 * a - 5 * b + 4 * c - d) * t + 3 * (-a + 3 * b - 3 * c + d) * t * t);
  const p: Vec3 = [cr(p0[0], p1[0], p2[0], p3[0], f), cr(p0[1], p1[1], p2[1], p3[1], f), cr(p0[2], p1[2], p2[2], p3[2], f)];
  const t = new Vector3(dcr(p0[0], p1[0], p2[0], p3[0], f), dcr(p0[1], p1[1], p2[1], p3[1], f), dcr(p0[2], p1[2], p2[2], p3[2], f)).normalize();
  return { p, t: [t.x, t.y, t.z] };
}

/** The horn's radius along its length: nearly a tube at the throat, flaring faster toward the bell. */
export function hornRadius(u: number): number {
  return HORN.throatRadius * Math.exp(Math.log(HORN.mouthRadius / HORN.throatRadius) * u ** 1.15);
}

/**
 * Sweep a ring along the spine: a thin brass shell, seen from outside and from within the bell. The
 * inside is darker, as the bell of a horn is.
 */
function sweepHorn(b: Bucket, outside: Style, inside: Style, stations: number, sides: number): void {
  const frames: { p: Vec3; n: Vec3; bn: Vec3; r: number; slope: number }[] = [];
  const ref = new Vector3(1, 0, 0);
  for (let i = 0; i <= stations; i += 1) {
    const u = i / stations;
    const { p, t } = spine(HORN_PATH, u);
    const tv = new Vector3(...t);
    // The ring's frame: the reference axis made perpendicular to the spine. The horn never runs along
    // it, so the frame follows the spine without flipping.
    const n = ref.clone().addScaledVector(tv, -ref.dot(tv)).normalize();
    const bn = new Vector3().crossVectors(tv, n).normalize();
    frames.push({ p, n: [n.x, n.y, n.z], bn: [bn.x, bn.y, bn.z], r: hornRadius(u), slope: 0 });
  }
  for (let i = 0; i < frames.length; i += 1) {
    const a = frames[Math.max(0, i - 1)] as (typeof frames)[number];
    const c = frames[Math.min(frames.length - 1, i + 1)] as (typeof frames)[number];
    const ds = Math.hypot(c.p[0] - a.p[0], c.p[1] - a.p[1], c.p[2] - a.p[2]) || 1;
    (frames[i] as (typeof frames)[number]).slope = (c.r - a.r) / ds;
  }
  const ring = (f: (typeof frames)[number], k: number, shrink: number): { p: Vec3; n: Vec3 } => {
    const th = (k / sides) * Math.PI * 2;
    const dir: Vec3 = [Math.cos(th) * f.n[0] + Math.sin(th) * f.bn[0], Math.cos(th) * f.n[1] + Math.sin(th) * f.bn[1], Math.cos(th) * f.n[2] + Math.sin(th) * f.bn[2]];
    const r = Math.max(0.004, f.r - shrink);
    return { p: [f.p[0] + dir[0] * r, f.p[1] + dir[1] * r, f.p[2] + dir[2] * r], n: dir };
  };
  const emit = (style: Style, shrink: number, flip: boolean): void => {
    const base = b.vertexCount;
    const tint = (style.colour ?? [1, 1, 1]) as Rgb;
    frames.forEach((f, i) => {
      // Lit from above: the underside of the horn is darker, its top catches the light, and the
      // bell brightens toward its lip, where the metal is thinnest and most polished.
      const lip = (i / stations) ** 3;
      for (let k = 0; k <= sides; k += 1) {
        const { p, n } = ring(f, k, shrink);
        const nn: Vec3 = flip ? [-n[0], -n[1], -n[2]] : n;
        const up = 0.5 + 0.5 * n[1];
        // A baked glint from the lobby's lamps, which are static: the sconce by the board lights the
        // horn from the left (local -x) and above, so its near rim and shoulder catch it.
        const glint = Math.max(0, n[0] * LAMP[0] + n[1] * LAMP[1] + n[2] * LAMP[2]) ** 7;
        const shade = flip ? 1 : 0.6 + 0.46 * up * up + 0.22 * lip + 0.55 * glint;
        b.vertex(p, nn, [k / sides, 0], [tint[0] * shade, tint[1] * shade, tint[2] * shade]);
      }
    });
    const row = sides + 1;
    for (let i = 0; i < stations; i += 1) {
      for (let k = 0; k < sides; k += 1) {
        const a = base + i * row + k;
        const c = a + row;
        if (flip) b.idx.push(a, c, a + 1, a + 1, c, c + 1);
        else b.idx.push(a, a + 1, c, a + 1, c + 1, c);
      }
    }
  };
  emit(outside, 0, false);
  // The inside of the bell: only where the bell opens, so the throat's tube is not doubled.
  emit(inside, 0.004, true);
}

// The build -------------------------------------------------------------------------------------

export function buildGramophone(): BuiltGramophone {
  const s = new Sink();
  const half = TABLE.width / 2;
  const z0 = TABLE.standoff;
  const z1 = TABLE.standoff + TABLE.depth;
  const top = TABLE.top;

  s.on('body', () => {
    // The table: a top with an eased edge, four legs, an apron, and a shelf low down for the records.
    s.span('wood', [-half, half], [top - 0.03, top], [z0, z1], 0.006, OAK_PALE);
    s.span('wood', [-half + 0.02, half - 0.02], [top - 0.1, top - 0.03], [z0 + 0.02, z1 - 0.02], 0.002, OAK_DARK);
    for (const sx of [-1, 1]) {
      for (const [zl, zh] of [[z0 + 0.02, z0 + 0.062], [z1 - 0.062, z1 - 0.02]] as const) {
        const cx = sx * (half - 0.04);
        s.span('wood', [cx - 0.021, cx + 0.021], [0, top - 0.03], [zl, zh], 0.003, OAK);
        // A turned foot, a little darker where shoes have been.
        s.span('wood', [cx - 0.024, cx + 0.024], [0, 0.03], [zl - 0.003, zh + 0.003], 0.003, OAK_DARK);
      }
    }
    s.span('wood', [-half + 0.04, half - 0.04], [0.215, 0.235], [z0 + 0.025, z1 - 0.025], 0.003, OAK);

    // The cabinet: oak, with a darker top plate, a speed lever and a crank on its right.
    const bx = [-0.21, 0.21] as const;
    const bz = [0.07, 0.47] as const;
    s.span('wood', bx, [top, 0.94], bz, 0.005, OAK);
    s.span('wood', [bx[0] + 0.012, bx[1] - 0.012], [0.939, 0.945], [bz[0] + 0.012, bz[1] - 0.012], 0.002, OAK_DARK);
    // A brass escutcheon on the front, and a small grille of three slots.
    s.span('brass', [-0.045, 0.045], [0.805, 0.835], [bz[1], bz[1] + 0.003], 0.001, BRASS);
    for (const dx of [-0.06, 0, 0.06]) s.span('matte', [dx - 0.018, dx + 0.018], [0.86, 0.866], [bz[1], bz[1] + 0.002], 0, BLACK);
    // The crank: a brass arm out of the right side, with an ebony grip.
    s.cyl('brass', [bx[1] + 0.012, 0.84, 0.27], [0, 0, Math.PI / 2], 0.011, 0.011, 0.024, 12, brassStyle());
    s.rod('brass', [bx[1] + 0.024, 0.84, 0.27], [bx[1] + 0.032, 0.84, 0.35], 0.0045, 8, BRASS);
    s.cyl('matte', [bx[1] + 0.032, 0.84, 0.375], [Math.PI / 2, 0, 0], 0.009, 0.009, 0.05, 10, { colour: BLACK });

    // The platter's felt and the spindle the record sits on stay with the cabinet.
    s.cyl('matte', [PLATTER.centre[0], 0.945, PLATTER.centre[2]], [0, 0, 0], PLATTER.felt + 0.004, PLATTER.felt + 0.004, 0.003, 36, { colour: mulRgb(BRASS, 0.5) });
    s.cyl('brass', [PLATTER.centre[0], PLATTER.centre[1] + 0.012, PLATTER.centre[2]], [0, 0, 0], 0.0025, 0.0025, 0.024, 8, brassStyle(1.1));

    // The arm's pivot post and the rest it lies on, with its ivory cap.
    s.cyl('brass', [ARM.pivot[0], 0.966, ARM.pivot[2]], [0, 0, 0], 0.017, 0.02, 0.05, 14, brassStyle());
    s.cyl('brass', [ARM.pivot[0], 0.939, ARM.pivot[2]], [0, 0, 0], 0.026, 0.026, 0.004, 14, brassStyle(0.8));
    s.cyl('brass', [REST_AT[0], 0.963, REST_AT[2]], [0, 0, 0], 0.0055, 0.0075, 0.046, 10, brassStyle());
    s.ivory('needle', () => {
      s.cyl('enamel', [REST_AT[0], REST_AT[1] - 0.003, REST_AT[2]], [0, 0, 0], 0.0105, 0.0085, 0.014, 12, { colour: IVORY });
      s.sphere('enamel', [REST_AT[0], REST_AT[1] + 0.004, REST_AT[2]], 0.0105, [1, 0.5, 1], IVORY);
    });

    // The horn: brass, sweeping up from behind the platter and out toward the room, a rolled lip at the bell.
    s.take('brass', (b) => sweepHorn(b, { colour: BRASS }, { colour: mulRgb(BRASS, 0.42) }, 40, 28));
    s.torus('brass', [HORN.mouth[0], HORN.mouth[1], HORN.mouth[2]], [0, 0, 0], HORN.mouthRadius, 0.0065, 8, 40, mulRgb(BRASS, 1.12));
    // The collar where the horn meets the cabinet.
    s.cyl('brass', [-0.02, 0.952, 0.14], [0, 0, 0], 0.034, 0.04, 0.024, 16, brassStyle(0.95));
    s.cyl('brass', [-0.02, 0.968, 0.14], [0, 0, 0], 0.027, 0.032, 0.012, 16, brassStyle(1.05));

    // The records on the shelf: a stack of paper sleeves, one pulled a little forward, and its ivory tab.
    const stackTop = 0.235 + 6 * 0.006;
    for (let i = 0; i < 6; i += 1) {
      const y = 0.235 + i * 0.006;
      const shift = i === 5 ? 0.018 : (i % 2 === 0 ? -0.003 : 0.004);
      s.span('matte', [-0.135 + shift, 0.135 + shift], [y, y + 0.0058], [0.135, 0.405], 0, mulRgb(PAPER, 0.82 + 0.05 * (i % 3)));
    }
    s.ivory('records', () => {
      s.span('enamel', [-0.03, 0.03], [stackTop - 0.007, stackTop - 0.0015], [0.404, 0.409], 0.001, IVORY);
    });
  });

  s.on('platter', () => {
    const [cx, cy, cz] = PLATTER.centre;
    // The turntable and the record on it: a disc of black shellac, banded where a record is (the
    // lead-in, the music, the run-out), a gilt ring and a maroon label with a small brass pin.
    s.cyl('matte', [cx, cy - 0.003, cz], [0, 0, 0], PLATTER.felt, PLATTER.felt, 0.008, 36, { colour: FELT });
    const rings: readonly (readonly [number, number, number])[] = [
      [0.127, 0.118, 1.0],
      [0.118, 0.1, 0.78],
      [0.1, 0.085, 1.0],
      [0.085, 0.068, 0.8],
      [0.068, 0.054, 1.0],
      [0.054, 0.047, 0.7],
    ];
    const surface = cy + 0.004;
    for (const [outer, inner, shade] of rings) {
      s.lathe('enamel', [cx, surface, cz], [[outer, 0], [inner, 0]], 48, { colour: mulRgb(BLACK, shade) });
    }
    // The edge of the disc.
    s.cyl('enamel', [cx, cy + 0.0025, cz], [0, 0, 0], PLATTER.radius, PLATTER.radius, 0.0032, 48, { colour: mulRgb(BLACK, 0.9) });
    s.cyl('matte', [cx, surface + 0.001, cz], [0, 0, 0], 0.045, 0.045, 0.0016, 32, { colour: LABEL });
    s.lathe('brass', [cx, surface + 0.0019, cz], [[0.044, 0], [0.041, 0]], 32, { colour: GILT });
    // A small pin and an arc of gilt on the label, off-centre, so that the turning can be seen.
    s.cyl('brass', [cx + 0.026, surface + 0.0024, cz], [0, 0, 0], 0.0035, 0.0035, 0.0012, 8, { colour: GILT });
    s.cyl('brass', [cx, surface + 0.0026, cz], [0, 0, 0], 0.0032, 0.0032, 0.0024, 8, brassStyle(1.2));
  });

  s.on('tonearm', () => {
    const [px, py, pz] = ARM.pivot;
    // A brass collar on the post, the arm's tube swelling and bending down to the head, the head
    // (a brass sound box) and the needle in it.
    s.cyl('brass', [px, py - 0.004, pz], [0, 0, 0], 0.0145, 0.0145, 0.02, 14, brassStyle(1.08));
    const tube: readonly Vec3[] = [
      [px, py + 0.002, pz],
      [px + 0.001, py + 0.008, pz + 0.05],
      [px + 0.003, py + 0.01, pz + 0.12],
      [px + 0.005, py + 0.007, pz + 0.2],
      [px + 0.005, py + 0.002, pz + 0.255],
    ];
    for (let i = 0; i + 1 < tube.length; i += 1) s.rod('brass', tube[i] as Vec3, tube[i + 1] as Vec3, 0.0085 - i * 0.0006, 10, mulRgb(BRASS, 1.18));
    const head: Vec3 = [px + 0.005, py + 0.002, pz + 0.27];
    s.cyl('brass', head, [0, 0, Math.PI / 2], 0.024, 0.024, 0.036, 18, brassStyle(1.05));
    s.cyl('brass', head, [0, 0, Math.PI / 2], 0.0175, 0.0175, 0.044, 14, brassStyle(0.8));
    // The needle: a fine steel point, 12 mm below the sound box.
    s.cyl('steel', [head[0], head[1] - 0.021, head[2]], [0, 0, 0], 0.0024, 0.0012, 0.012, 6, { colour: METAL.steel });
    // A small brass knuckle where the tube meets the head, and a counterweight behind the pivot.
    s.sphere('brass', [px + 0.005, py + 0.002, pz + 0.252], 0.0085, [1, 1, 1], BRASS);
    s.cyl('steel', [px, py + 0.001, pz - 0.034], [Math.PI / 2, 0, 0], 0.0105, 0.0105, 0.03, 10, { colour: METAL.iron });
  });

  // Where each target is acted on. The needle's is the whole machine, horn and all, so a click on
  // either reads as a click on the gramophone; the records' is the shelf. No smaller than a finger
  // or a thumb needs at the distance a prop is first seen from (see `hit.ts` for the twelve).
  const hits: Record<Target, HitArea> = {
    needle: { centre: [0.03, 1.1, 0.27], size: [0.58, 0.62, 0.5] },
    records: { centre: [0, 0.27, 0.27], size: [0.8, 0.42, 0.5] },
  };
  const fittingAt: Record<Target, Vec3> = {
    needle: REST_AT,
    records: [0, 0.272, 0.407],
  };

  let triangles = 0;
  for (const part of BUILD_PARTS) for (const c of CHANNELS) triangles += s.buckets[part][c].triangleCount;

  // The moving parts turn about their own origins.
  for (const part of PARTS) {
    for (const c of CHANNELS) {
      const bucket = s.buckets[part.name][c];
      for (let i = 0; i < bucket.pos.length; i += 3) {
        bucket.pos[i] = (bucket.pos[i] ?? 0) - part.pivot[0];
        bucket.pos[i + 1] = (bucket.pos[i + 1] ?? 0) - part.pivot[1];
        bucket.pos[i + 2] = (bucket.pos[i + 2] ?? 0) - part.pivot[2];
      }
    }
  }

  const radius = Math.max(PLATTER.felt + 0.02, ARM.length + 0.06);
  return {
    buckets: s.buckets,
    fittings: s.fittings,
    hits,
    fittingAt,
    triangles,
    radius,
    bounds() {
      const min: [number, number, number] = [Infinity, Infinity, Infinity];
      const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
      for (const part of BUILD_PARTS) {
        const pivot = PARTS.find((p) => p.name === part)?.pivot ?? [0, 0, 0];
        for (const c of CHANNELS) {
          const bucket = s.buckets[part][c];
          for (let i = 0; i < bucket.pos.length; i += 3) {
            for (let k = 0; k < 3; k += 1) {
              const v = (bucket.pos[i + k] ?? 0) + (pivot[k] ?? 0);
              if (v < (min[k] ?? 0)) min[k] = v;
              if (v > (max[k] ?? 0)) max[k] = v;
            }
          }
        }
      }
      return { min, max };
    },
  };
}
