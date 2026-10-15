export const VISIBLE_HALF_ARC_DEG = 90;
export const TURN_EASE_DEG = 20;
export const PITCH_LIMIT_DEG = 18;
export const DESKTOP_VERTICAL_FOV_DEG = 48;
export const PORTRAIT_VERTICAL_FOV_DEG = 75;

export interface StageLimits {
  verticalFovDeg: number;
  horizontalFovDeg: number;
  yawLimitDeg: number;
  pitchLimitDeg: number;
}

export type ApartmentStationId = 'threshold' | 'table' | 'kitchen' | 'window' | 'sofa';

export interface StageStation {
  id: ApartmentStationId;
  label: string;
  x: number;
  z: number;
  headingDeg: number;
  pitchDeg: number;
}

export interface StagePosition { x: number; z: number }

export const DEFAULT_STATION = {
  id: 'threshold', label: 'Entrance view', x: 0, z: 0.82, headingDeg: 164, pitchDeg: -8,
} as const satisfies StageStation;

/** The controller branch has no shared Stage parameter yet; this adapter owns the room bounds. */
export interface StageAdapter {
  limits(width: number, height: number): StageLimits;
  turn(yawDeg: number, deltaDeg: number, width: number, height: number): number;
  clampTurn(yawDeg: number, width: number, height: number): number;
  clampPitch(pitchDeg: number): number;
  walk(position: StagePosition, headingDeg: number, direction: -1 | 1): StagePosition;
}

export const STATIONS: readonly StageStation[] = [
  DEFAULT_STATION,
  { id: 'table', label: 'Table', x: -0.25, z: 0.72, headingDeg: 180, pitchDeg: -18 },
  { id: 'kitchen', label: 'Kitchen', x: -1.78, z: 1.22, headingDeg: 164, pitchDeg: -4 },
  { id: 'window', label: 'Window and floor seam', x: -1.25, z: 1.25, headingDeg: 198, pitchDeg: -5 },
  { id: 'sofa', label: 'Sofa', x: 0.9, z: 1.72, headingDeg: 225, pitchDeg: -8 },
];

export const APARTMENT_STAGE = {
  width: 6.2,
  depth: 5.4,
  height: 2.65,
  forwardAxis: [0, 1] as const,
  visibleHalfArcDeg: VISIBLE_HALF_ARC_DEG,
  turnEaseDeg: TURN_EASE_DEG,
  walkable: [
    [-2.72, 0.48], [2.72, 0.48], [2.72, 4.92], [-2.72, 4.92],
  ] as const,
  stations: STATIONS,
} as const;

const OBSTACLES = [
  { minX: -1.43, maxX: 0.12, minZ: 2.30, maxZ: 3.13 },
  { minX: -2.94, maxX: -2.20, minZ: 1.45, maxZ: 4.82 },
  { minX: 1.98, maxX: 2.92, minZ: 2.10, maxZ: 4.55 },
  { minX: 0.08, maxX: 1.52, minZ: 3.36, maxZ: 4.84 },
] as const;

function smoothstep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

export function limitsForViewport(width: number, height: number): StageLimits {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const aspect = safeWidth / safeHeight;
  const verticalFovDeg = aspect < 1 ? PORTRAIT_VERTICAL_FOV_DEG : DESKTOP_VERTICAL_FOV_DEG;
  const halfVertical = (verticalFovDeg * Math.PI) / 360;
  const horizontalFovDeg = (2 * Math.atan(Math.tan(halfVertical) * aspect) * 180) / Math.PI;
  const yawLimitDeg = Math.max(0, VISIBLE_HALF_ARC_DEG - horizontalFovDeg / 2);
  return { verticalFovDeg, horizontalFovDeg, yawLimitDeg, pitchLimitDeg: PITCH_LIMIT_DEG };
}

export function turnGain(yawDeg: number, yawLimitDeg: number): number {
  const remaining = Math.max(0, yawLimitDeg - Math.abs(yawDeg));
  if (remaining >= TURN_EASE_DEG) return 1;
  return smoothstep(remaining / TURN_EASE_DEG);
}

export function clampYaw(yawDeg: number, yawLimitDeg: number): number {
  return Math.max(-yawLimitDeg, Math.min(yawLimitDeg, yawDeg));
}

export function clampPitch(pitchDeg: number): number {
  return Math.max(-PITCH_LIMIT_DEG, Math.min(PITCH_LIMIT_DEG, pitchDeg));
}

function inPolygon(x: number, z: number, polygon: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, zi] = polygon[i] ?? [0, 0];
    const [xj, zj] = polygon[j] ?? [0, 0];
    const crosses = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function withinWalkableStage(x: number, z: number): boolean {
  if (!inPolygon(x, z, APARTMENT_STAGE.walkable)) return false;
  return !OBSTACLES.some((obstacle) => x > obstacle.minX && x < obstacle.maxX && z > obstacle.minZ && z < obstacle.maxZ);
}

export function applyTurn(yawDeg: number, inputDeltaDeg: number, yawLimitDeg: number): number {
  const outward = yawDeg === 0 || Math.sign(inputDeltaDeg) === Math.sign(yawDeg);
  const gain = outward ? turnGain(yawDeg, yawLimitDeg) : 1;
  return clampYaw(yawDeg + inputDeltaDeg * gain, yawLimitDeg);
}

export const stageAdapter: StageAdapter = {
  limits: limitsForViewport,
  turn(yawDeg, deltaDeg, width, height) {
    return applyTurn(yawDeg, deltaDeg, limitsForViewport(width, height).yawLimitDeg);
  },
  clampTurn(yawDeg, width, height) {
    return clampYaw(yawDeg, limitsForViewport(width, height).yawLimitDeg);
  },
  clampPitch,
  walk(position, headingDeg, direction) {
    const radians = (headingDeg * Math.PI) / 180;
    const step = direction * 0.22;
    const next = { x: position.x - Math.sin(radians) * step, z: position.z - Math.cos(radians) * step };
    return withinWalkableStage(next.x, next.z) ? next : position;
  },
};
