import { describe, expect, it } from 'vitest';
import { CORRIDOR, WALK_LIMITS } from '../layout.ts';
import { CORRIDOR_END_BAYS, CORRIDOR_END_Z, CORRIDOR_WINDOW } from './extent.ts';

describe('the corridor world extent', () => {
  it('closes its distant wall beyond the walkable route after complete bays', () => {
    expect(CORRIDOR_END_BAYS).toBe(13);
    expect(CORRIDOR_END_Z).toBe(CORRIDOR.innerDoorZ - CORRIDOR_END_BAYS * CORRIDOR.bay);
    expect(CORRIDOR_END_Z).toBeLessThan(WALK_LIMITS.minZ);
    expect(CORRIDOR_END_Z).toBeGreaterThan(CORRIDOR.farZ);
  });

  it('keeps the warm destination window within the far wall', () => {
    expect(Math.abs(CORRIDOR_WINDOW.x) + CORRIDOR_WINDOW.width / 2).toBeLessThan(CORRIDOR.width / 2);
    expect(CORRIDOR_WINDOW.bottom).toBeGreaterThan(0);
    expect(CORRIDOR_WINDOW.bottom + CORRIDOR_WINDOW.height).toBeLessThan(CORRIDOR.height);
  });
});
