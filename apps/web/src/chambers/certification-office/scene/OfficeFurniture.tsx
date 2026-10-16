import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { BoxGeometry, Color, DataTexture, InstancedMesh, LinearFilter, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three';
import { OFFICE_ASSET_SLOTS, OFFICE_SUPPORT_HARDWARE } from './assetSlots.ts';
import { furnitureBatches, type FurnitureBatch } from './furnitureGeometry.ts';
import { stageModelId } from './catalogue/index.ts';
import type { OfficeResources } from './assets.ts';

const CONTACT_SHADOW_ROTATION = [-Math.PI/2,0,0] as const;
const SUPPORT_ROTATION = [0,0,0] as const;
const supportedSlots=OFFICE_ASSET_SLOTS.filter(slot=>slot.support);

function Batch({batch}:{batch:FurnitureBatch}) {
 const mesh=useRef<InstancedMesh>(null);
 useLayoutEffect(()=>{
  const instance=mesh.current;if(!instance)return;
  batch.matrices.forEach((matrix,i)=>{instance.setMatrixAt(i,matrix);instance.setColorAt(i,batch.colours[i] ?? batch.colours[0] ?? new Color());});
  instance.instanceMatrix.needsUpdate=true;if(instance.instanceColor)instance.instanceColor.needsUpdate=true;
  instance.computeBoundingSphere();
  return ()=>instance.dispose();
 },[batch]);
 return <instancedMesh ref={mesh} args={[batch.geometry,batch.material,batch.matrices.length]} dispose={null} userData={{officeObjectIds:batch.fittings}} />;
}

type SupportPiece = {readonly size:readonly [number,number,number];readonly position:readonly [number,number,number]};
function SupportInstances({name,pieces,geometry,material,rotation=SUPPORT_ROTATION,userData={}}:{name:string;pieces:readonly SupportPiece[];geometry:BoxGeometry|PlaneGeometry;material:MeshStandardMaterial|MeshBasicMaterial;rotation?:readonly [number,number,number];userData?:Record<string,unknown>}) {
 const mesh=useRef<InstancedMesh>(null);
 useLayoutEffect(()=>{
  const instance=mesh.current;if(!instance)return;
  const transform=new Object3D();
  pieces.forEach((piece,index)=>{
   transform.position.set(...piece.position);transform.rotation.set(...rotation);transform.scale.set(...piece.size);transform.updateMatrix();
   instance.setMatrixAt(index,transform.matrix);
  });
  instance.instanceMatrix.needsUpdate=true;instance.computeBoundingSphere();
  return ()=>instance.dispose();
 },[pieces,rotation]);
 return <instancedMesh ref={mesh} name={name} args={[geometry,material,pieces.length]} dispose={null} userData={userData} />;
}

/** Catalogue dressing keeps its authored occlusion and live lighting. It contributes bake occlusion
 * without downloading a second copy of every repeated shelf/book mesh. Fittings stay independent. */
export function OfficeFurniture({resources,deferredModels}:{resources:OfficeResources;deferredModels:OfficeResources['models']}) {
 const invalidate=useThree(state=>state.invalidate);
 const models=useMemo(()=>new Map([...resources.models,...deferredModels]),[resources,deferredModels]);
 useLayoutEffect(()=>{invalidate();},[models,invalidate]);
 const batches=useMemo(()=>furnitureBatches(OFFICE_ASSET_SLOTS.filter(slot => !slot.catalogueId?.startsWith('office-hero-') || slot.id.startsWith('archive-bay-') || slot.id.startsWith('stage-bookcase-')),models,stageModelId),[models]);
 const supportVisuals=useMemo(()=>{
  const size=64;
  const pixels=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const dx=(x+.5-size/2)/(size/2),dy=(y+.5-size/2)/(size/2);
   const falloff=Math.max(0,1-Math.sqrt(dx*dx+dy*dy));
   const index=(y*size+x)*4;
   pixels[index]=45;pixels[index+1]=30;pixels[index+2]=19;pixels[index+3]=Math.round(72*falloff*falloff);
  }
  const texture=new DataTexture(pixels,size,size,RGBAFormat,UnsignedByteType);
  texture.colorSpace=SRGBColorSpace;texture.magFilter=LinearFilter;texture.minFilter=LinearFilter;texture.needsUpdate=true;
  return {
   box:new BoxGeometry(),
   plane:new PlaneGeometry(1,1),
   runners:new MeshStandardMaterial({color:'#675d4d',roughness:.68,metalness:.42}),
   clamp:new MeshStandardMaterial({color:'#b39a6a',roughness:.56,metalness:.5}),
   shadowTexture:texture,
   shadow:new MeshBasicMaterial({map:texture,transparent:true,opacity:.58,depthWrite:false,toneMapped:false}),
  };
 },[]);
 useEffect(()=>()=>{
  supportVisuals.box.dispose();supportVisuals.plane.dispose();supportVisuals.runners.dispose();supportVisuals.clamp.dispose();
  supportVisuals.shadow.dispose();supportVisuals.shadowTexture.dispose();
 },[supportVisuals]);
 const shadowPieces=useMemo(()=>supportedSlots.flatMap(slot=>slot.support?[{
  position:[slot.position[0],slot.support.surfaceY+.0015,slot.position[2]] as const,
  size:[slot.support.contactShadow.width,slot.support.contactShadow.depth,1] as const,
 }]:[]),[supportedSlots]);
 return <group name="office-catalogue-furniture" dispose={null} userData={{bake:'dynamic'}}>
  {batches.map(batch=><Batch key={batch.key} batch={batch} />)}
  <group name="office-visible-prop-supports">
   <SupportInstances name="routing-tray-runners" pieces={OFFICE_SUPPORT_HARDWARE.trayRunners} geometry={supportVisuals.box} material={supportVisuals.runners} userData={{bake:'dynamic',officeSupportFor:'routing-tray'}} />
   <SupportInstances name="anglepoise-sill-clamp" pieces={OFFICE_SUPPORT_HARDWARE.lampSillClamp} geometry={supportVisuals.box} material={supportVisuals.clamp} userData={{bake:'dynamic',officeSupportFor:'archive-anglepoise'}} />
   <SupportInstances name="prop-contact-shadows" pieces={shadowPieces} geometry={supportVisuals.plane} material={supportVisuals.shadow} rotation={CONTACT_SHADOW_ROTATION} userData={{bake:'dynamic',officeContactFor:supportedSlots.map(slot=>slot.id)}} />
  </group>
 </group>;
}
