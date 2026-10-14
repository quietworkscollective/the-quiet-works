import { Group, Mesh, type Material, type Object3D } from 'three';
import { merge } from './geometry.ts';

/** Batch passive fitting faces; invisible interactive proxies retain their original raycasts. */
export function batchFittings(root: Object3D): () => void {
 root.updateWorldMatrix(true,true);
 const byMaterial=new Map<string,{material:Material;meshes:Mesh[];fittings:string[]}>();
 root.traverse(object=>{
  const mesh=object as Mesh;if(!mesh.isMesh||!mesh.visible||Array.isArray(mesh.material))return;
  for (let ancestor:Object3D|null=mesh;ancestor;ancestor=ancestor.parent) if(ancestor.userData['bake']==='dynamic')return;
  if(mesh.material.opacity===0 || (mesh.material as Material & {wireframe?:boolean}).wireframe)return;
  const fittings:string[]=[];
  for(let parent:Object3D|null=mesh;parent && parent!==root;parent=parent.parent) {
   if(typeof parent.userData['officeObjectId']==='string')fittings.push(parent.userData['officeObjectId']);
   const ids=parent.userData['officeObjectIds'];if(Array.isArray(ids))fittings.push(...ids.filter((id):id is string=>typeof id==='string'));
  }
  const key=mesh.material.uuid+'/'+fittings.sort().join(',');
  const batch=byMaterial.get(key) ?? {material:mesh.material,meshes:[],fittings};
  batch.meshes.push(mesh);byMaterial.set(key,batch);
 });
 const group=new Group();group.name='office-batched-fittings';
 const owned:Mesh[]=[];
 for(const {material,meshes,fittings} of byMaterial.values()) {
  if(meshes.length<2)continue;
  const geometry=merge(meshes.map(mesh=>mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)));
  const batch=new Mesh(geometry,material);batch.userData={officeObjectIds:fittings};
  // The carrier retains the interaction identity when the bake replaces its mesh child.
  const carrier=new Group();carrier.userData={officeObjectIds:fittings};carrier.add(batch);
  group.add(carrier);owned.push(batch);meshes.forEach(mesh=>{mesh.visible=false;});
 }
 root.add(group);
 return ()=>{
  group.removeFromParent();owned.forEach(mesh=>mesh.geometry.dispose());
  byMaterial.forEach(({meshes})=>meshes.forEach(mesh=>{mesh.visible=true;}));
 };
}
