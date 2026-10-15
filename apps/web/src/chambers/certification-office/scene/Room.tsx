import { useEffect, useMemo } from 'react';
import { BufferAttribute, type BufferGeometry } from 'three';
import { documentChannelGeometry } from './documentChannel.ts';
import { boxAt, merge } from './geometry.ts';
import type { Materials } from './materials.ts';

/** The archive is real depth behind a physical barrier; its repeating modules share one draw. */
export function Room({ materials, heroWindow = false }: { materials: Materials; heroWindow?: boolean }) {

  const geometry = useMemo(() => {
    const concrete = [
      interiorFace(boxAt(0.18, 5.8, 10.02, -4.29, 2.9, 3.01), 'x', 1),
      interiorFace(boxAt(0.18, 5.8, 10.02, 4.29, 2.9, 3.01), 'x', -1),
      interiorFace(boxAt(8.4, 0.18, 10.02, 0, 5.89, 3.01), 'y', -1),
      interiorFace(boxAt(8.4, 5.8, .18, 0, 2.9, 30), 'z', -1),
      boxAt(1.2, 5.8, 0.22, -3.6, 2.9, 8),
      boxAt(1.5, 1, 0.22, -2.25, 0.5, 8),
      boxAt(1.5, .6, .22, -2.25, 2.4, 8),
      boxAt(1.5, 1.9, .22, -2.25, 4.85, 8),
      boxAt(2.5, 5.8, 0.22, -0.25, 2.9, 8),
      boxAt(1.1, 5.8, 0.22, 3.65, 2.9, 8),
      boxAt(2.1, 2.5, 0.22, 2.05, 4.55, 8),
    ];
    const ribs = [-1, 1].flatMap(side => [1.2, 3.8, 6.4].map(z =>
      boxAt(.22, 5.7, .4, side * 4.12, 2.85, z)));
    for (let z = 2; z < 30; z += 3) {
      ribs.push(boxAt(8.4, 0.3, 0.32, 0, 5.57, z));
      if (z > 8) for (const x of [-3.8, 3.8]) ribs.push(boxAt(0.3, 5.5, 0.35, x, 2.75, z));
    }
    const metal = [
      ...(!heroWindow ? [boxAt(1.66, 0.03, 0.2, -2.25, 0.97, 7.87),
      boxAt(1.66, 0.03, 0.2, -2.25, 2.13, 7.87),
      boxAt(0.03, 1.22, 0.2, -3.05, 1.55, 7.87),
      boxAt(0.03, 1.22, 0.2, -1.45, 1.55, 7.87),
      ] : []),
      boxAt(0.04, 2.25, 1.12, 4.16, 1.125, 6.7),
      boxAt(0.15, 0.06, 1.2, 4.16, 2.28, 6.7),
    ];
    // The wired opening and barred archive opening make the public boundary observable.
    for (let x = 1.12; x < 3.1; x += 0.14) metal.push(boxAt(0.014, 3.3, 0.03, x, 1.65, 7.86));
    if (!heroWindow) for (let x = -2.96; x < -1.5; x += 0.14) metal.push(boxAt(0.014, 1.05, 0.014, x, 1.57, 7.93));
    if (!heroWindow) for (let y = 1.15; y < 2.1; y += 0.2) metal.push(boxAt(1.5, 0.006, 0.008, -2.25, y, 7.93));
    // Document channel and records cabinet are substantial furniture, outside the walking line.

    return {
      channel: documentChannelGeometry(),
      concrete: worldUv(merge(concrete)), floor: worldUv(interiorFace(boxAt(8.4,.12,10.02,0,-.06,3.01), 'y', 1)),
      archiveFloor: worldUv(interiorFace(boxAt(8.4,.12,21.98,0,-.06,19.01), 'y', 1)),
      archiveConcrete: worldUv(merge([
        interiorFace(boxAt(.18,5.8,21.98,-4.29,2.9,19.01), 'x', 1),
        interiorFace(boxAt(.18,5.8,21.98,4.29,2.9,19.01), 'x', -1),
        interiorFace(boxAt(8.4,.18,21.98,0,5.89,19.01), 'y', -1),
      ])), ribs: merge(ribs), metal: merge(metal),
    };
  }, [heroWindow]);
  useEffect(() => () => { for (const item of Object.values(geometry)) item.dispose(); }, [geometry]);
  return (
    <group dispose={null}>
      <mesh geometry={geometry.concrete} material={materials.concreteFrame} receiveShadow />
      <mesh geometry={geometry.floor} material={materials.floor} receiveShadow />
      <mesh geometry={geometry.archiveConcrete} material={materials.concreteFrame} receiveShadow />
      <mesh geometry={geometry.archiveFloor} material={materials.floor} receiveShadow />
      <mesh geometry={geometry.ribs} material={materials.pillar} />
      <mesh name="office-document-channel" geometry={geometry.channel} material={materials.frame} />
      <mesh geometry={geometry.metal} material={materials.frame} />
    </group>
  );
}

/** Scan repeats are in metres, independent of each wall panel's dimensions. */
function worldUv(geometry: BufferGeometry): BufferGeometry {
 const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),uv=new Float32Array(p.count*2);
 for(let i=0;i<p.count;i++) {
  uv[i*2]=Math.abs(n.getX(i))>.8?p.getZ(i):p.getX(i);
  uv[i*2+1]=Math.abs(n.getY(i))>.8?p.getZ(i):p.getY(i);
 }
 geometry.setAttribute('uv',new BufferAttribute(uv,2));return geometry;
}

/** Unseen shell backs consume atlas area without contributing to the inward stage. */
function interiorFace(geometry: BufferGeometry, axis: 'x' | 'y' | 'z', direction: 1 | -1): BufferGeometry {
  const normal = geometry.getAttribute('normal');
  const component = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const index = geometry.getIndex();
  if (!index) throw new Error('The shell face requires indexed box geometry');
  const visible: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    if (normal.getComponent(index.getX(i), component) !== direction) continue;
    visible.push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
  }
  geometry.setIndex(visible);
  geometry.clearGroups();
  return geometry;
}
