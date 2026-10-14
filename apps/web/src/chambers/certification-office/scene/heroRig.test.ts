import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { isStatic } from '../../../baked/contract.ts';
import { prepareHero } from './heroRig.ts';
import { batchFittings } from './batchFittings.ts';

function source() {
 const root=new Group(),material=new MeshStandardMaterial(),geometry=new BoxGeometry();
 for(const name of ['hatch','bell','rear_link']) {const pivot=new Group();pivot.name=name;pivot.position.set(.1,.2,.3);pivot.add(new Mesh(geometry,material));root.add(pivot);}
 root.add(new Mesh(geometry,material));
 return {root,material,geometry};
}
describe('Blender motion ownership',()=>{
 it('keeps moving descendants out of static baking while preserving authored pivots and source ownership',()=>{
  const fixture=source(), rig=prepareHero(fixture.root,'machine');
  const pivot=rig.object.getObjectByName('hatch')!;
  expect(pivot.position).toEqual(fixture.root.getObjectByName('hatch')!.position);
  expect(isStatic(pivot.children[0] as Mesh)).toBe(false);
  expect(isStatic(rig.object.children.at(-1) as Mesh)).toBe(true);
  const material=(pivot.children[0] as Mesh).material as MeshStandardMaterial;
  expect(material).not.toBe(fixture.material);
  const dispose=vi.spyOn(fixture.material,'dispose');
  pivot.rotation.x=1;expect(fixture.root.getObjectByName('hatch')!.rotation.x).toBe(0);
  rig.dispose();expect(dispose).not.toHaveBeenCalled();fixture.material.dispose();fixture.geometry.dispose();
 });
 it('never folds moving nodes into a frozen fitting batch',()=>{
  const fixture=source(), rig=prepareHero(fixture.root,'machine');
  rig.object.userData['officeObjectId']='machine';
  const off=batchFittings(rig.object),hatch=rig.object.getObjectByName('hatch')!;
  expect(hatch.children[0]!.visible).toBe(true);
  expect(rig.object.getObjectByName('office-batched-fittings')!.children).toHaveLength(0);
  hatch.rotation.x=Math.PI/2;hatch.updateWorldMatrix(true,true);
  expect(hatch.children[0]!.visible).toBe(true);
  off();rig.dispose();fixture.material.dispose();fixture.geometry.dispose();
 });
});
