import { expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Raycaster, Scene, Vector3 } from 'three';
import { fittingOccluded } from './occlusion.ts';
function fixture() {
 const scene=new Scene(),group=new Group(),geometry=new BoxGeometry(.2,.2,.02),material=new MeshBasicMaterial();
 const blocker=new Mesh(geometry,material);blocker.position.z=-1.9;group.add(blocker);scene.add(group);scene.updateMatrixWorld(true);
 const ray=new Raycaster(new Vector3(),new Vector3(0,0,-1));
 return {scene,group,blocker,material,ray,dispose:()=>{geometry.dispose();material.dispose();}};
}
it('counts a different solid even just ten centimetres before the fitting', () => {
 const h=fixture();expect(fittingOccluded(h.ray,h.scene,'target',2)).toBe(true);
 h.group.userData['officeObjectId']='target';expect(fittingOccluded(h.ray,h.scene,'target',2)).toBe(false);h.dispose();
});
it('ignores invisible proxies, hidden dressing and transparent surfaces', () => {
 const h=fixture();h.material.colorWrite=false;expect(fittingOccluded(h.ray,h.scene,'target',2)).toBe(false);
 h.material.colorWrite=true;h.group.visible=false;expect(fittingOccluded(h.ray,h.scene,'target',2)).toBe(false);
 h.group.visible=true;h.material.opacity=.3;expect(fittingOccluded(h.ray,h.scene,'target',2)).toBe(false);h.dispose();
});
