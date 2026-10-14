import { Bone, BufferGeometry, Group, Matrix4, Quaternion, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3, Float32BufferAttribute, type BufferAttribute } from 'three';
import type { PropAnimation, PropId } from '../../props.ts';
import type { Vec3 } from '../math.ts';
import { fittingGain } from './glow.ts';
import { MODELS } from './models/index.ts';
import type { Phase } from './model.ts';
import type { AmbientDrive, PartPose, PoseSet } from './motion.ts';
import { Assembly, CHANNELS, type BoneDef } from './parts.ts';
import type { ExternalInstance } from './visuals.ts';
import type { PropMaterials } from './materials.ts';

/**
 * The props as three.js objects: one skinned mesh per material channel sharing one skeleton, a
 * bone for every moving part. Poses are applied by moving bones, never by rebuilding geometry, and
 * only for the props whose motion changed since the last frame.
 */

export interface BoneTransform {
  position: Vec3;
  quaternion: readonly [number, number, number, number];
  scale: number;
}

const rotateY = (v: Vec3, yaw: number): Vec3 => {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
};

/** Where a bone goes for a part pose: its pivot, moved and turned in the prop's own axes. */
export function boneTransform(bone: BoneDef, pose: PartPose | undefined): BoneTransform {
  const move = pose?.move ? rotateY(pose.move, bone.yaw) : ([0, 0, 0] as Vec3);
  const position: Vec3 = [bone.pivot[0] + move[0], bone.pivot[1] + move[1], bone.pivot[2] + move[2]];
  let quaternion: readonly [number, number, number, number] = [0, 0, 0, 1];
  if (pose?.turn) {
    const axis = rotateY(pose.turn.axis, bone.yaw);
    const q = new Quaternion().setFromAxisAngle(new Vector3(axis[0], axis[1], axis[2]).normalize(), pose.turn.angle);
    quaternion = [q.x, q.y, q.z, q.w];
  }
  return { position, quaternion, scale: pose?.scale ?? 1 };
}

/** The skinning matrix a bone applies to a rest-pose vertex: T(position) R S T(-pivot). */
export function skinMatrix(bone: BoneDef, pose: PartPose | undefined): Matrix4 {
  const t = boneTransform(bone, pose);
  const m = new Matrix4().compose(new Vector3(...t.position), new Quaternion(...t.quaternion), new Vector3(t.scale, t.scale, t.scale));
  return m.multiply(new Matrix4().makeTranslation(-bone.pivot[0], -bone.pivot[1], -bone.pivot[2]));
}

export interface PropsRig {
  readonly root: Group;
  readonly meshes: readonly SkinnedMesh[];
  readonly triangles: number;
  /** Pose every prop for the current motion. Returns true if any bone or fitting changed. */
  update(animation: PropAnimation, ambient: AmbientDrive, reducedMotion: boolean): boolean;
  dispose(): void;
}

/**
 * `externals` are visuals that bring their own scene graphs (see visuals.ts): mounted under the
 * rig's root, their part nodes posed exactly as the bones are, their fitting glow set by `setGlow`.
 */
export function createPropsRig(assembly: Assembly, materials: PropMaterials, externals: Partial<Record<PropId, ExternalInstance>> = {}): PropsRig {
  const root = new Group();
  root.name = 'corridor-props';
  const bones = assembly.bones.map((def) => {
    const bone = new Bone();
    bone.name = `${def.prop ?? 'root'}:${def.part}`;
    bone.position.set(def.pivot[0], def.pivot[1], def.pivot[2]);
    root.add(bone);
    return bone;
  });
  for (const instance of Object.values(externals)) root.add(instance.root);
  root.updateMatrixWorld(true);
  const skeleton = new Skeleton(bones);

  const geometries: BufferGeometry[] = [];
  const meshes: SkinnedMesh[] = [];
  let colour: BufferAttribute | null = null;
  let triangles = 0;
  for (const channel of CHANNELS) {
    const data = assembly.channels[channel];
    if (data.bucket.triangleCount === 0) continue;
    const geometry = data.bucket.toGeometry();
    const n = data.bucket.vertexCount;
    const index = new Uint16Array(n * 4);
    const weight = new Float32Array(n * 4);
    for (let i = 0; i < n; i += 1) {
      index[i * 4] = data.bone[i] ?? 0;
      weight[i * 4] = 1;
    }
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(index, 4));
    geometry.setAttribute('skinWeight', new Float32BufferAttribute(weight, 4));
    geometries.push(geometry);
    const mesh = new SkinnedMesh(geometry, materials.byChannel[channel]);
    mesh.name = `prop-${channel}`;
    mesh.bind(skeleton, new Matrix4());
    // Rest bounds with room for the parts that move; culled like any other mesh.
    if (geometry.boundingSphere) {
      mesh.boundingSphere = geometry.boundingSphere.clone();
      mesh.boundingSphere.radius += 0.6;
    }
    // Glass blends after the world's own panes.
    if (channel === 'glass') mesh.renderOrder = 4;
    root.add(mesh);
    meshes.push(mesh);
    triangles += data.bucket.triangleCount;
    if (channel === 'enamel') colour = geometry.getAttribute('color') as BufferAttribute;
  }

  // The fittings' resting colours, to scale each time a prop's cue changes.
  const enamel = assembly.channels.enamel.bucket;
  const base = new Float32Array(enamel.col);
  const gainOf = new Map<PropId, number>();

  const lastKey = new Map<PropId, string>();
  const lastAction = new Map<PropId, number>();
  const lastPhase = new Map<PropId, Phase>();
  const reducedLast = { value: false };

  const applyGain = (id: PropId, gain: number): boolean => {
    if ((gainOf.get(id) ?? 0) === gain) return false;
    gainOf.set(id, gain);
    externals[id]?.setGlow?.(gain);
    if (colour) {
      const k = 1 + gain;
      for (const range of assembly.fittings) {
        if (range.prop !== id) continue;
        for (let i = range.start * 3; i < range.end * 3; i += 1) colour.array[i] = (base[i] ?? 0) * k;
      }
      colour.needsUpdate = true;
    }
    return true;
  };

  const pose = (id: PropId, set: PoseSet): void => {
    for (const def of assembly.bones) {
      if (def.prop !== id) continue;
      const bone = bones[def.index];
      if (!bone) continue;
      const t = boneTransform(def, set[def.part]);
      bone.position.set(t.position[0], t.position[1], t.position[2]);
      bone.quaternion.set(t.quaternion[0], t.quaternion[1], t.quaternion[2], t.quaternion[3]);
      bone.scale.setScalar(t.scale);
      // An external visual's part node moves exactly as the bone does.
      const node = externals[id]?.part(def.part);
      if (node) {
        node.position.set(t.position[0], t.position[1], t.position[2]);
        node.quaternion.set(t.quaternion[0], t.quaternion[1], t.quaternion[2], t.quaternion[3]);
        node.scale.setScalar(t.scale);
      }
    }
  };

  return {
    root,
    meshes,
    triangles,
    update(animation, ambient, reducedMotion) {
      let changed = reducedLast.value !== reducedMotion;
      reducedLast.value = reducedMotion;
      for (const model of MODELS) {
        const m = animation[model.id];
        // Which way the action is running: up, or down, or (unchanged) as it was.
        const before = lastAction.get(model.id) ?? 0;
        const phase: Phase = m.action > before ? 'rising' : m.action < before ? 'falling' : (lastPhase.get(model.id) ?? 'rising');
        lastAction.set(model.id, m.action);
        lastPhase.set(model.id, phase);
        const ambientKey = model.id === 'team-shirts' ? ambient.sleeve : model.id === 'walking-boots' ? ambient.tag : 0;
        const key = `${m.action}|${phase}|${ambientKey}|${reducedMotion ? 1 : 0}`;
        if (lastKey.get(model.id) !== key) {
          lastKey.set(model.id, key);
          pose(model.id, model.pose(m, ambient, reducedMotion, phase));
          changed = true;
        }
        if (applyGain(model.id, fittingGain(m.attention, m.glint))) changed = true;
      }
      return changed;
    },
    dispose() {
      root.removeFromParent();
      for (const mesh of meshes) mesh.removeFromParent();
      for (const g of geometries) g.dispose();
      skeleton.dispose();
      for (const instance of Object.values(externals)) {
        instance.root.removeFromParent();
        instance.dispose();
      }
    },
  };
}
