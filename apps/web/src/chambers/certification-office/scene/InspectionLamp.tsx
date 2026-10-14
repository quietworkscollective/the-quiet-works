import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CylinderGeometry, Object3D, Quaternion, Vector3, type Group, type SpotLight } from 'three';
import { useScene } from './context.ts';

/** An inspection fixture changes its aim, at constant intensity, as the exit becomes understood. */
export function InspectionLamp({ understood }: { understood: boolean }) {
  const { materials, motion } = useScene();
  const invalidate = useThree(s => s.invalidate);
  const spot = useRef<SpotLight>(null);
  const shade = useRef<Group>(null);
  const at = useRef(0);
  const fixture = useMemo(() => new Vector3(3, 3.7, 6.7), []);
  const down = useMemo(() => new Vector3(0, -1, 0), []);
  const initial = useMemo(() => new Vector3(3.35, .45, 5.4), []);
  const understoodAim = useMemo(() => new Vector3(4.12, .01, 6.7), []);
  const start = useMemo(() => new Vector3(), []);
  const aim = useMemo(() => new Vector3(3.35, .45, 5.4), []);
  const target = useMemo(() => new Object3D(), []);
  const geometry = useMemo(() => new CylinderGeometry(.085,.12,.16,16), []);
  const direction = useMemo(() => new Vector3(), []);
  const rotation = useMemo(() => new Quaternion(), []);
  useEffect(() => {
    const light = spot.current;
    if (light) light.target = target;
    return () => light?.dispose();
  }, [target]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => { start.copy(aim); at.current = performance.now(); invalidate(); }, [understood, invalidate, start, aim]);
  useFrame(state => {
    const t = motion.reduced ? 1 : Math.min(1, (performance.now()-at.current)/1200);
    const destination = understood ? understoodAim : initial;
    aim.lerpVectors(start, destination, t * t * (3 - 2 * t));
    target.position.copy(aim); target.updateMatrixWorld();
    direction.copy(aim).sub(fixture).normalize();
    rotation.setFromUnitVectors(down,direction);
    shade.current?.quaternion.copy(rotation);
    if (t < 1) state.invalidate();
  });
  return <>
    <primitive object={target} />
    <group ref={shade} position={[3,3.7,6.7]}>
      <mesh geometry={geometry} material={materials.enamelDark} />
      <spotLight ref={spot} color="#dfc59d" intensity={2.8} distance={5} angle={.52} penumbra={.8} />
    </group>
  </>;
}
