import type { Pose } from '../../../firstPerson/controller.ts';
import type { Vec2 } from '../../../firstPerson/bounds.ts';

/** Office adapter until the shared controller accepts a Stage. The entrance is behind the inward +z axis. */
export const OFFICE_STAGE = {
  forwardYawDeg: 180,
  visibleHalfArcDeg: 90,
  turnEaseDeg: 20,
  walkablePolygon: [{x:-3.95,z:.25},{x:3.95,z:.25},{x:3.95,z:7.65},{x:-3.95,z:7.65}] satisfies readonly Vec2[],
} as const;
export const horizontalFov = (vertical: number, aspect: number): number =>
  2 * Math.atan(Math.tan(vertical * Math.PI / 360) * aspect) * 180 / Math.PI;
export const officeYawLimit = (fov: number): number => Math.max(0, OFFICE_STAGE.visibleHalfArcDeg - fov / 2);
const offset = (yaw: number) => ((yaw - OFFICE_STAGE.forwardYawDeg + 540) % 360) - 180;
export const stagePose = (pose: Pose, fov: number): Pose => ({...pose,
  yawDeg: Math.abs(pose.yawDeg - OFFICE_STAGE.forwardYawDeg) <= officeYawLimit(fov) ? pose.yawDeg : OFFICE_STAGE.forwardYawDeg + Math.max(-officeYawLimit(fov), Math.min(officeYawLimit(fov), offset(pose.yawDeg))),
});
export function stageLook(yaw: number, delta: number, fov: number): number {
  const limit = officeYawLimit(fov), direction = Math.sign(delta);
  let angle = offset(yaw), remaining = Math.abs(delta);
  while (remaining > 0) {
    const input = Math.min(2, remaining);
    const room = Math.max(0, limit - angle * direction);
    const gain = Math.sin(Math.min(1, room / OFFICE_STAGE.turnEaseDeg) * Math.PI / 2);
    angle += direction * Math.min(room, input * gain);
    remaining -= input;
  }
  return angle - offset(yaw);
}
