import { CORRIDOR, LOBBY, WALK_LIMITS } from '../layout.ts';

/** The corridor stage faces forward (-z); its built set stops after the visitor's walkable route. */
export const STAGE = {
  visibleHalfArcDeg: 90,
  marginDeg: 10,
  bays: 13,
  /** The off-axis amber window closes the corridor's far wall beside the open door. */
  window: { x: -1.0, width: 0.9, bottom: 0.78, height: 1.48, frame: 0.055, kelvin: 2900 },
} as const;

/** Far wall at the last complete bay. */
export const END_Z = CORRIDOR.innerDoorZ - CORRIDOR.bay * STAGE.bays;

/** Rear edge of the lobby set. The space behind the visitor is out of the stage. */
export const REAR_Z = LOBBY.startZ;

export interface Point {
  readonly x: number;
  readonly z: number;
}

/** Whether a point is inside a forward-facing horizontal stage arc, plus its build margin. */
export function inView(from: Point, to: Point, halfArcDeg = STAGE.visibleHalfArcDeg + STAGE.marginDeg): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-9) return true;
  const angle = (Math.acos(Math.max(-1, Math.min(1, -dz / length))) * 180) / Math.PI;
  return angle <= halfArcDeg;
}

/** Camera positions over the lobby and hallway floor at the stage's 0.5 m audit spacing. */
export function walkableGrid(step = 0.5): Point[] {
  const lobbyHalf = LOBBY.width / 2 - CORRIDOR.wallMargin;
  const hallHalf = CORRIDOR.width / 2 - CORRIDOR.wallMargin;
  const lobbyNear = CORRIDOR.innerDoorZ + CORRIDOR.wallMargin;
  const hallNear = CORRIDOR.innerDoorZ + 2 * CORRIDOR.wallMargin;
  const out: Point[] = [];
  const ticks = (a: number, b: number): number[] => {
    const values: number[] = [];
    for (let v = a; v < b - 1e-9; v += step) values.push(v);
    values.push(b);
    return values;
  };
  const sweep = (halfWidth: number, z0: number, z1: number): void => {
    for (const z of ticks(z0, z1)) for (const x of ticks(-halfWidth, halfWidth)) out.push({ x, z });
  };
  sweep(lobbyHalf, lobbyNear, WALK_LIMITS.maxZ);
  sweep(hallHalf, WALK_LIMITS.minZ, hallNear);
  return out;
}

/** True if some walkable camera position can see the point inside the stage arc. */
export function seenFromAnywhere(to: Point, grid: readonly Point[] = walkableGrid()): boolean {
  return grid.some((from) => inView(from, to));
}
