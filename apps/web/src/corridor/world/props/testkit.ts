import { PROPS, type PropId, type PropMotion } from '../../props.ts';
import type { Bucket } from '../builder.ts';
import { MODELS } from './models/index.ts';
import type { Phase } from './model.ts';
import { NO_AMBIENT, type AmbientDrive, type PoseSet } from './motion.ts';
import { skinMatrix } from './rig.ts';
import { CHANNELS, type Assembly } from './parts.ts';

/** Helpers for the props' tests: pose a built assembly in node and measure what comes out. */

export const motion = (action: number, extra: Partial<PropMotion> = {}): PropMotion => ({ attention: 0, action, glint: 0, ...extra });

export function poseOf(id: PropId, action: number, options: { phase?: Phase; reduced?: boolean; ambient?: AmbientDrive } = {}): PoseSet {
  const model = MODELS.find((m) => m.id === id);
  if (!model) throw new Error(`no model for ${id}`);
  return model.pose(motion(action), options.ambient ?? NO_AMBIENT, options.reduced ?? false, options.phase ?? 'rising');
}

export interface Vertex {
  prop: PropId;
  position: [number, number, number];
}

/** Every vertex in world space with its bones posed; `poses` is by prop, a prop not named is at rest. */
export function posedVertices(assembly: Assembly, poses: Partial<Record<PropId, PoseSet>> = {}, only?: PropId): Vertex[] {
  const matrices = assembly.bones.map((bone) => (bone.prop === null ? null : skinMatrix(bone, poses[bone.prop]?.[bone.part])));
  const out: Vertex[] = [];
  for (const channel of CHANNELS) {
    const { bucket, bone, owner } = assembly.channels[channel];
    for (let i = 0; i < bucket.vertexCount; i += 1) {
      const prop = owner[i];
      if (prop === undefined || (only !== undefined && prop !== only)) continue;
      const m = matrices[bone[i] ?? 0];
      let x = bucket.pos[i * 3] ?? 0;
      let y = bucket.pos[i * 3 + 1] ?? 0;
      let z = bucket.pos[i * 3 + 2] ?? 0;
      if (m) {
        const e = m.elements as unknown as readonly number[];
        const at = (k: number): number => e[k] ?? 0;
        [x, y, z] = [at(0) * x + at(4) * y + at(8) * z + at(12), at(1) * x + at(5) * y + at(9) * z + at(13), at(2) * x + at(6) * y + at(10) * z + at(14)];
      }
      out.push({ prop, position: [x, y, z] });
    }
  }
  return out;
}

/**
 * Triangles wound against their own normals, which show as holes in a front-facing material. A
 * triangle counts only if its geometric normal opposes all three of its vertex normals: a smoothed
 * normal at a sharp crease (a rolled rim) can disagree at one corner of a good triangle, but a
 * whole inside-out surface disagrees at every corner.
 */
export function windingErrors(b: Bucket): number {
  let bad = 0;
  for (let t = 0; t < b.idx.length; t += 3) {
    const ids = [b.idx[t] ?? 0, b.idx[t + 1] ?? 0, b.idx[t + 2] ?? 0] as const;
    const p = (i: number): [number, number, number] => [b.pos[i * 3] ?? 0, b.pos[i * 3 + 1] ?? 0, b.pos[i * 3 + 2] ?? 0];
    const [a, c, d] = [p(ids[0]), p(ids[1]), p(ids[2])];
    const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const n = [(u[1] ?? 0) * (v[2] ?? 0) - (u[2] ?? 0) * (v[1] ?? 0), (u[2] ?? 0) * (v[0] ?? 0) - (u[0] ?? 0) * (v[2] ?? 0), (u[0] ?? 0) * (v[1] ?? 0) - (u[1] ?? 0) * (v[0] ?? 0)];
    if (Math.hypot(n[0] ?? 0, n[1] ?? 0, n[2] ?? 0) < 1e-14) continue;
    const opposed = ids.every((i) => (n[0] ?? 0) * (b.nor[i * 3] ?? 0) + (n[1] ?? 0) * (b.nor[i * 3 + 1] ?? 0) + (n[2] ?? 0) * (b.nor[i * 3 + 2] ?? 0) <= 0);
    if (opposed) bad += 1;
  }
  return bad;
}

export const PROP_IDS: readonly PropId[] = PROPS.map((p) => p.id);

/** The largest distance any vertex of `id` is moved between two poses of it. */
export function displacement(assembly: Assembly, id: PropId, a: PoseSet, b: PoseSet): number {
  const from = posedVertices(assembly, { [id]: a }, id);
  const to = posedVertices(assembly, { [id]: b }, id);
  let worst = 0;
  for (let i = 0; i < from.length; i += 1) {
    const p = from[i]?.position ?? [0, 0, 0];
    const q = to[i]?.position ?? [0, 0, 0];
    worst = Math.max(worst, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
  }
  return worst;
}
