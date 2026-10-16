import { useEffect, useMemo } from 'react';
import { AdditiveBlending, CanvasTexture, Object3D, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { boxAt, merge } from './geometry.ts';
import { useThree } from '@react-three/fiber';
import { chooseQuality, rendererName } from '../../../corridor/world/quality.ts';
import { useScene } from './context.ts';

/** Fixed window patches also reach the phone and lite tiers, without a depth shader or idle loop. */
export function Sunlight() {
 const {materials}=useScene();
 const target=useMemo(()=>{const object=new Object3D();object.position.set(-1,.15,3.4);object.updateMatrixWorld();return object;},[]);
 const gl=useThree(s=>s.gl);
 const fallback=chooseQuality(rendererName(gl.getContext()))==='lite' || window.matchMedia('(pointer: coarse)').matches;
 const art=useMemo(()=>{
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Window light needs a canvas');
  ctx.clearRect(0,0,256,256);ctx.fillStyle='#ffe0ac';
  for(let x=0;x<11;x++)for(let y=0;y<3;y++)ctx.fillRect(x*256/11+2,y*256/3+3,256/11-4,256/3-6);
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
  const patch=new MeshBasicMaterial({map:texture,transparent:true,opacity:.055,blending:AdditiveBlending,depthWrite:false,toneMapped:false});
  const glass=new MeshBasicMaterial({color:'#efc58f',toneMapped:false});
  const frame=[boxAt(1.56,.03,.08,-2.25,2.685,7.92),boxAt(1.56,.03,.08,-2.25,3.915,7.92),
    boxAt(.03,1.26,.08,-3.015,3.3,7.92),boxAt(.03,1.26,.08,-1.485,3.3,7.92)];
  for(let i=1;i<11;i++)frame.push(boxAt(.014,1.2,.025,-3+i*1.5/11,3.3,7.9));
  for(let i=1;i<3;i++)frame.push(boxAt(1.5,.02,.025,-2.25,2.7+i*.4,7.9));
  return {texture,patch,glass,frame:merge(frame),plane:new PlaneGeometry(1,1)};
 },[]);
 useEffect(()=>{art.patch.opacity=fallback ? .055 : .028;},[art,fallback]);
 useEffect(()=>()=>{art.texture.dispose();art.patch.dispose();art.glass.dispose();art.frame.dispose();art.plane.dispose();},[art]);
 return <group dispose={null}>
  <primitive object={target} />
  <spotLight position={[-2.25,3.3,7.9]} target={target} color="#ffe4c4" intensity={22} distance={12} angle={.46} penumbra={.38} decay={2} />
  <mesh name="office-high-window" geometry={art.plane} material={art.glass} position={[-2.25,3.3,8.12]} rotation={[0,Math.PI,0]} scale={[1.5,1.2,1]} />
  <mesh geometry={art.frame} material={materials.frame} />
  <mesh name="office-sun-floor" geometry={art.plane} material={art.patch} position={[-1.7,.005,3.9]} rotation={[-Math.PI/2,0,-.24]} scale={[2.1,3.9,1]} />
  <mesh name="office-sun-desk" geometry={art.plane} material={art.patch} position={[-1,.823,4]} rotation={[-Math.PI/2,0,-.24]} scale={[1.4,.9,1]} />
 </group>;
}
