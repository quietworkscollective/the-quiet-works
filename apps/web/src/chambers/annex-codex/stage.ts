export const VISIBLE_HALF_ARC_DEG = 90;
export const TURN_EASE_DEG = 20;
export const PITCH_LIMIT_DEG = 18;
export const DESKTOP_VERTICAL_FOV_DEG = 48;
export const PORTRAIT_VERTICAL_FOV_DEG = 86;

export interface StageLimits {
  verticalFovDeg: number;
  horizontalFovDeg: number;
  yawLimitDeg: number;
  pitchLimitDeg: number;
}

export interface StageStation {
  id: 'arrival' | 'bench' | 'west' | 'rear' | 'east';
  label: string;
  x: number;
  z: number;
  /** Authored direction for this view; visitor yaw is still bounded relative to it. */
  headingDeg: number;
  /** Authored sightline; arrival looks down far enough to read the bench on portrait screens. */
  pitchDeg: number;
}

export interface StagePosition { x: number; z: number }

/** Adapter contract for the current first-person controller branch, which has no shared Stage API. */
export interface StageAdapter {
  limits(width: number, height: number): StageLimits;
  stationPosition(station: StageStation, width: number, height: number): StagePosition;
  turn(yawDeg: number, deltaDeg: number, width: number, height: number): number;
  clampTurn(yawDeg: number, width: number, height: number): number;
  clampPitch(pitchDeg: number): number;
  walk(position: StagePosition, headingDeg: number, direction: -1 | 1): StagePosition;
}

export const STATIONS: readonly StageStation[] = [
  { id: 'arrival', label: 'Entrance view', x: 0, z: 0.3, headingDeg: 180, pitchDeg: -13 },
  { id: 'bench', label: 'Tracing bench', x: 0, z: 2.45, headingDeg: 180, pitchDeg: -8 },
  { id: 'west', label: 'West inspection', x: -2.05, z: 3.6, headingDeg: 270, pitchDeg: -5 },
  { id: 'rear', label: 'Forward side inspection', x: 2.05, z: 2.45, headingDeg: 135, pitchDeg: -7 },
  { id: 'east', label: 'East resting view', x: 2.05, z: 3.0, headingDeg: 90, pitchDeg: -5 },
];

export const WALKABLE_POLYGON = [
  [-2.7, 0.25],
  [2.7, 0.25],
  [2.7, 6.95],
  [-2.7, 6.95],
] as const;

const OBSTACLES = [
  { minX: -1.28, maxX: 1.28, minZ: 3.0, maxZ: 4.2 },
  { minX: -1.28, maxX: 1.28, minZ: 4.82, maxZ: 5.55 },
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

/** Remaining turn authority fades to zero across the last `TURN_EASE_DEG`. */
export function turnGain(yawDeg: number, yawLimitDeg: number): number {
  const magnitude = Math.abs(yawDeg);
  if (magnitude >= yawLimitDeg) return 0;
  const start = Math.max(0, yawLimitDeg - TURN_EASE_DEG);
  return 1 - smoothstep((magnitude - start) / Math.max(Number.EPSILON, yawLimitDeg - start));
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
  if (!inPolygon(x, z, WALKABLE_POLYGON)) return false;
  return !OBSTACLES.some((obstacle) => x > obstacle.minX && x < obstacle.maxX && z > obstacle.minZ && z < obstacle.maxZ);
}

export function applyTurn(yawDeg: number, inputDeltaDeg: number, yawLimitDeg: number): number {
  const gain = turnGain(yawDeg, yawLimitDeg);
  return clampYaw(yawDeg + inputDeltaDeg * gain, yawLimitDeg);
}

export const stageAdapter: StageAdapter = {
  limits: limitsForViewport,
  stationPosition(station, width, height) {
    // Move the threshold view back while keeping the full bench centered in portrait framing.
    return station.id === 'arrival' && height > width ? { x: station.x + 0.15, z: 0.3 } : { x: station.x, z: station.z };
  },
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
