import { describe, expect, it } from 'vitest';
import { CORRIDOR, LOBBY, WALK_LIMITS } from '../layout.ts';
import { END_Z, inView, STAGE, walkableGrid } from './stage.ts';

describe('the corridor stage', () => {
  it('ends after the last complete bay in its visible forward arc', () => {
    expect(STAGE.bays).toBe(13);
    expect(END_Z).toBe(CORRIDOR.innerDoorZ - 13 * CORRIDOR.bay);
    expect(inView({ x: 0, z: 0 }, { x: 0, z: -10 })).toBe(true);
    expect(inView({ x: 0, z: 0 }, { x: 10, z: 0 })).toBe(true);
    expect(inView({ x: 0, z: 0 }, { x: 0, z: 10 })).toBe(false);
  });

  it('audits camera positions on a 0.5 m grid across the walkable lobby and corridor', () => {
    const points = walkableGrid();
    const ticks = (a: number, b: number): number => Math.ceil((b - a) / 0.5) + 1;
    const lobbyX = LOBBY.width / 2 - CORRIDOR.wallMargin;
    const hallX = CORRIDOR.width / 2 - CORRIDOR.wallMargin;
    const lobbyNear = CORRIDOR.innerDoorZ + CORRIDOR.wallMargin;
    const hallNear = CORRIDOR.innerDoorZ + 2 * CORRIDOR.wallMargin;
    expect(points).toHaveLength(
      ticks(-lobbyX, lobbyX) * ticks(lobbyNear, WALK_LIMITS.maxZ) + ticks(-hallX, hallX) * ticks(WALK_LIMITS.minZ, hallNear),
    );
    expect(points.length).toBeGreaterThan(300);
    expect(points.some((point) => point.z < CORRIDOR.innerDoorZ - 10)).toBe(true);
    expect(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.z))).toBe(true);
  });
});
