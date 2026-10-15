import type { Pose } from '../../firstPerson/controller.ts';
import { wrapYaw } from '../../firstPerson/three.ts';

/** Whether a reverse gesture can hand the visitor back to the page at the lobby seam. */
export function atHandover(pose: Pose, start: Pose): boolean {
  // An angled backward step may slide sideways when it meets the lobby's back wall.
  // The handover is a plane across the lobby, rather than a point the visitor must find.
  return Math.abs(pose.z - start.z) < 0.08 &&
    Math.abs(wrapYaw(pose.yawDeg - start.yawDeg)) < 1 &&
    Math.abs(pose.pitchDeg - start.pitchDeg) < 0.8;
}
