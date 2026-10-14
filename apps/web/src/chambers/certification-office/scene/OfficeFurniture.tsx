import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, InstancedMesh } from 'three';
import { OFFICE_ASSET_SLOTS } from './assetSlots.ts';
import { furnitureBatches, type FurnitureBatch } from './furnitureGeometry.ts';
import { stageModelId } from './catalogue/index.ts';
import type { OfficeResources } from './assets.ts';

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

/** Catalogue dressing keeps its authored occlusion and live lighting. It contributes bake occlusion
 * without downloading a second copy of every repeated shelf/book mesh. Fittings stay independent. */
export function OfficeFurniture({resources}:{resources:OfficeResources}) {
 const batches=useMemo(()=>furnitureBatches(OFFICE_ASSET_SLOTS.filter(slot => !slot.catalogueId?.startsWith('office-hero-') || slot.id.startsWith('archive-bay-') || slot.id.startsWith('stage-bookcase-')),resources.models,stageModelId),[resources]);
 return <group name="office-catalogue-furniture" dispose={null} userData={{bake:'dynamic'}}>{batches.map(batch=><Batch key={batch.key} batch={batch} />)}</group>;
}
