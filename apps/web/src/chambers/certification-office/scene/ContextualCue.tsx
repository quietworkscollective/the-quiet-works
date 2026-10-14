import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Raycaster, Vector3 } from 'three';
import { CONTEXTUAL_CUES as LIMITS } from '@tqw/ui';
import { OFFICE_OBJECTS, type OfficeObjectId } from '@tqw/engine';
import { officeInteractionAnchor } from './assetSlots.ts';
import { fittingOccluded } from './occlusion.ts';
import { createCueSelection } from './cues.ts';
export interface OfficeCue { id: OfficeObjectId; x: number; y: number; focused: boolean; side: 'right' | 'left' | 'above' | 'below' }
export function ContextualCue({ focused, preferred, onCue }: { preferred: OfficeObjectId | null; focused: OfficeObjectId | null; onCue(cue: OfficeCue | null): void }) {
 const { camera, scene, gl, size, invalidate } = useThree();
 const select=useMemo(()=>createCueSelection(),[]), ray=useMemo(()=>new Raycaster(),[]);
 const point=useMemo(()=>new Vector3(),[]), forward=useMemo(()=>new Vector3(),[]);
 const callback=useRef(onCue), timer=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
 const previous=useRef('');
 useEffect(()=>{callback.current=onCue;invalidate();},[onCue,focused,preferred,invalidate]);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 useFrame(()=>{
  if (gl.domElement.closest<HTMLElement>('.tqw-canvas')?.dataset['ready'] !== 'true') return;
  camera.getWorldDirection(forward);scene.updateMatrixWorld(true);
  const samples=OFFICE_OBJECTS.map(object=>{
   const anchor = officeInteractionAnchor(object.id);
   point.set(...anchor).sub(camera.position);const distance=Math.hypot(point.x,point.z);
   const angle=point.angleTo(forward)*180/Math.PI;
   const rayLength=point.length();
   ray.set(camera.position,point.normalize());
   const occluded=!focused && distance <= LIMITS.leaveDistance && angle <= LIMITS.leaveHalfAngle && fittingOccluded(ray,scene,object.id,rayLength);
   return {id:object.id,distance,angle,occluded};
  });
  const now=performance.now(), result=select(samples,now,focused,preferred);
  clearTimeout(timer.current);
  if(result.wakeAt!==null)timer.current=setTimeout(invalidate,Math.max(1,result.wakeAt-now));
  const object=OFFICE_OBJECTS.find(object=>object.id===result.id);
  let cue:OfficeCue|null=null;
  if(object){
   const anchor = officeInteractionAnchor(object.id);
   const dimensions = object.id === 'press' ? [.42,.4,.35] : object.id === 'window' ? [.35,.22,.025] : [.3,.3,.3];
   let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
   for(const dx of [-1,1])for(const dy of [-1,1])for(const dz of [-1,1]){
    point.set(anchor[0]+dx*(dimensions[0]??0)/2,anchor[1]+dy*(dimensions[1]??0)/2,anchor[2]+dz*(dimensions[2]??0)/2).project(camera);
    const x=(point.x+1)*size.width/2,y=(1-point.y)*size.height/2;
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   }
   const side = maxX+240<size.width ? 'right' : minX>240 ? 'left' : minY>145 ? 'above' : 'below';
   const x=side==='right'?maxX:side==='left'?minX:(minX+maxX)/2;
   const y=side==='above'?minY:side==='below'?maxY:(minY+maxY)/2;
   cue={id:object.id,x:Math.round(Math.max(24,Math.min(size.width-24,x))),
    y:Math.round(Math.max(80,Math.min(size.height-100,y))),focused:focused!==null,side};
  }
  const key=JSON.stringify(cue);
  if(key!==previous.current){previous.current=key;callback.current(cue);}
 });
 return null;
}
