import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { DESK_LIGHT_COLOUR } from './lighting.ts';
import { Object3D, type SpotLight } from 'three';

/** The fitting keeps its aim action when the catalogue model replaces its housing. */
export function BankerLight({towardWall}:{towardWall:boolean}) {
 const light=useRef<SpotLight>(null),invalidate=useThree(s=>s.invalidate);
 const target=useMemo(()=>new Object3D(),[]);
 useEffect(()=>{
  target.position.set(...(towardWall ? [-4.1,1.7,4.3] : [-1.16,.832,4.14]) as [number,number,number]);
  target.updateMatrixWorld();if(light.current)light.current.target=target;invalidate();
 },[target,towardWall,invalidate]);
 useEffect(()=>{const owned=light.current;return ()=>owned?.dispose();},[]);
 return <><primitive object={target} /><spotLight ref={light} position={[-.65,1.17,4.45]} color={DESK_LIGHT_COLOUR} intensity={5.5} distance={4} angle={.8} penumbra={.55} decay={2} /></>;
}
