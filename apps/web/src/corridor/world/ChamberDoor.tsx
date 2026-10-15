import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, type BufferGeometry, type Group, type Material, type MeshBasicMaterial, type Object3D } from 'three';
import type { ChamberId } from '@tqw/engine';
import type { CorridorAnimation } from '../animation.ts';
import { SPINE_TIMING } from '../../timing.ts';
import { Bucket, quad } from './builder.ts';
import { bucketGeometries, createBuckets, type BucketKey, type Buckets } from './buckets.ts';
import type { ChamberDoorBuild } from './build.ts';
import { kelvinToLinear } from './colour.ts';
import { holeOf } from './openings.ts';
import { buildInterior } from './doorKit/interior.ts';
import { LEAF_THICKNESS } from './doorKit/plan.ts';
import { FRAME } from './doorKit/frame.ts';
import { CORRIDOR } from '../layout.ts';
import { nth, noise1, smoothstep } from './math.ts';
import type { LitMaterial, WorldMaterials } from './materials.ts';
import { OutlineDoorModel } from './OutlineDoorModel.tsx';

/**
 * One chamber door at runtime: the leaf swings on its hinge (or the Outline Room's paired panels slide), the handle turns, a
 * sealed door rattles, hovering or focusing a door lets its plaque and handle catch a little more
 * light, and a ready chamber leaks its interior light at the seam. All of it is read
 * from `animation[id]` in `useFrame`; nothing here starts an animation of its own, and nothing
 * invalidates the frame loop.
 */

const SWING = (SPINE_TIMING.swingDeg * Math.PI) / 180;
const HANDLE_TURN = (SPINE_TIMING.handleTurnDeg * Math.PI) / 180;
const NOOP = (): void => undefined;

interface Props {
  door: ChamberDoorBuild;
  materials: WorldMaterials;
  animation: CorridorAnimation;
  reducedMotion: boolean;
  onOutlineReady?(): void;
  onPointer(id: ChamberId, kind: 'over' | 'out' | 'click'): void;
}

/** Geometries for a set of buckets, disposed when they change or the door unmounts. */
function useBucketGeometries(buckets: Buckets): Partial<Record<BucketKey, BufferGeometry>> {
  const geometries = useMemo(() => bucketGeometries(buckets), [buckets]);
  useEffect(
    () => () => {
      for (const g of Object.values(geometries)) g.dispose();
    },
    [geometries],
  );
  return geometries;
}

const EMPTY: Buckets = createBuckets();

/** Dev only: each mounted door's per-frame update, so tooling can apply a posed animation. */
export const DOOR_UPDATERS = new Set<() => void>();

const RENDER_ORDER: Partial<Record<BucketKey, number>> = { decal: 1, marks: 1, pane: 2, glow: 3 };

function Meshes({ geometries, materials, override }: { geometries: Partial<Record<BucketKey, BufferGeometry>>; materials: WorldMaterials; override?: Partial<Record<BucketKey, Material>> }) {
  return (
    <>
      {(Object.entries(geometries) as [BucketKey, BufferGeometry][]).map(([key, geometry]) => (
        <mesh key={key} geometry={geometry} material={override?.[key] ?? materials.byKey[key]} renderOrder={RENDER_ORDER[key] ?? 0} />
      ))}
    </>
  );
}

export function ChamberDoor({ door, materials, animation, reducedMotion, onOutlineReady, onPointer }: Props) {
  const { placement, build } = door;
  if (placement.chamber === null) throw new Error(`${placement.key} is not a chamber door`);
  const id = placement.chamber;
  const customOutlineDoor = id === 'outline-room';
  const spec = placement.spec;
  const sign = placement.side === 'left' ? -1 : 1;

  const leafGeometries = build.leaves.map((leaf) => leaf.body);
  const handleGeometries = build.leaves.map((leaf) => leaf.handle?.geo ?? null);
  // Hooks cannot run in a loop over a changing list, but the leaf count is fixed per door.
  const leafA = useBucketGeometries(nth(leafGeometries, 0));
  const leafB = useBucketGeometries(leafGeometries[1] ?? EMPTY);
  const handleA = useBucketGeometries(handleGeometries[0] ?? EMPTY);
  const handleB = useBucketGeometries(handleGeometries[1] ?? EMPTY);
  const interiorBuckets = useMemo(() => (spec.spill ? buildInterior(spec, customOutlineDoor ? 'outline-room' : 'default') : EMPTY), [spec, customOutlineDoor]);
  const interior = useBucketGeometries(interiorBuckets);
  const interiorRef = useRef<Group>(null);
  const leafSets = [leafA, leafB];
  const handleSets = [handleA, handleB];

  // Per-door materials where a part must catch light on its own.
  const own = useMemo(() => {
    const plaque = materials.litClone(materials.plaque);
    if (plaque.map) plaque.emissiveMap = plaque.map;
    plaque.emissive = new Color(0, 0, 0);
    const handleBrass = materials.litClone(materials.byKey.brass as LitMaterial);
    handleBrass.emissive = new Color(0, 0, 0);
    const handleIron = materials.litClone(materials.byKey.iron as LitMaterial);
    handleIron.emissive = new Color(0, 0, 0);
    return { plaque, handleBrass, handleIron };
  }, [materials]);

  const leafRefs = useRef<(Object3D | null)[]>([]);
  const handleRefs = useRef<(Group | null)[]>([]);
  const setOutlineLeaf = useCallback((side: 'left' | 'right', node: Object3D | null) => {
    leafRefs.current[side === 'left' ? 0 : 1] = node;
  }, []);

  // Seam light: a warm sheet behind the leaf that shows through the gaps while the door is shut,
  // and the interior light spilling over the corridor floor once it opens.
  const light = useMemo(() => {
    if (!spec.spill) return null;
    const [r, g, b] = kelvinToLinear(spec.spill.kelvin);
    const hole = holeOf(spec);
    const w = spec.width;
    const h = spec.height;
    const z = -FRAME.leafSetback - LEAF_THICKNESS[spec.family] - 0.025;
    const sheet = new Bucket();
    quad(sheet, [-w / 2, 0, z], [w / 2, 0, z], [w / 2, h, z], [-w / 2, h, z], undefined, [0, 0, 1]);
    // The strip of light on the floor in front of a shut door, and the wedge it becomes.
    const strip = new Bucket();
    const y = 0.003;
    quad(strip, [-w / 2 - 0.02, y, 0.01], [w / 2 + 0.02, y, 0.01], [w / 2 + 0.02, y, 0.2], [-w / 2 - 0.02, y, 0.2], undefined, [0, 1, 0], [[0, 1], [1, 1], [1, 0], [0, 0]]);
    const wedge = new Bucket();
    const depth = 2.7;
    const spread = hole.width + 1.2;
    quad(wedge, [-spread / 2, y, 0.01], [spread / 2, y, 0.01], [spread / 2, y, depth], [-spread / 2, y, depth], undefined, [0, 1, 0], [[0, 1], [1, 1], [1, 0], [0, 0]]);
    const colour = new Color(r, g, b);
    return {
      sheet: sheet.toGeometry(),
      strip: strip.toGeometry(),
      wedge: wedge.toGeometry(),
      sheetMat: materials.basicMaterial(colour.clone().multiplyScalar(1.7), { opacity: customOutlineDoor ? 0.12 : 1 }),
      stripMat: materials.glowMaterial(materials.textures.wedge, colour.clone().multiplyScalar(0.8), 0.5),
      wedgeMat: materials.glowMaterial(materials.textures.wedge, colour.clone().multiplyScalar(0.55), 0),
    };
  }, [spec, materials, customOutlineDoor]);
  useEffect(
    () => () => {
      if (!light) return;
      light.sheet.dispose();
      light.strip.dispose();
      light.wedge.dispose();
    },
    [light],
  );

  // Pointer cursor while over a door.
  const domElement = useThree((s) => s.gl.domElement);

  const update = (): void => {
    const m = animation[id];
    const swing = smoothOpen(m.open);
    if (customOutlineDoor) {
      const left = leafRefs.current[0];
      const right = leafRefs.current[1];
      const travel = spec.width / 2;
      if (left) left.position.x = Number(left.userData['closedX'] ?? left.position.x) - swing * travel;
      if (right) right.position.x = Number(right.userData['closedX'] ?? right.position.x) + swing * travel;
    } else {
      build.leaves.forEach((leaf, i) => {
        const group = leafRefs.current[i];
        if (!group) return;
        const dir = leaf.hinge === 'left' ? 1 : -1;
        let yaw = dir * swing * SWING;
        let dx = 0;
        let dz = 0;
        if (m.rattle > 0 && !reducedMotion) {
          const p = m.rattle;
          const decay = 1 - p;
          dx = Math.sin(p * Math.PI * 2 * 7) * 0.0032 * decay;
          dz = noise1(p * 14, i + 3) * 0.0014 * decay;
          yaw += Math.sin(p * Math.PI * 2 * 5.5 + 1) * 0.0035 * decay;
        }
        group.position.set(leaf.pivot[0] + dx, leaf.pivot[1], leaf.pivot[2] + dz);
        group.rotation.set(0, yaw, 0);
        const handle = handleRefs.current[i];
        if (handle && leaf.handle) {
          let turn = -leaf.handle.dir * m.handle * HANDLE_TURN;
          if (m.rattle > 0 && !reducedMotion) turn += Math.sin(m.rattle * Math.PI * 2 * 9) * (1 - m.rattle) * 0.11;
          handle.rotation.set(0, 0, turn);
          if (leaf.handle.kind === 'push-plate') handle.position.z = leaf.handle.offset[2] - 0.004 * m.handle;
        }
      });
    }
    // Attention: the plaque and handle catch a little more light.
    const a = Math.min(1, Math.max(0, m.attention));
    own.plaque.emissive.setRGB(0.5 * a * 0.34, 0.45 * a * 0.34, 0.38 * a * 0.34);
    own.handleBrass.emissive.setRGB(0.22 * a, 0.14 * a, 0.05 * a);
    own.handleIron.emissive.setRGB(0.08 * a, 0.07 * a, 0.05 * a);

    // The room behind the leaf is only drawn while the door is open enough to see into it.
    if (interiorRef.current) interiorRef.current.visible = m.open > 0.004;
    if (light) {
      const o = smoothstep(0, 0.06, m.open);
      const lit = smoothstep(0.02, 0.5, m.open);
      const closedSheetOpacity = customOutlineDoor ? 0.12 : 1;
      (light.sheetMat as MeshBasicMaterial).opacity = closedSheetOpacity * (1 - o);
      (light.sheetMat as MeshBasicMaterial).visible = o < 0.999;
      (light.stripMat as MeshBasicMaterial).opacity = 0.5 * (1 - lit);
      (light.wedgeMat as MeshBasicMaterial).opacity = 0.7 * lit;
    }
  };
  useFrame(update);
  // Development only: let a screenshot script pose the door and render without the frame loop.
  const updateRef = useRef(update);
  useEffect(() => {
    updateRef.current = update;
  });
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const run = () => updateRef.current();
    DOOR_UPDATERS.add(run);
    return () => {
      DOOR_UPDATERS.delete(run);
    };
  }, []);

  const hole = holeOf(spec);
  const hit = useMemo(() => ({ width: hole.width + 0.4, height: hole.height + 0.3 }), [hole.width, hole.height]);
  const matrixPosition: [number, number, number] = [sign * (CORRIDOR.width / 2), 0, placement.z];
  const rotationY = placement.side === 'left' ? Math.PI / 2 : -Math.PI / 2;

  return (
    <group position={matrixPosition} rotation={[0, rotationY, 0]} dispose={null}>
      {customOutlineDoor ? (
        <OutlineDoorModel leafRef={setOutlineLeaf} onReady={onOutlineReady ?? NOOP} />
      ) : build.leaves.map((leaf, i) => (
        <group
          key={leaf.index}
          ref={(g) => {
            leafRefs.current[i] = g;
          }}
          position={leaf.pivot}
        >
          <Meshes geometries={nth(leafSets, i)} materials={materials} override={{ plaque: own.plaque }} />
          {leaf.handle && (
            <group
              ref={(g) => {
                handleRefs.current[i] = g;
              }}
              position={leaf.handle.offset}
            >
              <Meshes geometries={nth(handleSets, i)} materials={materials} override={{ brass: own.handleBrass, iron: own.handleIron }} />
            </group>
          )}
        </group>
      ))}
      <group ref={interiorRef} visible={false}>
        <Meshes geometries={interior} materials={materials} />
      </group>
      {light && (
        <>
          <mesh geometry={light.sheet} material={light.sheetMat} renderOrder={1} />
          <mesh geometry={light.strip} material={light.stripMat} renderOrder={3} />
          <mesh geometry={light.wedge} material={light.wedgeMat} renderOrder={3} />
        </>
      )}
      {/* Generous hit area: the whole leaf and its frame, and a little beyond. Never rendered. */}
      <mesh
        visible={false}
        position={[0, hit.height / 2, 0.02]}
        onPointerOver={(e) => {
          e.stopPropagation();
          domElement.style.cursor = 'pointer';
          onPointer(id, 'over');
        }}
        onPointerOut={() => {
          domElement.style.cursor = '';
          onPointer(id, 'out');
        }}
        onClick={(e) => {
          e.stopPropagation();
          onPointer(id, 'click');
        }}
      >
        <boxGeometry args={[hit.width, hit.height, 0.4]} />
        <meshBasicMaterial />
      </mesh>
    </group>
  );
}

/** The swing's own easing is the camera lane's; the leaf follows `open` one to one. */
function smoothOpen(open: number): number {
  return Math.min(1, Math.max(0, open));
}

