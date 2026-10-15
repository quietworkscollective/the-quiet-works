import type { Pose } from '../../firstPerson/controller.ts';

export interface StagePoint { readonly x: number; readonly z: number }
export interface ExchangeStation extends StagePoint {
  readonly id: 'threshold' | 'desk' | 'ladder' | 'window-seat';
  readonly title: string;
  readonly eyeHeight: number;
  readonly yawDeg: number;
  readonly pitchDeg: number;
  /** Local visible half arc, smaller when the station looks close to an open edge. */
  readonly visibleHalfArcDeg?: number;
}

export const EXCHANGE_STAGE = {
  width: 4.2,
  depth: 9,
  height: 12.6,
  forwardAxis: [0, -1] as const,
  visibleHalfArcDeg: 75,
  turnEaseDeg: 20,
  walkable: [
    [-1.78, 0.72], [1.78, 0.72], [1.78, -8.35], [-1.78, -8.35],
  ] as const,
  stations: [
    { id: 'threshold', title: 'Threshold', x: 0, z: -0.65, eyeHeight: 1.62, yawDeg: 0, pitchDeg: 2 },
    { id: 'desk', title: 'Desk', x: -0.32, z: -0.10, eyeHeight: 1.62, yawDeg: 0, pitchDeg: -19, visibleHalfArcDeg: 55 },
    { id: 'ladder', title: 'Ladder', x: 0.35, z: -7.15, eyeHeight: 4.65, yawDeg: 0, pitchDeg: 50 },
    { id: 'window-seat', title: 'Window seat', x: 0.95, z: -6.38, eyeHeight: 5.05, yawDeg: 0, pitchDeg: 5, visibleHalfArcDeg: 58 },
  ] as const satisfies readonly ExchangeStation[],
} as const;

export const EXCHANGE_FOV = { landscape: 70, portrait: 78 } as const;

export function horizontalFov(verticalFovDeg: number, aspect: number): number {
  return (2 * Math.atan(Math.tan((verticalFovDeg * Math.PI) / 360) * aspect) * 180) / Math.PI;
}

export function stageYawLimit(horizontalFovDeg: number, visibleHalfArcDeg: number = EXCHANGE_STAGE.visibleHalfArcDeg): number {
  return Math.max(0, Math.min(visibleHalfArcDeg, 90) - Math.max(0, horizontalFovDeg) / 2);
}

export function stationYawLimit(station: ExchangeStation, horizontalFovDeg: number): number {
  return stageYawLimit(horizontalFovDeg, station.visibleHalfArcDeg ?? EXCHANGE_STAGE.visibleHalfArcDeg);
}

export function turnScaleAtLimit(yawDeg: number, yawLimitDeg: number, easeDeg = EXCHANGE_STAGE.turnEaseDeg): number {
  const remaining = Math.max(0, yawLimitDeg - Math.abs(yawDeg));
  if (easeDeg <= 0 || remaining >= easeDeg) return 1;
  const t = remaining / easeDeg;
  return t * t * (3 - 2 * t);
}

export function applyStageYaw(yawDeg: number, deltaDeg: number, yawLimitDeg: number): number {
  const turningOutward = yawDeg === 0 || Math.sign(deltaDeg) === Math.sign(yawDeg);
  const scale = turningOutward ? turnScaleAtLimit(yawDeg, yawLimitDeg) : 1;
  return Math.max(-yawLimitDeg, Math.min(yawLimitDeg, yawDeg + deltaDeg * scale));
}

export function containsStagePoint(polygon: readonly (readonly [number, number])[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]; const b = polygon[j];
    if (!a || !b) continue;
    const intersects = (a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Horizontal FOV is recomputed on resize; the camera's current pose is kept inside the derived arc. */
export function limitStagePose(pose: Pose, horizontalFovDeg: number): Pose {
  const limit = stageYawLimit(horizontalFovDeg);
  return { ...pose, yawDeg: Math.max(-limit, Math.min(limit, pose.yawDeg)) };
}
