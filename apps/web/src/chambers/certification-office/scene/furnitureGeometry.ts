import { Color, Euler, Matrix4, Quaternion, Vector3, type BufferGeometry, type Material, type Object3D, type Mesh } from 'three';
import type { OfficeAssetSlot } from './assetSlots.ts';

export interface FurnitureBatch {
 readonly key: string;
 readonly geometry: BufferGeometry;
 readonly material: Material;
 readonly matrices: readonly Matrix4[];
 readonly colours: readonly Color[];
 readonly fittings: readonly string[];
}

/** Preserve authored placement and fittings; catalogue geometry contributes no hit handlers. */
export function furnitureBatches(slots: readonly OfficeAssetSlot[], models: ReadonlyMap<string, Object3D>, runtimeId: (id: string) => string): FurnitureBatch[] {
 const batches=new Map<string,{geometry:BufferGeometry;material:Material;matrices:Matrix4[];colours:Color[];fittings:string[]}>();
 for(const slot of slots) {
  if(!slot.catalogueId)continue;
  const model=models.get(runtimeId(slot.catalogueId));if(!model)continue;
  model.updateMatrixWorld(true);
  const rotation=new Quaternion().setFromEuler(new Euler(...(slot.modelRotation ?? slot.rotation)));
  const parent=new Matrix4().compose(new Vector3(...slot.position),rotation,new Vector3(1,1,1));
  parent.multiply(new Matrix4().makeTranslation(...(slot.modelOffset ?? [0,0,0])));
  parent.multiply(new Matrix4().makeScale(...(slot.modelScale ?? [1,1,1])));
  model.traverse(object=>{
   const mesh=object as Mesh;if(!mesh.isMesh||Array.isArray(mesh.material))return;
   const key=mesh.geometry.uuid+mesh.material.uuid;
   let batch=batches.get(key);
   if(!batch){batch={geometry:mesh.geometry,material:mesh.material,matrices:[],colours:[],fittings:[]};batches.set(key,batch);}
   batch.fittings.push(...(slot.fittings ?? []));
   batch.matrices.push(new Matrix4().multiplyMatrices(parent,mesh.matrixWorld));
   batch.colours.push(new Color().setScalar(slot.modelValue ?? 1));
  });
 }
 return [...batches].map(([key,batch])=>({key,...batch}));
}
