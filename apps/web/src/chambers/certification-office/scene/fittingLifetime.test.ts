import { expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { batchFittings } from './batchFittings.ts';

it('retains discovery identity on the carrier after a bake replaces the visual child',()=>{
 const root=new Group(), fitting=new Group(),geometry=new BoxGeometry(),material=new MeshStandardMaterial();
 fitting.userData['officeObjectId']='window';root.add(fitting);
 fitting.add(new Mesh(geometry,material),new Mesh(geometry,material));
 const off=batchFittings(root), batches=root.getObjectByName('office-batched-fittings')!;
 const carrier=batches.children[0]!;
 const replacement=new Mesh(new BoxGeometry(),new MeshStandardMaterial());
 carrier.add(replacement);
 expect(replacement.parent?.userData['officeObjectIds']).toContain('window');
 const replacementGeometry=replacement.geometry,replacementMaterial=replacement.material;
 off();replacementGeometry.dispose();replacementMaterial.dispose();geometry.dispose();material.dispose();
});
