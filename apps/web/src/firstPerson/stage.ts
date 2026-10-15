import { clamp, smoothstep01 } from './easing.ts';
import type { Polygon } from './polygon.ts';

/**
 * A room's stage (ADR 0007: rooms show at most 180 degrees; the hidden part is never built, lit or
 * seen). The contract is chamber-agnostic, and room adapters use it to keep the room build and view
 * inside the same authored arc.
 *
 * A stage is a forward axis, a half-arc the visitor may see (at most 90 degrees either side of it,
 * so at most 180 in all), a soft edge over which turning eases to nothing, and the floor they may
 * stand on. Yaw is limited so the *picture's* edge, not the view direction, stays inside the half-arc:
 *
 *   yawLimit = visibleHalfArc - horizontalFov / 2
 *
 * which is derived afresh whenever the viewport changes (about 54.5 degrees on a 16:10 desktop
 * screen, 51.6 on 16:9, 75.6 on a portrait phone).
 */
export interface Stage {
  /** Yaw of the forward axis in degrees (0 looks toward -z, +90 toward +x). */
  forwardYawDeg: number;
  /** Half of what may be seen, in degrees, at most 90. */
  visibleHalfArcDeg: number;
  /** Turning toward a limit eases to nothing over the last this many degrees. Default `DEFAULT_SOFT_EDGE_DEG`. */
  softEdgeDeg?: number;
  /** The floor the visitor may stand on: a simple polygon on the (x, z) plane, in metres. */
  walkable: Polygon;
}

export const MAX_VISIBLE_HALF_ARC_DEG = 90;
export const DEFAULT_SOFT_EDGE_DEG = 20;

const RAD = Math.PI / 180;

/** The horizontal field of view, in degrees, of a lens with this vertical field of view and aspect. */
export function horizontalFovDeg(verticalFovDeg: number, aspect: number): number {
  return (2 * Math.atan(Math.tan((verticalFovDeg * RAD) / 2) * aspect)) / RAD;
}

/** How far either side of the forward axis the view direction may turn on a screen of this horizontal field of view. */
export function yawLimitDeg(stage: Pick<Stage, 'visibleHalfArcDeg'>, horizontalFov: number): number {
  const half = Math.min(MAX_VISIBLE_HALF_ARC_DEG, Math.max(0, stage.visibleHalfArcDeg));
  return Math.max(0, half - horizontalFov / 2);
}

/** Wraps an angle in degrees to (-180, 180]. */
export const wrapDeg = (deg: number): number => {
  const w = ((((deg + 180) % 360) + 360) % 360) - 180;
  return w === -180 ? 180 : w;
};

/** The yaw relative to the stage's forward axis, in (-180, 180]. */
export const yawRelative = (stage: Pick<Stage, 'forwardYawDeg'>, yawDeg: number): number => wrapDeg(yawDeg - stage.forwardYawDeg);

/**
 * How much of a turn of `direction` (+1 toward the right, -1 toward the left) is allowed from a view
 * at `relativeYawDeg`, as a fraction: 1 when turning away from the nearer limit or more than
 * `softEdgeDeg` from it, falling smoothly (smoothstep) to 0 at the limit, and 0 beyond it. No snap,
 * and nothing bounces back.
 */
export function edgeScale(relativeYawDeg: number, direction: number, limitDeg: number, softEdgeDeg: number): number {
  if (direction === 0) return 1;
  const toward = Math.sign(direction) === Math.sign(relativeYawDeg) || relativeYawDeg === 0;
  if (!toward) return 1;
  const room = limitDeg - Math.abs(relativeYawDeg);
  if (room <= 0) return 0;
  if (softEdgeDeg <= 0) return 1;
  return smoothstep01(clamp(room / softEdgeDeg, 0, 1));
}
