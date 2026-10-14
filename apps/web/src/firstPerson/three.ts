import { Raycaster, Vector2, type Camera, type PerspectiveCamera } from 'three';
import type { Vec2 } from './bounds.ts';
import type { Pose } from './controller.ts';

/**
 * three.js glue for the controller: applying a pose to a camera, the lens, drag scale and
 * picking the floor. Kept apart from the controller so that stays free of three.
 */

const DEG = Math.PI / 180;

/** Puts `camera` at the pose, `eyeHeight` above the floor, with no roll (yaw about y, then pitch). */
export function applyPose(camera: Camera, pose: Readonly<Pose>, eyeHeight: number): void {
  camera.position.set(pose.x, eyeHeight, pose.z);
  camera.rotation.order = 'YXZ';
  // Pose yaw grows clockwise seen from above; three's y rotation grows counter-clockwise.
  camera.rotation.set(pose.pitchDeg * DEG, -pose.yawDeg * DEG, 0);
  camera.updateMatrixWorld(true);
}

/** Vertical field of view: wider on a portrait screen, where the picture is narrow. */
export function lensFor(width: number, height: number, fov: { landscape: number; portrait: number }): number {
  return height > width ? fov.portrait : fov.landscape;
}

/**
 * Degrees of view per CSS pixel of drag, so the world follows the pointer: the picture's
 * width and height span their field of view.
 */
export function lookScale(width: number, height: number, verticalFovDeg: number): { yaw: number; pitch: number } {
  if (width <= 0 || height <= 0) return { yaw: 0.05, pitch: 0.05 };
  const horizontal = (2 * Math.atan(Math.tan((verticalFovDeg * DEG) / 2) * (width / height))) / DEG;
  return { yaw: horizontal / width, pitch: verticalFovDeg / height };
}

const raycaster = new Raycaster();
const ndc = new Vector2();

/**
 * Where the pointer's ray meets the floor (y = 0), or null when it points at or above the
 * horizon. `x` and `y` are CSS pixels from the top-left of the view.
 */
export function floorPoint(
  camera: PerspectiveCamera,
  x: number,
  y: number,
  width: number,
  height: number,
): Vec2 | null {
  if (width <= 0 || height <= 0) return null;
  ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
  camera.updateMatrixWorld(true);
  raycaster.setFromCamera(ndc, camera);
  const { origin, direction } = raycaster.ray;
  if (direction.y >= -1e-6) return null;
  const t = -origin.y / direction.y;
  return { x: origin.x + direction.x * t, z: origin.z + direction.z * t };
}

/** Wraps a yaw in degrees to (-180, 180], for display. */
export function wrapYaw(yawDeg: number): number {
  const w = ((((yawDeg + 180) % 360) + 360) % 360) - 180;
  return w === -180 ? 180 : w;
}
