import { useEffect, useMemo } from 'react';
import { RingGeometry } from 'three';
import { useScene } from './context.ts';
import { boxAt, cylinderAt, merge, roundedBoxAt } from './geometry.ts';
import { LAYOUT } from './palette.ts';

/**
 * Optional, authored world-space finish. Mount at the scene root, after the walkable room and
 * its objects; pass the ink-pad toggle so the rubbed patch stays on the moving lid.
 * Five meshes/materials, no sheet instances, lights, randomness or frame subscriptions.
 */
export function Wear({ inkPadOpen = false }: { inkPadOpen?: boolean } = {}) {
  const { materials } = useScene();
  const geometry = useMemo(() => {
    // RoomObjects lid: hinge at (-1.8, .872, 3.95), 100 mm deep, opening about local x.
    const lid = roundedBoxAt(0.018, 0.0005, 0.025, 0.0002, 0, 0.00375, -0.083, 2);
    lid.rotateX(inkPadOpen ? 1.7 : 0);
    lid.translate(-1.8, 0.872, 3.95);

    // A small stationary repair sleeve at one spring's lower seat, clear of the carriage.
    // The authored press faces arrival: its existing desk-local yaw is retained after a pi turn.
    const yaw = Math.PI + LAYOUT.press.yaw;
    const sleeve = cylinderAt(0.0145, 0.0145, 0.006,
      -1 + 0.21 * Math.cos(yaw), 0.8398, 4 - 0.21 * Math.sin(yaw), 20);

    // A 2 mm coffee trace, safely to the right of the form/platen footprint, on the desk only.
    const coffee = new RingGeometry(0.042, 0.044, 64, 1, 0.2, 5.8);
    coffee.rotateX(-Math.PI / 2);
    coffee.translate(-0.32, 0.8203, 4.27);

    // Flush repair on the west wall beside the records station, never a floor obstacle.
    const concrete = boxAt(0.003, 0.18, 0.28, -4.198, 0.42, 5.9);

    // Three bound paper blocks on the routing tray; existing edge texture carries the sheets.
    const paper = merge([
      boxAt(0.24, 0.01, 0.18, -2.7, 0.965, 5.8),
      boxAt(0.24, 0.01, 0.18, -2.688, 0.979, 5.8),
      boxAt(0.24, 0.01, 0.18, -2.676, 0.993, 5.8),
    ]);
    // The shared tower texture repeats 36 times in v; restrict each bundle to a short run.
    const uv = paper.getAttribute('uv');
    for (let i = 0; i < uv.count; i += 1) uv.setY(i, uv.getY(i) / 36);

    return { lid, sleeve, coffee, concrete, paper };
  }, [inkPadOpen]);

  useEffect(() => () => {
    for (const part of Object.values(geometry)) part.dispose();
  }, [geometry]);

  return (
    <group dispose={null}>
      <mesh geometry={geometry.lid} material={materials.tinWorn} receiveShadow />
      <mesh geometry={geometry.sleeve} material={materials.brassWorn} receiveShadow />
      <mesh geometry={geometry.coffee} material={materials.wood} receiveShadow />
      <mesh geometry={geometry.concrete} material={materials.concreteFrame} receiveShadow />
      <mesh geometry={geometry.paper} material={materials.paperStack} receiveShadow />
    </group>
  );
}
