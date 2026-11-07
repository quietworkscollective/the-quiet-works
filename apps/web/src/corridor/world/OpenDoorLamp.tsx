import { useEffect, useMemo } from 'react';
import { AdditiveBlending, Color, SpriteMaterial } from 'three';
import type { ChamberId } from '@tqw/engine';
import type { DoorSpec } from '../doorKit.ts';
import { buildOpenLamp, OPEN_LAMP, openLampCentre } from './openDoor.ts';
import type { WorldMaterials } from './materials.ts';

/** The lamp on an open room's door. Static and unlit: no light source, nothing to animate. */
export function OpenDoorLamp({ id, spec, materials }: { id: ChamberId; spec: DoorSpec; materials: WorldMaterials }) {
  const parts = useMemo(() => {
    const built = buildOpenLamp(spec);
    const [r, g, b] = OPEN_LAMP.glass;
    const colour = new Color(r, g, b);
    return {
      fixture: built.fixture.toGeometry(),
      glass: built.glass.toGeometry(),
      pool: built.pool.toGeometry(),
      glassMat: materials.beaconMaterial(colour),
      // A sprite faces the camera by itself, so the glow holds its shape from any angle at no per-frame cost.
      haloMat: new SpriteMaterial({ map: materials.textures.radial, color: colour.clone().multiplyScalar(OPEN_LAMP.halo.strength / 2.6), blending: AdditiveBlending, depthWrite: false, fog: false }),
      poolMat: materials.beaconMaterial(colour.clone().multiplyScalar(OPEN_LAMP.pool.strength / 2.6), { map: materials.textures.radial, additive: true }),
    };
  }, [spec, materials]);
  useEffect(
    () => () => {
      parts.fixture.dispose();
      parts.glass.dispose();
      parts.haloMat.dispose();
      parts.pool.dispose();
    },
    [parts],
  );
  return (
    <group name={`open-door-lamp:${id}`} userData={{ bake: 'dynamic' }}>
      <mesh geometry={parts.fixture} material={materials.byKey.iron} />
      <mesh geometry={parts.glass} material={parts.glassMat} />
      <sprite position={openLampCentre(spec) as [number, number, number]} scale={OPEN_LAMP.halo.size} material={parts.haloMat} renderOrder={3} />
      <mesh geometry={parts.pool} material={parts.poolMat} renderOrder={3} />
    </group>
  );
}
