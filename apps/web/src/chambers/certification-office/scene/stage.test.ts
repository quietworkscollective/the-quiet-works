import { expect, it } from 'vitest';
import { horizontalFov, officeYawLimit, OFFICE_STAGE, stageLook, stagePose } from './stage.ts';

it('derives the visible limit from the lens on desktop and portrait, keeping the door wall behind the stage', () => {
 for (const [vertical,aspect] of [[48,1.6],[58,412/839],[48,3]]) {
  const fov=horizontalFov(vertical!,aspect!),limit=officeYawLimit(fov);
  expect(limit+fov/2).toBeCloseTo(90,10);
  for(const yawDeg of [-360,0,90,180,270,720]) {
   const pose=stagePose({x:0,z:.8,yawDeg,pitchDeg:0},fov);
   expect(Math.abs(pose.yawDeg-180)).toBeLessThanOrEqual(limit+1e-10);
  }
 }
 expect(OFFICE_STAGE.walkablePolygon).toHaveLength(4);
});
it('eases outward turning over the last twenty degrees without overshoot, while inward input remains free', () => {
 const fov=horizontalFov(48,1.6),limit=officeYawLimit(fov),edge=180+limit;
 expect(stageLook(180,10,fov)).toBe(10);
 expect(stageLook(edge-10,10,fov)).toBeGreaterThan(0);
 expect(stageLook(edge-10,10,fov)).toBeLessThan(10);
 expect(stageLook(edge,10,fov)).toBe(0);
 expect(stageLook(edge,-10,fov)).toBe(-10);
 let yaw=180;
 for(let i=0;i<1000;i++){const next=yaw+stageLook(yaw,3.75,fov);expect(next).toBeGreaterThanOrEqual(yaw);expect(next).toBeLessThanOrEqual(edge+1e-10);yaw=next;}
 expect(yaw).toBeCloseTo(edge,3);
});

it('applies the stage to held keys and direct pointer or touch look, including reduced motion', async () => {
 const {createNavigation}=await import('./navigation.ts');
 const nav=createNavigation();nav.setLens(48,1.6);
 const limit=officeYawLimit(horizontalFov(48,1.6));
 for(const dir of [-1,1] as const) {
  nav.controls.turn('key',dir);
  for(let i=0;i<1000;i++)nav.advance(.05);
  expect(Math.abs(nav.pose.yawDeg-180)).toBeLessThanOrEqual(limit+1e-10);
  nav.controls.turn('key',0);nav.advance(.05);expect(nav.moving).toBe(false);
  nav.setReducedMotion(true);nav.controls.look(dir*10000,0);
  expect(Math.abs(nav.pose.yawDeg-180)).toBeLessThanOrEqual(limit+1e-10);
  nav.setReducedMotion(false);
 }
});
