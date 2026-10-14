import { BufferAttribute, BufferGeometry, Matrix3, Matrix4, Vector3 } from 'three';
import { mulRgb, type Rgb } from './colour.ts';
import { nth, add, cross, dot, normalize, scale, sub, type Vec2, type Vec3 } from './math.ts';

/**
 * Procedural geometry accumulated into flat arrays, merged by material. The corridor is built
 * this way (rather than from many small meshes) so the whole architecture costs one draw call
 * per material, and so surfaces can carry baked contact shading in vertex colour.
 *
 * Conventions: metres; faces are counter-clockwise from the front; UVs are planar in world (or
 * door-local) metres, so a material's texture `repeat` is 1 / tile size and a texture tiles
 * seamlessly across separately built pieces.
 */

export interface UvRule {
  /** Offset in metres; per-bay offsets make one texture read as many different bays. */
  du?: number;
  dv?: number;
  /** Run the texture's u axis along the part's other tangent (e.g. grain on a vertical stile). */
  swap?: boolean;
}

export interface Style {
  /** Linear-light multiplier written to the vertex colour (white when omitted). */
  colour?: Rgb;
  /** Baked contact shading: a multiplier evaluated at each vertex. */
  shade?: (position: Vec3, normal: Vec3) => number;
  uv?: UvRule;
}

const WHITE: Rgb = [1, 1, 1];

export class Bucket {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly uv: number[] = [];
  readonly col: number[] = [];
  readonly idx: number[] = [];

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  get triangleCount(): number {
    return this.idx.length / 3;
  }

  vertex(p: Vec3, n: Vec3, uv: Vec2, colour: Rgb): number {
    const i = this.vertexCount;
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.uv.push(uv[0], uv[1]);
    this.col.push(colour[0], colour[1], colour[2]);
    return i;
  }

  /** Axis-aligned bounds of everything accumulated so far. */
  bounds(): { min: Vec3; max: Vec3 } {
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < this.pos.length; i += 3) {
      for (let k = 0; k < 3; k += 1) {
        const v = this.pos[i + k] ?? 0;
        if (v < nth(min, k)) min[k] = v;
        if (v > nth(max, k)) max[k] = v;
      }
    }
    return { min, max };
  }

  /** Append another bucket, transformed. Used to place door-local geometry in the world. */
  append(other: Bucket, matrix: Matrix4): void {
    const normalMatrix = new Matrix3().getNormalMatrix(matrix);
    const base = this.vertexCount;
    const p = new Vector3();
    const n = new Vector3();
    for (let i = 0; i < other.pos.length; i += 3) {
      p.set(other.pos[i] ?? 0, other.pos[i + 1] ?? 0, other.pos[i + 2] ?? 0).applyMatrix4(matrix);
      n.set(other.nor[i] ?? 0, other.nor[i + 1] ?? 0, other.nor[i + 2] ?? 0).applyMatrix3(normalMatrix).normalize();
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(n.x, n.y, n.z);
    }
    for (const v of other.uv) this.uv.push(v);
    for (const v of other.col) this.col.push(v);
    for (const i of other.idx) this.idx.push(base + i);
  }

  /**
   * A reflection of everything in the bucket across the plane z = zMid, with its winding
   * reversed so the faces point outward on the far side. A leaf that will be seen from both
   * sides (an open door) is the original plus this.
   */
  mirrored(zMid: number): Bucket {
    const out = new Bucket();
    for (let i = 0; i < this.pos.length; i += 3) {
      out.pos.push(this.pos[i] ?? 0, this.pos[i + 1] ?? 0, 2 * zMid - (this.pos[i + 2] ?? 0));
      out.nor.push(this.nor[i] ?? 0, this.nor[i + 1] ?? 0, -(this.nor[i + 2] ?? 0));
    }
    for (const v of this.uv) out.uv.push(v);
    for (const v of this.col) out.col.push(v);
    for (let i = 0; i < this.idx.length; i += 3) out.idx.push(this.idx[i] ?? 0, this.idx[i + 2] ?? 0, this.idx[i + 1] ?? 0);
    return out;
  }

  /**
   * Reorder triangles so those nearest the visitor's start (largest z) come first. A merged mesh
   * is one draw call, so depth rejection can only help if near surfaces are drawn before the far
   * ones they hide; built far-to-near, a 75 m corridor shades every wall hundreds of times over.
   */
  sortNearToFar(): void {
    const triangles = this.idx.length / 3;
    const order = new Array<number>(triangles);
    const key = new Float64Array(triangles);
    for (let t = 0; t < triangles; t += 1) {
      order[t] = t;
      const a = (this.idx[t * 3] ?? 0) * 3 + 2;
      const b = (this.idx[t * 3 + 1] ?? 0) * 3 + 2;
      const c = (this.idx[t * 3 + 2] ?? 0) * 3 + 2;
      key[t] = ((this.pos[a] ?? 0) + (this.pos[b] ?? 0) + (this.pos[c] ?? 0)) / 3;
    }
    order.sort((x, y) => (key[y] ?? 0) - (key[x] ?? 0));
    const sorted: number[] = new Array<number>(this.idx.length);
    order.forEach((t, k) => {
      sorted[k * 3] = this.idx[t * 3] ?? 0;
      sorted[k * 3 + 1] = this.idx[t * 3 + 1] ?? 0;
      sorted[k * 3 + 2] = this.idx[t * 3 + 2] ?? 0;
    });
    for (let i = 0; i < sorted.length; i += 1) this.idx[i] = sorted[i] ?? 0;
  }

  toGeometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setIndex(new BufferAttribute(this.vertexCount > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Planar UV by the dominant normal axis, in metres. */
function planarUv(p: Vec3, n: Vec3, rule: UvRule | undefined): Vec2 {
  const ax = Math.abs(n[0]);
  const ay = Math.abs(n[1]);
  const az = Math.abs(n[2]);
  let u: number;
  let v: number;
  if (ax >= ay && ax >= az) {
    u = p[2];
    v = p[1];
  } else if (ay >= az) {
    u = p[0];
    v = p[2];
  } else {
    u = p[0];
    v = p[1];
  }
  if (rule?.swap) [u, v] = [v, u];
  return [u + (rule?.du ?? 0), v + (rule?.dv ?? 0)];
}

function colourAt(style: Style | undefined, p: Vec3, n: Vec3): Rgb {
  const base = style?.colour ?? WHITE;
  const k = style?.shade ? style.shade(p, n) : 1;
  return k === 1 ? base : mulRgb(base, k);
}

/**
 * One triangle. If `facing` is given the winding is flipped as needed so the geometric normal
 * agrees with it, which keeps hand-written corner lists from producing back faces.
 */
export function tri(b: Bucket, p0: Vec3, p1: Vec3, p2: Vec3, style?: Style, facing?: Vec3, uvs?: readonly [Vec2, Vec2, Vec2]): void {
  let a = p0;
  let c = p2;
  let ua = uvs?.[0];
  let uc = uvs?.[2];
  let n = normalize(cross(sub(p1, p0), sub(p2, p0)));
  if (facing && dot(n, facing) < 0) {
    a = p2;
    c = p0;
    ua = uvs?.[2];
    uc = uvs?.[0];
    n = [-n[0], -n[1], -n[2]];
  }
  const ub = uvs?.[1];
  const i0 = b.vertex(a, n, ua ?? planarUv(a, n, style?.uv), colourAt(style, a, n));
  const i1 = b.vertex(p1, n, ub ?? planarUv(p1, n, style?.uv), colourAt(style, p1, n));
  const i2 = b.vertex(c, n, uc ?? planarUv(c, n, style?.uv), colourAt(style, c, n));
  b.idx.push(i0, i1, i2);
}

/** A quad p0 p1 p2 p3 (a parallelogram or close to it), counter-clockwise from the front. */
export function quad(
  b: Bucket,
  p0: Vec3,
  p1: Vec3,
  p2: Vec3,
  p3: Vec3,
  style?: Style,
  facing?: Vec3,
  uvs?: readonly [Vec2, Vec2, Vec2, Vec2],
): void {
  let pts: [Vec3, Vec3, Vec3, Vec3] = [p0, p1, p2, p3];
  let uv = uvs ? ([...uvs] as [Vec2, Vec2, Vec2, Vec2]) : undefined;
  let n = normalize(cross(sub(p2, p0), sub(p3, p1)));
  if (facing && dot(n, facing) < 0) {
    pts = [p3, p2, p1, p0];
    uv = uv ? [uv[3], uv[2], uv[1], uv[0]] : undefined;
    n = [-n[0], -n[1], -n[2]];
  }
  const ids = pts.map((p, i) => b.vertex(p, n, uv?.[i] ?? planarUv(p, n, style?.uv), colourAt(style, p, n)));
  b.idx.push(nth(ids, 0), nth(ids, 1), nth(ids, 2), nth(ids, 0), nth(ids, 2), nth(ids, 3));
}

/**
 * A grid of quads over origin + u * axisU + v * axisV, with the given breakpoints (metres along
 * each unit axis). Breakpoints give baked shading somewhere to vary; the normal is axisU x axisV.
 */
export function grid(b: Bucket, origin: Vec3, axisU: Vec3, axisV: Vec3, us: readonly number[], vs: readonly number[], style?: Style): void {
  const at = (u: number, v: number): Vec3 => add(origin, add(scale(axisU, u), scale(axisV, v)));
  const facing = cross(axisU, axisV);
  for (let i = 0; i + 1 < us.length; i += 1) {
    for (let j = 0; j + 1 < vs.length; j += 1) {
      const u0 = nth(us, i);
      const u1 = nth(us, i + 1);
      const v0 = nth(vs, j);
      const v1 = nth(vs, j + 1);
      if (u1 - u0 < 1e-6 || v1 - v0 < 1e-6) continue;
      quad(b, at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1), style, facing);
    }
  }
}

/** Breakpoints from `a` to `b` with at most `step` between them, plus any extras inside. */
export function breaks(a: number, bEnd: number, step: number, extra: readonly number[] = []): number[] {
  const out = new Set<number>([a, bEnd]);
  const n = Math.max(1, Math.ceil(Math.abs(bEnd - a) / step));
  for (let i = 1; i < n; i += 1) out.add(a + ((bEnd - a) * i) / n);
  for (const e of extra) if (e > Math.min(a, bEnd) && e < Math.max(a, bEnd)) out.add(e);
  return [...out].sort((x, y) => x - y);
}

export type FaceName = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

/**
 * A box with flat 45 degree chamfers on every edge ("bevel", metres). Light catches a chamfer
 * as a thin bright line, which is what makes a 2-5 mm edge read as real thickness. Faces named
 * in `skip` are left out (against a wall, say); their neighbours then run out to the full
 * extent so no gap opens at the joint.
 */
export function box(
  b: Bucket,
  centre: Vec3,
  size: Vec3,
  bevel: number,
  style?: Style,
  skip: readonly FaceName[] = [],
): void {
  const h: Vec3 = [size[0] / 2, size[1] / 2, size[2] / 2];
  const bv = Math.min(bevel, h[0], h[1], h[2]);
  const skipped = (axis: number, sign: number): boolean => skip.includes(`${sign > 0 ? '+' : '-'}${'xyz'[axis]}` as FaceName);
  const inset = (axis: number, sign: number): number => (skipped(axis, sign) ? 0 : bv);
  const point = (v: [number, number, number]): Vec3 => [centre[0] + v[0], centre[1] + v[1], centre[2] + v[2]];

  for (let a = 0; a < 3; a += 1) {
    for (const s of [1, -1]) {
      if (skipped(a, s)) continue;
      const t1 = (a + 1) % 3;
      const t2 = (a + 2) % 3;
      const lo1 = -(nth(h, t1) - inset(t1, -1));
      const hi1 = nth(h, t1) - inset(t1, 1);
      const lo2 = -(nth(h, t2) - inset(t2, -1));
      const hi2 = nth(h, t2) - inset(t2, 1);
      const corner = (c1: number, c2: number): Vec3 => {
        const v: [number, number, number] = [0, 0, 0];
        v[a] = s * nth(h, a);
        v[t1] = c1;
        v[t2] = c2;
        return point(v);
      };
      const facing: [number, number, number] = [0, 0, 0];
      facing[a] = s;
      quad(b, corner(lo1, lo2), corner(hi1, lo2), corner(hi1, hi2), corner(lo1, hi2), style, facing);
    }
  }
  if (bv <= 0) return;

  // Edge chamfers: between faces (a, sa) and (c, sc); the edge runs along the third axis e.
  for (let a = 0; a < 3; a += 1) {
    for (let c = a + 1; c < 3; c += 1) {
      const e = 3 - a - c;
      for (const sa of [1, -1]) {
        for (const sc of [1, -1]) {
          if (skipped(a, sa) || skipped(c, sc)) continue;
          const eLo = -(nth(h, e) - inset(e, -1));
          const eHi = nth(h, e) - inset(e, 1);
          const pt = (onFaceA: boolean, along: number): Vec3 => {
            const v: [number, number, number] = [0, 0, 0];
            v[a] = onFaceA ? sa * nth(h, a) : sa * (nth(h, a) - bv);
            v[c] = onFaceA ? sc * (nth(h, c) - bv) : sc * nth(h, c);
            v[e] = along;
            return point(v);
          };
          const facing: [number, number, number] = [0, 0, 0];
          facing[a] = sa;
          facing[c] = sc;
          quad(b, pt(true, eLo), pt(false, eLo), pt(false, eHi), pt(true, eHi), style, facing);
        }
      }
    }
  }
  // Corner triangles.
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      for (const sz of [1, -1]) {
        if (skipped(0, sx) || skipped(1, sy) || skipped(2, sz)) continue;
        const px = point([sx * h[0], sy * (h[1] - bv), sz * (h[2] - bv)]);
        const py = point([sx * (h[0] - bv), sy * h[1], sz * (h[2] - bv)]);
        const pz = point([sx * (h[0] - bv), sy * (h[1] - bv), sz * h[2]]);
        tri(b, px, py, pz, style, [sx, sy, sz]);
      }
    }
  }
}

/**
 * Sweep a 2D polyline along `sweep` (a straight extrusion): one quad per polyline segment.
 * `toward` is a point in the free space the visible faces look into; quads are flipped to face
 * it, so a profile can be listed in either direction.
 */
export function strip(b: Bucket, polyline: readonly Vec3[], sweep: Vec3, style?: Style, toward?: Vec3): void {
  for (let i = 0; i + 1 < polyline.length; i += 1) {
    const p0 = nth(polyline, i);
    const p1 = nth(polyline, i + 1);
    if (length3(sub(p1, p0)) < 1e-7) continue;
    const q0 = add(p0, sweep);
    const q1 = add(p1, sweep);
    const centre = scale(add(add(p0, p1), add(q0, q1)), 0.25);
    const facing = toward ? sub(toward, centre) : undefined;
    quad(b, p0, p1, q1, q0, style, facing);
  }
}

const length3 = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

/**
 * Append a three.js geometry (a cylinder, torus, lathe...) transformed by `matrix`. Normals are
 * kept, UVs are kept as authored (they are the primitive's own 0..1) unless `style.uv` asks for
 * planar mapping, which `planar: true` selects.
 */
export function addGeometry(b: Bucket, g: BufferGeometry, matrix: Matrix4, style?: Style, planar = false): void {
  const position = g.getAttribute('position');
  const normal = g.getAttribute('normal');
  const uv = g.getAttribute('uv');
  const normalMatrix = new Matrix3().getNormalMatrix(matrix);
  const base = b.vertexCount;
  const p = new Vector3();
  const n = new Vector3();
  for (let i = 0; i < position.count; i += 1) {
    p.fromBufferAttribute(position, i).applyMatrix4(matrix);
    n.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
    const pv: Vec3 = [p.x, p.y, p.z];
    const nv: Vec3 = [n.x, n.y, n.z];
    const uvv: Vec2 = !planar && uv ? [uv.getX(i), uv.getY(i)] : planarUv(pv, nv, style?.uv);
    b.vertex(pv, nv, uvv, colourAt(style, pv, nv));
  }
  const index = g.getIndex();
  if (index) for (let i = 0; i < index.count; i += 1) b.idx.push(base + index.getX(i));
  else for (let i = 0; i < position.count; i += 1) b.idx.push(base + i);
}
