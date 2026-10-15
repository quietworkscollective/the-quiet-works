import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Color, Matrix4, type BufferGeometry, type InstancedMesh } from 'three';
import { beaconColour, buildBeacon, glowMounts, glowQuad, GLOW_SIZE } from './beacon.ts';
import type { WorldMaterials } from './materials.ts';

/**
 * The far end's warm destination and the string of sconce glows that leads to it (see beacon.ts).
 * Static: it never animates and never asks for a frame.
 */
export function Beacon({ materials }: { materials: WorldMaterials }) {
  const parts = useMemo(() => {
    const b = buildBeacon();
    const [r, g, bl] = beaconColour();
    const warm = new Color(r, g, bl);
    return {
      doorway: b.doorway.toGeometry(),
      leaf: b.leaf.toGeometry(),
      halo: b.halo.toGeometry(),
      spill: b.spill.toGeometry(),
      windowPane: b.windowPane.toGeometry(),
      windowFrame: b.windowFrame.toGeometry(),
      floorBars: b.floorBars.toGeometry(),
      wallBars: b.wallBars.toGeometry(),
      doorwayMat: materials.beaconMaterial(warm.clone().multiplyScalar(0.8)),
      leafMat: materials.beaconMaterial('#4A2F1A'),
      haloMat: materials.beaconMaterial(warm.clone().multiplyScalar(0.7), { map: materials.textures.radial, additive: true }),
      spillMat: materials.beaconMaterial(warm.clone().multiplyScalar(1.3), { map: materials.textures.wedge, additive: true }),
      windowMat: materials.beaconMaterial(warm.clone().multiplyScalar(0.55)),
      windowFrameMat: materials.beaconMaterial('#493522'),
      windowBarsMat: materials.beaconMaterial(warm.clone().multiplyScalar(0.34), { map: materials.textures.windowBars, additive: true }),
    };
  }, [materials]);

  const glows = useMemo(() => {
    const [r, g, bl] = beaconColour();
    return {
      mounts: glowMounts(),
      geometry: glowQuad().toGeometry(),
      material: materials.beaconMaterial(new Color(r, g, bl).multiplyScalar(0.8), { map: materials.textures.radial, additive: true }),
    };
  }, [materials]);

  useEffect(
    () => () => {
      parts.doorway.dispose();
      parts.leaf.dispose();
      parts.halo.dispose();
      parts.spill.dispose();
      parts.windowPane.dispose();
      parts.windowFrame.dispose();
      parts.floorBars.dispose();
      parts.wallBars.dispose();
    },
    [parts],
  );
  useEffect(() => () => glows.geometry.dispose(), [glows]);

  const glowRef = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = glowRef.current;
    if (!mesh) return;
    const m = new Matrix4();
    const c = new Color();
    glows.mounts.forEach((mount, i) => {
      m.makeScale(GLOW_SIZE, GLOW_SIZE * 1.25, 1).setPosition(...mount.position);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.setScalar(mount.strength));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [glows]);

  return (
    <>
      <mesh name="beacon-doorway" geometry={parts.doorway as BufferGeometry} material={parts.doorwayMat} />
      <mesh name="beacon-leaf" geometry={parts.leaf as BufferGeometry} material={parts.leafMat} />
      <mesh name="beacon-halo" geometry={parts.halo as BufferGeometry} material={parts.haloMat} renderOrder={3} />
      <mesh name="beacon-spill" geometry={parts.spill as BufferGeometry} material={parts.spillMat} renderOrder={3} />
      <mesh name="far-window-glass" geometry={parts.windowPane as BufferGeometry} material={parts.windowMat} />
      <mesh name="far-window-frame" geometry={parts.windowFrame as BufferGeometry} material={parts.windowFrameMat} />
      <mesh name="far-window-floor-bars" geometry={parts.floorBars as BufferGeometry} material={parts.windowBarsMat} renderOrder={3} />
      <mesh name="far-window-wall-bars" geometry={parts.wallBars as BufferGeometry} material={parts.windowBarsMat} renderOrder={3} />
      <instancedMesh ref={glowRef} name="sconce-glows" args={[glows.geometry as BufferGeometry, glows.material, glows.mounts.length]} renderOrder={3} />
    </>
  );
}
