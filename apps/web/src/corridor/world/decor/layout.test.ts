import { describe, expect, it } from 'vitest';
import { CORRIDOR, LOBBY } from '../../layout.ts';
import { HALL_TABLE, LOBBY_WINDOW } from '../architecture/lobbyPlan.ts';
import { RADIATOR, RADIATOR_SLOTS } from '../fixtures.ts';
import { DECOR_LAYOUT } from './layout.ts';
import manifest from './lod/manifest.json';

describe('corridor dressing placement', () => {
  it('keeps the lobby furniture and table clear of the central route and the existing board and plant', () => {
    const bench = DECOR_LAYOUT.bench;
    const benchLength = manifest.models['bench-painted-wood'].dimensions[0]! * (bench.scale ?? 1);
    expect(bench.position[0] - manifest.models['bench-painted-wood'].dimensions[2]! / 2).toBeGreaterThan(0.75);
    expect(Math.abs(bench.position[2] - 5.9)).toBeGreaterThan(benchLength / 2 + 0.5 + 0.3);
    expect(HALL_TABLE.z0).toBeGreaterThan(LOBBY_WINDOW.s[1] + 0.25);
    expect(HALL_TABLE.z1).toBeLessThan(7.6 - 0.3);
    expect(LOBBY.width / 2 - HALL_TABLE.depth).toBeGreaterThan(0.75);
  });

  it('keeps the two plants beyond the route and selects both radiator sizes without moving care props', () => {
    const plant = manifest.models['plant-large'].dimensions;
    for (const item of DECOR_LAYOUT.plants) expect(Math.abs(item.position[0]) - plant[0]! / 2).toBeGreaterThan(0.75);
    expect(DECOR_LAYOUT.radiators).toHaveLength(RADIATOR_SLOTS.length);
    expect(DECOR_LAYOUT.radiators.map((item) => item.model)).toEqual(['radiator10', 'radiator10', 'radiator6', 'radiator10', 'radiator6', 'radiator10']);
    for (const [index, slot] of RADIATOR_SLOTS.entries()) {
      const mount = DECOR_LAYOUT.radiators[index];
      expect(mount?.position[2]).toBe(slot.z);
      expect(Math.abs(mount?.position[0] ?? 0)).toBeCloseTo(CORRIDOR.width / 2 - RADIATOR.depth / 2, 6);
    }
  });

  it('mounts the wall clock and frame inside the corridor, facing inward', () => {
    expect(DECOR_LAYOUT.clock.position[1]).toBeGreaterThan(2.4);
    expect(DECOR_LAYOUT.frame.position[1]).toBeGreaterThan(2.2);
    expect(DECOR_LAYOUT.clock.position[0]).toBeLessThan(CORRIDOR.width / 2);
    expect(DECOR_LAYOUT.frame.position[0]).toBeGreaterThan(-(CORRIDOR.width / 2));
    expect(DECOR_LAYOUT.clock.yaw).toBe(-Math.PI / 2);
    expect(DECOR_LAYOUT.frame.yaw).toBe(Math.PI / 2);
  });
});
