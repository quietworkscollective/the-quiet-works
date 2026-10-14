import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { BoxGeometry, Color, Matrix4, type InstancedMesh } from 'three';
import { officeAssetSlot } from './assetSlots.ts';
import { documentChannelGeometry } from './documentChannel.ts';
import { boxAt, merge } from './geometry.ts';
import type { Materials } from './materials.ts';

/** The archive is real depth behind a physical barrier; its repeating modules share one draw. */
export function Room({ materials }: { materials: Materials }) {
  const invalidate = useThree(s => s.invalidate);
  const stacks = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => {
    const concrete = [
      boxAt(8.4, 0.12, 30, 0, -0.06, 15),
      boxAt(8.4, 0.18, 30, 0, 5.89, 15),
      boxAt(0.18, 5.8, 30, -4.29, 2.9, 15),
      boxAt(0.18, 5.8, 1.27, 4.29, 2.9, 0.635),
      boxAt(0.18, 5.8, 27.67, 4.29, 2.9, 16.165),
      boxAt(0.18, 3.55, 1.06, 4.29, 4.025, 1.8),
      boxAt(3.675, 5.8, 0.18, -2.3625, 2.9, -0.09),
      boxAt(3.675, 5.8, 0.18, 2.3625, 2.9, -0.09),
      boxAt(1.05, 3.55, 0.18, 0, 4.025, -0.09),
      boxAt(1.2, 5.8, 0.22, -3.6, 2.9, 8),
      boxAt(1.5, 1, 0.22, -2.25, 0.5, 8),
      boxAt(1.5, 3.7, 0.22, -2.25, 3.95, 8),
      boxAt(2.5, 5.8, 0.22, -0.25, 2.9, 8),
      boxAt(1.1, 5.8, 0.22, 3.65, 2.9, 8),
      boxAt(2.1, 2.5, 0.22, 2.05, 4.55, 8),
    ];
    const ribs = [];
    for (let z = 2; z < 30; z += 3) {
      ribs.push(boxAt(8.4, 0.3, 0.32, 0, 5.57, z));
      if (z > 8) for (const x of [-3.8, 3.8]) ribs.push(boxAt(0.3, 5.5, 0.35, x, 2.75, z));
    }
    const metal = [
      boxAt(1.66, 0.03, 0.2, -2.25, 0.97, 7.87),
      boxAt(1.66, 0.03, 0.2, -2.25, 2.13, 7.87),
      boxAt(0.03, 1.22, 0.2, -3.05, 1.55, 7.87),
      boxAt(0.03, 1.22, 0.2, -1.45, 1.55, 7.87),
      boxAt(0.04, 2.25, 1.12, 4.16, 1.125, 1.8),
      boxAt(0.15, 0.06, 1.2, 4.16, 2.28, 1.8),
    ];
    // The wired opening and barred archive opening make the public boundary observable.
    for (let x = 1.12; x < 3.1; x += 0.14) metal.push(boxAt(0.014, 3.3, 0.03, x, 1.65, 7.86));
    for (let x = -2.96; x < -1.5; x += 0.14) metal.push(boxAt(0.014, 1.05, 0.014, x, 1.57, 7.93));
    for (let y = 1.15; y < 2.1; y += 0.2) metal.push(boxAt(1.5, 0.006, 0.008, -2.25, y, 7.93));
    // Document channel and records cabinet are substantial furniture, outside the walking line.

    const cabinet = [boxAt(0.9, 1.25, 0.45, ...officeAssetSlot('records-cabinet').position)];
    for (let y = 0.22; y < 1.2; y += 0.3) {
      metal.push(boxAt(0.015, 0.16, 0.04, -3.026, y, 5.9));
      cabinet.push(boxAt(0.018, 0.015, 0.4, -3.038, y + 0.13, 5.9));
    }
    return {
      channel: documentChannelGeometry(),
      concrete: merge(concrete), ribs: merge(ribs), metal: merge(metal), cabinet: merge(cabinet),
      bundle: new BoxGeometry(0.7, 0.18, 0.8),
    };
  }, []);
  useEffect(() => () => { for (const item of Object.values(geometry)) item.dispose(); }, [geometry]);
  useLayoutEffect(() => {
    const mesh = stacks.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    const tint = new Color();
    for (let i = 0; i < 160; i++) {
      const module = Math.floor(i / 10);
      const layer = i % 10;
      const [x,,z] = officeAssetSlot(`archive-stack-${module+1}`).position;
      matrix.makeTranslation(x + Math.sin(i * 3.1) * 0.009, 0.1 + layer * 0.185, z);
      mesh.setMatrixAt(i, matrix);
      const depth = z < 15 ? .45 : .2;
      const corner = Math.abs(x) > 3 ? .72 : 1;
      const crown = 1 - .35 * Math.max(0, (layer - 5) / 4);
      tint.set('#ddd5c8').multiplyScalar(depth * corner * crown);
      mesh.setColorAt(i, tint);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [invalidate]);
  return (
    <group dispose={null}>
      <mesh geometry={geometry.concrete} material={materials.floor} receiveShadow />
      <mesh geometry={geometry.ribs} material={materials.pillar} />
      <mesh name="office-document-channel" geometry={geometry.channel} material={materials.frame} />
      <mesh geometry={geometry.metal} material={materials.frame} />
      <mesh userData={{officeObjectId:'register'}} geometry={geometry.cabinet} material={materials.enamelDark} />
      <instancedMesh ref={stacks} args={[geometry.bundle, materials.paperStack, 160]} />
    </group>
  );
}
