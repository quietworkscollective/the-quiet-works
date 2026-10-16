import { describe, expect, it } from 'vitest';
import { CORRIDOR, LOBBY } from '../../layout.ts';
import { createBuckets } from '../buckets.ts';
import { buildCorridorFloor, buildLobbyFloor, WALL_FLOOR_OVERLAP } from './floor.ts';

describe('terrazzo wall joints', () => {
  it('extends the corridor border beyond both side wall planes', () => {
    const buckets = createBuckets();
    buildCorridorFloor(buckets, { shade: undefined });

    const bounds = buckets.terrazzo.bounds();
    expect(bounds.min[0]).toBeCloseTo(-CORRIDOR.width / 2 - WALL_FLOOR_OVERLAP, 5);
    expect(bounds.max[0]).toBeCloseTo(CORRIDOR.width / 2 + WALL_FLOOR_OVERLAP, 5);
    expect(bounds.min[1]).toBeCloseTo(-0.004, 6);
  });

  it('runs the lobby floor beneath the side walls and the inner partition', () => {
    const buckets = createBuckets();
    const innerDoorZ = 1;
    buildLobbyFloor(buckets, { shade: undefined }, LOBBY.width / 2, innerDoorZ - WALL_FLOOR_OVERLAP, LOBBY.startZ + 0.12);

    const bounds = buckets.terrazzo.bounds();
    expect(bounds.min[0]).toBeCloseTo(-LOBBY.width / 2 - WALL_FLOOR_OVERLAP, 5);
    expect(bounds.max[0]).toBeCloseTo(LOBBY.width / 2 + WALL_FLOOR_OVERLAP, 5);
    expect(bounds.min[2]).toBeCloseTo(innerDoorZ - WALL_FLOOR_OVERLAP, 5);
    expect(bounds.min[1]).toBeCloseTo(-0.004, 6);
  });
});
