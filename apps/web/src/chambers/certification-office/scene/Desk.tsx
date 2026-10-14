import { useEffect, useMemo } from 'react';
import { CylinderGeometry } from 'three';
import { boxAt, merge, RoundedBoxGeometry, roundedBoxAt } from './geometry.ts';
import type { Materials } from './materials.ts';
import { LAYOUT } from './palette.ts';

const { width, depth, thickness } = LAYOUT.desk;

/** The desk: linoleum top on a steel frame, two pedestals fading into the dark, and two props. */
export function Desk({ materials, showStationery = true }: { materials: Materials; showStationery?: boolean }) {
  const geometry = useMemo(() => {
    const top = new RoundedBoxGeometry(width, thickness, depth, 4, 0.008);
    top.translate(0, -thickness / 2, 0);

    const shells = [];
    const faces = [];
    const pulls = [];
    for (const side of [-1, 1]) {
      const cx = side * 0.8;
      shells.push(boxAt(0.5, 0.69, 1.0, cx, -0.395, 0));
      for (let i = 0; i < 3; i += 1) {
        const y = -0.14 - i * 0.23;
        faces.push(roundedBoxAt(0.46, 0.2, 0.022, 0.004, cx, y, 0.505, 2));
        pulls.push(boxAt(0.15, 0.012, 0.014, cx, y + 0.045, 0.529));
        pulls.push(boxAt(0.012, 0.012, 0.02, cx - 0.069, y + 0.045, 0.518));
        pulls.push(boxAt(0.012, 0.012, 0.02, cx + 0.069, y + 0.045, 0.518));
      }
    }
    // Rails tying the pedestals under the top.
    shells.push(boxAt(1.1, 0.05, 0.04, 0, -0.075, 0.46));
    shells.push(boxAt(1.1, 0.05, 0.04, 0, -0.075, -0.46));

    // Ink pad tin (props sit in desk space; positioned by the group below).
    const tinBase = new RoundedBoxGeometry(0.112, 0.022, 0.078, 2, 0.004);
    tinBase.translate(0, 0.011, 0);
    const felt = new RoundedBoxGeometry(0.1, 0.004, 0.066, 1, 0.001);
    felt.translate(0, 0.0215, 0);
    const lid = new RoundedBoxGeometry(0.112, 0.005, 0.078, 2, 0.0022);
    // Hinged along the back edge: pivot at z = -0.039.
    lid.translate(0, 0.0025, 0.039);

    // Pencil along x, tip toward -x.
    const body = new CylinderGeometry(0.0036, 0.0036, 0.15, 6);
    body.rotateZ(Math.PI / 2);
    const tip = new CylinderGeometry(0.0004, 0.0036, 0.022, 6);
    tip.rotateZ(Math.PI / 2);
    tip.translate(-0.086, 0, 0);
    const pencilBody = merge([body, tip]);
    const ferrule = new CylinderGeometry(0.0038, 0.0038, 0.014, 10);
    ferrule.rotateZ(Math.PI / 2);
    ferrule.translate(0.082, 0, 0);

    return {
      top,
      frame: merge([...shells, ...faces]),
      pulls: merge(pulls),
      tinBase,
      felt,
      lid,
      pencilBody,
      ferrule,
    };
  }, []);

  useEffect(
    () => () => {
      for (const g of Object.values(geometry)) g.dispose();
    },
    [geometry],
  );

  return (
    <group>
      <mesh geometry={geometry.top} material={materials.linoleum} receiveShadow />
      <mesh geometry={geometry.frame} material={materials.steelPanel} />
      <mesh geometry={geometry.pulls} material={materials.platen} />

      {showStationery ? (
        <>
          {/* Ink pad tin, lid ajar, teal felt. */}
          <group position={[-0.6, 0, 0.2]} rotation={[0, 0.32, 0]}>
            <mesh geometry={geometry.tinBase} material={materials.tin} castShadow receiveShadow />
            <mesh geometry={geometry.felt} material={materials.felt} receiveShadow />
            <group position={[0, 0.022, -0.039]} rotation={[-0.46, 0, 0]}>
              <mesh geometry={geometry.lid} material={materials.tin} receiveShadow />
            </group>
          </group>

          {/* One pencil. */}
          <group position={[-0.44, 0.0036, 0.4]} rotation={[0, 0.5, 0]}>
            <mesh geometry={geometry.pencilBody} material={materials.pencil} receiveShadow />
            <mesh geometry={geometry.ferrule} material={materials.brass} />
          </group>
        </>
      ) : null}
    </group>
  );
}
