import { CylinderGeometry, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { addGeometry, box, Bucket, quad, type FaceName, type Style, type UvRule } from '../builder.ts';
import type { Rgb } from '../colour.ts';
import type { Vec2, Vec3 } from '../math.ts';
import { cylinder, lathe, sphere, torus, type Placement } from '../shapes.ts';
import type { PropId } from '../../props.ts';
import type { PropPlacement } from './placement.ts';

/**
 * How the props are put together. Every part of every prop is written into one of a few material
 * channels, each of which becomes a single skinned mesh (one draw call) for the whole set; the
 * parts that move are rigid skinning to a bone, so a drawer, a wheel or a lid animates without
 * costing a draw call of its own. This module is plain data: no GL, so a test can build, pose and
 * measure the props in node.
 */

/**
 * The materials the props share. `wood` is the corridor's own oak grain, tinted by vertex colour
 * to walnut, pine or ebony; `brass` and `steel` are metal; `enamel` is the glossy satin of
 * enamel, ceramic and bone (every ivory fitting lives here); `matte` is cloth, leather, rubber,
 * clay and leaf; `print` is the paper and lettering atlas; `glass` is clear and blended; `model`
 * is the ready-made models' repacked textures (see modelKit.ts), so every model costs one draw call
 * between them.
 */
export type Channel = 'wood' | 'brass' | 'steel' | 'enamel' | 'matte' | 'print' | 'glass' | 'model';
export const CHANNELS: readonly Channel[] = ['wood', 'brass', 'steel', 'enamel', 'matte', 'print', 'glass', 'model'];

/** A colour for a shape: one linear tint, or a function of the (prop-local) vertex. */
export type Tint = Rgb | ((position: Vec3, normal: Vec3) => Rgb);

/** A moving part of a prop: its name, and the prop-local point it turns and scales about. */
export interface PartSpec {
  name: string;
  pivot: Vec3;
}

export interface BoneDef {
  index: number;
  prop: PropId | null;
  part: string;
  /** World position of the pivot: poses rotate and scale about this point. */
  pivot: Vec3;
  /** The owning prop's yaw: poses are written in prop-local axes. */
  yaw: number;
}

/** The vertices of one prop's ivory fitting, in the enamel channel. */
export interface FittingRange {
  prop: PropId;
  start: number;
  end: number;
}

export interface Box3Like {
  min: [number, number, number];
  max: [number, number, number];
}

export interface ChannelData {
  bucket: Bucket;
  /** The bone each vertex follows. */
  bone: number[];
  /** The prop each vertex belongs to, static or moving. */
  owner: PropId[];
}

export class Assembly {
  readonly channels: Record<Channel, ChannelData>;
  readonly bones: BoneDef[] = [{ index: 0, prop: null, part: 'root', pivot: [0, 0, 0], yaw: 0 }];
  readonly fittings: FittingRange[] = [];
  readonly bounds = new Map<PropId, Box3Like>();
  /** Triangles each prop is made of. */
  readonly trianglesBy = new Map<PropId, number>();
  /** Where a prop may be clicked, when that is not simply its bounds (world space). */
  readonly hits = new Map<PropId, Box3Like>();
  private placement: PropPlacement | null = null;
  private parts: readonly PartSpec[] = [];
  private current = 0;
  private fitting = false;

  constructor() {
    const fresh = (): ChannelData => ({ bucket: new Bucket(), bone: [], owner: [] });
    this.channels = { wood: fresh(), brass: fresh(), steel: fresh(), enamel: fresh(), matte: fresh(), print: fresh(), glass: fresh(), model: fresh() };
  }

  /**
   * Start a prop: everything added until the next `begin` is in its local frame. `parts` are the
   * prop's moving parts, as its behaviour names them; a visual attaches geometry to them with `part`.
   */
  begin(placement: PropPlacement, parts: readonly PartSpec[] = []): void {
    this.placement = placement;
    this.parts = parts;
    this.current = 0;
  }

  /** The bone of one of the prop's named moving parts, created on first use. */
  part(name: string): number {
    const p = this.requirePlacement();
    const existing = this.bones.find((b) => b.prop === p.id && b.part === name);
    if (existing) return existing.index;
    const spec = this.parts.find((s) => s.name === name);
    if (!spec) throw new Error(`${p.id} has no part called ${name}`);
    return this.bone(name, spec.pivot);
  }

  /** Make a bone for every part with no geometry on it: for a visual that brings its own meshes. */
  declareParts(): void {
    for (const spec of this.parts) this.part(spec.name);
  }

  /** The bone of a moving part, pivoting at a prop-local point. It does not become current. */
  bone(part: string, pivot: Vec3): number {
    const p = this.requirePlacement();
    const v = new Vector3(pivot[0], pivot[1], pivot[2]).applyMatrix4(p.matrix);
    const index = this.bones.length;
    this.bones.push({ index, prop: p.id, part, pivot: [v.x, v.y, v.z], yaw: p.yaw });
    return index;
  }

  /** Everything `build` adds follows `bone` (0 is the static root). */
  on(bone: number, build: () => void): void {
    const before = this.current;
    this.current = bone;
    build();
    this.current = before;
  }

  /** Mark everything `build` adds to the enamel channel as the prop's ivory fitting. */
  ivory(build: () => void): void {
    const before = this.fitting;
    this.fitting = true;
    build();
    this.fitting = before;
  }

  /** Where the current prop is clicked: a prop-local box, instead of the bounds of what it is made of. */
  hit(min: Vec3, max: Vec3): void {
    const p = this.requirePlacement();
    const a = new Vector3(min[0], min[1], min[2]).applyMatrix4(p.matrix);
    const b = new Vector3(max[0], max[1], max[2]).applyMatrix4(p.matrix);
    this.hits.set(p.id, {
      min: [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)],
      max: [Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)],
    });
  }

  private requirePlacement(): PropPlacement {
    if (!this.placement) throw new Error('Assembly.begin() must come first');
    return this.placement;
  }

  /** Build geometry in the prop's local frame, then move it into the channel. */
  emit(channel: Channel, tint: Tint | undefined, build: (b: Bucket, style: Style) => void, uv?: UvRule): void {
    const local = new Bucket();
    const style: Style = {};
    if (typeof tint !== 'function' && tint) style.colour = tint;
    if (uv) style.uv = uv;
    build(local, style);
    if (typeof tint === 'function') {
      for (let i = 0; i < local.vertexCount; i += 1) {
        const c = tint([local.pos[i * 3] ?? 0, local.pos[i * 3 + 1] ?? 0, local.pos[i * 3 + 2] ?? 0], [local.nor[i * 3] ?? 0, local.nor[i * 3 + 1] ?? 0, local.nor[i * 3 + 2] ?? 0]);
        local.col[i * 3] = c[0];
        local.col[i * 3 + 1] = c[1];
        local.col[i * 3 + 2] = c[2];
      }
    }
    const p = this.requirePlacement();
    const data = this.channels[channel];
    const start = data.bucket.vertexCount;
    data.bucket.append(local, p.matrix);
    const end = data.bucket.vertexCount;
    for (let i = start; i < end; i += 1) {
      data.bone.push(this.current);
      data.owner.push(p.id);
    }
    if (this.fitting) {
      if (channel !== 'enamel') throw new Error('an ivory fitting is written in the enamel channel');
      const last = this.fittings[this.fittings.length - 1];
      if (last && last.prop === p.id && last.end === start) last.end = end;
      else this.fittings.push({ prop: p.id, start, end });
    }
    this.grow(p.id, data.bucket, start, end);
    this.trianglesBy.set(p.id, (this.trianglesBy.get(p.id) ?? 0) + local.triangleCount);
  }

  private grow(id: PropId, bucket: Bucket, start: number, end: number): void {
    let b = this.bounds.get(id);
    if (!b) {
      b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      this.bounds.set(id, b);
    }
    for (let i = start; i < end; i += 1) {
      for (let k = 0; k < 3; k += 1) {
        const v = bucket.pos[i * 3 + k] ?? 0;
        if (v < (b.min[k] ?? 0)) b.min[k] = v;
        if (v > (b.max[k] ?? 0)) b.max[k] = v;
      }
    }
  }

  /* ---- shapes, all in prop-local metres ---- */

  box(channel: Channel, centre: Vec3, size: Vec3, bevel: number, tint?: Tint, uv?: UvRule, skip: readonly FaceName[] = []): void {
    this.emit(channel, tint, (b, style) => box(b, centre, size, bevel, style, skip), uv);
  }

  /** A box from two corners: x, y, z each as [low, high]. */
  span(channel: Channel, x: readonly [number, number], y: readonly [number, number], z: readonly [number, number], bevel: number, tint?: Tint, uv?: UvRule, skip: readonly FaceName[] = []): void {
    this.box(channel, [(x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2], [Math.abs(x[1] - x[0]), Math.abs(y[1] - y[0]), Math.abs(z[1] - z[0])], bevel, tint, uv, skip);
  }

  cyl(channel: Channel, p: Placement, rTop: number, rBottom: number, height: number, segments: number, tint?: Tint, uv?: UvRule): void {
    this.emit(channel, tint, (b, style) => cylinder(b, p, rTop, rBottom, height, segments, style), uv);
  }

  sphere(channel: Channel, p: Placement, radius: number, wSeg: number, hSeg: number, tint?: Tint, uv?: UvRule, phiLength = Math.PI * 2, thetaLength = Math.PI): void {
    this.emit(channel, tint, (b, style) => sphere(b, p, radius, wSeg, hSeg, style, phiLength, thetaLength), uv);
  }

  torus(channel: Channel, p: Placement, radius: number, tube: number, radial: number, tubular: number, tint?: Tint, arc = Math.PI * 2, uv?: UvRule): void {
    this.emit(channel, tint, (b, style) => torus(b, p, radius, tube, radial, tubular, style, arc), uv);
  }

  lathe(channel: Channel, p: Placement, profile: readonly (readonly [number, number])[], segments: number, tint?: Tint, uv?: UvRule): void {
    this.emit(channel, tint, (b, style) => lathe(b, p, profile, segments, style), uv);
  }

  /**
   * Take a ready-made geometry (a mesh from a loaded model) into a channel, placed by `matrix` in
   * prop-local metres. Its normals are kept; it follows the current bone. Its UVs are kept as
   * authored, or, with `uv`, fitted into that rectangle of the channel's texture (the model's
   * texture is a cell of an atlas: see modelKit.ts). The channel's material draws it.
   */
  mesh(channel: Channel, geometry: BufferGeometry, matrix: Matrix4 = new Matrix4(), tint?: Tint, uv?: readonly [number, number, number, number]): void {
    this.emit(channel, tint, (b, style) => {
      addGeometry(b, geometry, matrix, style, false);
      if (!uv) return;
      // `b` is this mesh's own bucket, so every vertex in it is the mesh's.
      for (let i = 0; i < b.vertexCount; i += 1) {
        b.uv[i * 2] = uv[0] + (b.uv[i * 2] ?? 0) * (uv[2] - uv[0]);
        b.uv[i * 2 + 1] = uv[1] + (b.uv[i * 2 + 1] ?? 0) * (uv[3] - uv[1]);
      }
    });
  }

  /** A straight round rod between two prop-local points (a spoke, a wire, a cord), optionally tapering to `radiusEnd` at `to`. */
  rod(channel: Channel, from: Vec3, to: Vec3, radius: number, segments: number, tint?: Tint, uv?: UvRule, radiusEnd = radius): void {
    this.emit(
      channel,
      tint,
      (b, style) => {
        const d = new Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
        const length = d.length();
        if (length < 1e-9) return;
        const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize());
        const m = new Matrix4().compose(new Vector3((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2), q, new Vector3(1, 1, 1));
        const g = new CylinderGeometry(radiusEnd, radius, length, segments, 1, false);
        addGeometry(b, g, m, style, true);
        g.dispose();
      },
      uv,
    );
  }

  /** A quad listed bottom-left, bottom-right, top-right, top-left as seen from the front, facing `facing`. */
  quad(channel: Channel, p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, facing: Vec3, tint?: Tint, uvs?: readonly [Vec2, Vec2, Vec2, Vec2]): void {
    this.emit(channel, tint, (b, style) => quad(b, p0, p1, p2, p3, style, facing, uvs));
  }

  /** Raw access for anything the helpers do not cover. */
  raw(channel: Channel, tint: Tint | undefined, build: (b: Bucket, style: Style) => void, uv?: UvRule): void {
    this.emit(channel, tint, build, uv);
  }

  get triangles(): number {
    return CHANNELS.reduce((n, c) => n + this.channels[c].bucket.triangleCount, 0);
  }
}

/** A matrix that rotates by `angle` about `axis` through `pivot` (all in the same space). */
export function aboutPivot(pivot: Vec3, axis: Vec3, angle: number): Matrix4 {
  const q = new Quaternion().setFromAxisAngle(new Vector3(axis[0], axis[1], axis[2]).normalize(), angle);
  const to = new Matrix4().makeTranslation(pivot[0], pivot[1], pivot[2]);
  const away = new Matrix4().makeTranslation(-pivot[0], -pivot[1], -pivot[2]);
  return to.multiply(new Matrix4().makeRotationFromQuaternion(q)).multiply(away);
}
