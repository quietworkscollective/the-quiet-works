import {expect,it,vi} from 'vitest';
import {BoxGeometry,Mesh,MeshStandardMaterial,PointLight,Scene} from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {meshId} from '../baked/contract.ts';
import {exportSpace} from './export.ts';

it('exports one immutable pose when live geometry and lighting change during hashing',async()=>{
 const scene=new Scene();
 const mesh=new Mesh(new BoxGeometry(),new MeshStandardMaterial());
 const light=new PointLight(0xffffff,1);scene.add(mesh,light);scene.updateMatrixWorld(true);
 const expected=await meshId(mesh,mesh.geometry);
 const parser=vi.spyOn(GLTFExporter.prototype,'parseAsync').mockResolvedValue(new ArrayBuffer(1));
 try{
  const pending=exportSpace(scene,'office');
  mesh.position.x=3;mesh.geometry.getAttribute('position').setX(0,4);
  mesh.material.color.set(0xff0000);light.intensity=7;scene.updateMatrixWorld(true);
  const result=await pending;
  expect(result.manifest.meshes).toEqual([expected]);
  expect(result.manifest.lights[0]!.intensity).toBe(1);
 }finally{parser.mockRestore();mesh.geometry.dispose();mesh.material.dispose();}
});

for(const sign of [1,-1])it('flattens affine '+sign+' poses before Blender can discard shear',async()=>{
 const scene=new Scene(),parent=new Scene();
 parent.scale.set(sign*1.7,2.9,1.9);
 const mesh=new Mesh(new BoxGeometry(),new MeshStandardMaterial());mesh.rotation.y=.22;
 parent.add(mesh);scene.add(parent);scene.updateMatrixWorld(true);
 const expected=mesh.geometry.getAttribute('position').clone();
 const transformed=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).getAttribute('position');
 const parser=vi.spyOn(GLTFExporter.prototype,'parseAsync').mockImplementation(async input=>{
  const copy=(input as Scene).children[0] as Mesh;
  expect(copy.matrix.elements).toEqual([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  for(let i=0;i<expected.count;i++)for(let c=0;c<3;c++)expect(copy.geometry.getAttribute('position').getComponent(i,c)).toBeCloseTo(transformed.getComponent(i,c),5);
  expect(copy.geometry.index!.getX(1)).toBe(mesh.geometry.index!.getX(sign<0?2:1));
  return new ArrayBuffer(1);
 });
 try{await exportSpace(scene,'office');}finally{parser.mockRestore();mesh.geometry.dispose();mesh.material.dispose();}
});
