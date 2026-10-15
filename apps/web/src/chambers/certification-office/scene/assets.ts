import { useEffect, useRef, useState } from 'react';
import type { MeshStandardMaterial, Object3D } from 'three';
import { loadModel, surface, type ModelHandle, type SurfaceHandle } from '../../../assets/index.ts';
import { OFFICE_ASSET_SLOTS } from './assetSlots.ts';
import { stageModelId } from './catalogue/index.ts';

export const OFFICE_SURFACES = ['concrete','linoleum','enamel-steel','brass'] as const;
export const OFFICE_MODEL_IDS = [...new Set(OFFICE_ASSET_SLOTS.flatMap(slot=>slot.catalogueId ? [stageModelId(slot.catalogueId)] : []))];
export interface OfficeResources {
 readonly models: ReadonlyMap<string,Object3D>;
 readonly surfaces: ReadonlyMap<string,MeshStandardMaterial>;
}

/** The canvas mounts only after every model and scan is decoded; native ready then uploads them. */
export function useOfficeAssets(onFailure: () => void): OfficeResources | null {
 const [resources,setResources]=useState<OfficeResources|null>(null);
 const failure=useRef(onFailure);
 useEffect(()=>{failure.current=onFailure;},[onFailure]);
 useEffect(()=>{
  let cancelled=false;
  const handles: ModelHandle[]=[],scans: SurfaceHandle[]=[];
  const models=new Map<string,Object3D>(),surfaces=new Map<string,MeshStandardMaterial>();
  const modelLoads=OFFICE_MODEL_IDS.map(async id=>{
   const handle=await loadModel(id);
   if(cancelled){handle.release();return;}
   handles.push(handle);models.set(id,handle.object);
  });
  const scanLoads=OFFICE_SURFACES.map(async id=>{
   const handle=surface(id,{repeat:id==='concrete'? .5 : id==='linoleum'?.5:1,colour:id==='linoleum'?'#5e5545':'#ffffff'});
   scans.push(handle);await handle.ready;surfaces.set(id,handle.material);
  });
  Promise.all([...modelLoads,...scanLoads]).then(()=>{
   if(!cancelled)setResources({models,surfaces});
  },()=>{if(!cancelled)failure.current();});
  return ()=>{cancelled=true;handles.forEach(handle=>handle.release());scans.forEach(handle=>handle.release());};
 },[]);
 return resources;
}
