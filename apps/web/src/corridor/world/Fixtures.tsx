import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import type { BufferGeometry, InstancedMesh } from 'three';
import { buildRadiator, buildSconce, mountMatrix, radiatorMounts, sconceGroups, type Mount } from './fixtures.ts';
import type { WorldMaterials } from './materials.ts';

/**
 * Repeated fixtures as instanced meshes: one geometry per material, however many sconces. The
 * sconce's glass is self-lit (its brightness is in the vertex colour); the light it casts is a
 * static lamp in the shader, so these meshes add no lights.
 */
export function Fixtures({ materials }: { materials: WorldMaterials }) {
  const invalidate = useThree((s) => s.invalidate);
  const groups = useMemo(() => sconceGroups(), []);
  const geometries = useMemo(() => {
    const near = buildSconce('near');
    const far = buildSconce('far');
    return { brass: near.brass.toGeometry(), glass: near.glass.toGeometry(), farBrass: far.brass.toGeometry(), farGlass: far.glass.toGeometry() };
  }, []);
  useEffect(
    () => () => {
      geometries.brass.dispose();
      geometries.glass.dispose();
      geometries.farBrass.dispose();
      geometries.farGlass.dispose();
    },
    [geometries],
  );

  const radiators = useMemo(() => radiatorMounts(), []);
  const radiatorGeometries = useMemo(() => {
    const { paint, iron } = buildRadiator();
    return { paint: paint.toGeometry(), iron: iron.toGeometry() };
  }, []);
  useEffect(
    () => () => {
      radiatorGeometries.paint.dispose();
      radiatorGeometries.iron.dispose();
    },
    [radiatorGeometries],
  );

  const brassRef = useRef<InstancedMesh>(null);
  const glassRef = useRef<InstancedMesh>(null);
  const farBrassRef = useRef<InstancedMesh>(null);
  const farGlassRef = useRef<InstancedMesh>(null);
  const radiatorPaintRef = useRef<InstancedMesh>(null);
  const radiatorIronRef = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const place = (mesh: InstancedMesh | null, list: readonly Mount[]): void => {
      if (!mesh) return;
      list.forEach((m, i) => mesh.setMatrixAt(i, mountMatrix(m)));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    };
    place(brassRef.current, groups.near);
    place(glassRef.current, groups.near);
    place(farBrassRef.current, groups.far);
    place(farGlassRef.current, groups.far);
    place(radiatorPaintRef.current, radiators);
    place(radiatorIronRef.current, radiators);
    invalidate();
  }, [groups, radiators, invalidate]);

  return (
    <>
      <instancedMesh ref={brassRef} name="sconce-brass" args={[geometries.brass as BufferGeometry, materials.byKey.brass, groups.near.length]} />
      <instancedMesh ref={glassRef} name="sconce-glass" args={[geometries.glass as BufferGeometry, materials.byKey.lamp, groups.near.length]} />
      <instancedMesh ref={farBrassRef} name="sconce-brass-far" args={[geometries.farBrass as BufferGeometry, materials.byKey.brass, groups.far.length]} />
      <instancedMesh ref={farGlassRef} name="sconce-glass-far" args={[geometries.farGlass as BufferGeometry, materials.byKey.lamp, groups.far.length]} />
      <instancedMesh ref={radiatorPaintRef} name="radiator-paint" args={[radiatorGeometries.paint as BufferGeometry, materials.byKey.paint, radiators.length]} />
      <instancedMesh ref={radiatorIronRef} name="radiator-iron" args={[radiatorGeometries.iron as BufferGeometry, materials.byKey.iron, radiators.length]} />
    </>
  );
}
