import { expect, it } from 'vitest';
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { applyPose } from '../../../firstPerson/three.ts';
import { ARRIVAL, DESK, EYE_HEIGHT } from './navigation.ts';
import { documentChannelGeometry } from './documentChannel.ts';
function projected(bounds: Box3, camera: PerspectiveCamera) {
 const points=[];
 for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])points.push(new Vector3(x,y,z).project(camera));
 return {minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))};
}
it('overlaps none of the press envelope or primary paper from arrival or desk, on desktop and portrait', () => {
 const geometry=documentChannelGeometry();geometry.computeBoundingBox();
 if(!geometry.boundingBox)throw new Error('channel needs bounds');
 for(const [aspect,fov] of [[1440/900,48],[393/851,58]])for(const pose of [ARRIVAL,DESK]){
  const camera=new PerspectiveCamera(fov,aspect,.05,45);applyPose(camera,pose,EYE_HEIGHT);
  const channel=projected(geometry.boundingBox,camera);
  for(const [centre,size] of [[[-1,.97,4],[.36,.34,.38]],[[-1,.8315,4.048],[.36,.002,.48]]] as const){
   const bounds=new Box3().setFromCenterAndSize(new Vector3(...centre),new Vector3(...size));const object=projected(bounds,camera);
   const area=Math.max(0,Math.min(channel.maxX,object.maxX)-Math.max(channel.minX,object.minX))*Math.max(0,Math.min(channel.maxY,object.maxY)-Math.max(channel.minY,object.minY));
   expect(area).toBe(0);
  }
 }
 expect(geometry.boundingBox.max.y-geometry.boundingBox.min.y).toBeGreaterThanOrEqual(.02);
 expect(geometry.boundingBox.max.y-geometry.boundingBox.min.y).toBeLessThanOrEqual(.035);
 geometry.dispose();
});
