import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import {
  type BufferGeometry,
  CylinderGeometry,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
  type SpotLight,
} from 'three';
import { createLampBaseGeometry, createShadeGeometry, merge, sphereAt } from './geometry.ts';
import type { Materials } from './materials.ts';
import { LAYOUT, PALETTE, PAPER_TOP } from './palette.ts';

const BASE = new Vector3(LAYOUT.lamp.x, 0, LAYOUT.lamp.z);
/** The spot is aimed at the stamp contact point. */
const CONTACT = new Vector3(LAYOUT.press.x, PAPER_TOP, LAYOUT.press.z);
/** Wrapper-local west wall under the authored (-2.68, .82, 3.96), pi-yaw mounting. */
const WALL = new Vector3(1.52, 0.73, -0.34);
/** Lamp-local (relative to the base): joint, elbow, and the centre of the shade. */
const JOINT = new Vector3(0, 0.066, 0);
const ELBOW = new Vector3(0.13, 0.5, 0.0);
const SHADE = new Vector3(0.4, 0.58, 0.02);

const Y = new Vector3(0, 1, 0);

/** A cylinder between two points, as geometry in lamp-local space (ready to merge). */
function limbGeometry(from: Vector3, to: Vector3, radius: number): BufferGeometry {
  const dir = new Vector3().subVectors(to, from);
  const length = dir.length();
  const g = new CylinderGeometry(radius, radius, length, 12);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(Y, dir.normalize()));
  g.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  return g;
}

/** Weighted iron base, a two-segment arm, a conical enamel shade, and the key light inside it. */
export function Lamp({ materials, towardWall = false, deskTarget }: {
  materials: Materials;
  towardWall?: boolean;
  /** Target in the mounting wrapper's coordinates; omission preserves the legacy desk. */
  deskTarget?: readonly [number, number, number];
}) {
  const spotRef = useRef<SpotLight>(null);
  const invalidate = useThree((s) => s.invalidate);
  const targetX = deskTarget?.[0] ?? CONTACT.x;
  const targetY = deskTarget?.[1] ?? CONTACT.y;
  const targetZ = deskTarget?.[2] ?? CONTACT.z;

  const parts = useMemo(() => {
    const target = new Object3D();
    target.position.copy(towardWall ? WALL : new Vector3(targetX, targetY, targetZ));
    const aim = new Vector3().subVectors(target.position, new Vector3().addVectors(BASE, SHADE)).normalize();
    // Shade local -y is the open end; aim it at the contact point.
    const shadeQuat = new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), aim);
    const apex = new Vector3().copy(SHADE).addScaledVector(aim, -0.045);
    return {
      iron: merge([
        createLampBaseGeometry(),
        limbGeometry(JOINT, ELBOW, 0.0085),
        limbGeometry(ELBOW, apex, 0.0075),
      ]),
      joints: merge([
        sphereAt(0.016, JOINT.x, JOINT.y, JOINT.z),
        sphereAt(0.019, ELBOW.x, ELBOW.y, ELBOW.z),
        sphereAt(0.016, apex.x, apex.y, apex.z),
      ]),
      shade: createShadeGeometry(),
      bulb: new SphereGeometry(0.026, 16, 12),
      shadeQuat,
      target,
    };
  }, [towardWall, targetX, targetY, targetZ]);

  useLayoutEffect(() => {
    // The target is a sibling of the lamp base, so both inherit the mounting wrapper's matrix.
    // Update ancestors too: its translation/yaw may not yet have been visited by the renderer.
    parts.target.updateWorldMatrix(true, false);
    const spot = spotRef.current;
    if (spot) {
      spot.target = parts.target;
      spot.updateWorldMatrix(true, false);
    }
    invalidate();
  }, [parts, invalidate]);

  useEffect(() => {
    const spot = spotRef.current;
    // The scene's root group opts out of fiber's automatic disposal, so release the shadow map here.
    return () => spot?.dispose();
  }, []);

  useEffect(
    () => () => {
      parts.iron.dispose();
      parts.joints.dispose();
      parts.shade.dispose();
      parts.bulb.dispose();
    },
    [parts],
  );

  const shadowSize = materials.coarse ? 512 : 1024;

  return (
    <>
      <primitive object={parts.target} />
      <group position={BASE}>
        <mesh geometry={parts.iron} material={materials.iron} />
        <mesh geometry={parts.joints} material={materials.brass} />

        <group position={SHADE} quaternion={parts.shadeQuat}>
          <mesh geometry={parts.shade} material={materials.enamelDark} />
          <mesh geometry={parts.shade} material={materials.lampInside} scale={0.985} />
          <mesh geometry={parts.bulb} material={materials.bulb} position={[0, -0.06, 0]} />
          <spotLight
            ref={spotRef}
            position={[0, -0.06, 0]}
            color={PALETTE.lampWarm}
            intensity={4.2}
            angle={0.62}
            penumbra={0.75}
            decay={2}
            castShadow
            shadow-mapSize-width={shadowSize}
            shadow-mapSize-height={shadowSize}
            shadow-bias={-0.0004}
            shadow-normalBias={0.012}
            shadow-radius={3.6}
            shadow-camera-near={0.12}
            shadow-camera-far={3}
          />
        </group>
      </group>
    </>
  );
}
