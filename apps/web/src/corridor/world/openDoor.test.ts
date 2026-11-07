import { describe, expect, it } from 'vitest';
import { CHAMBER_MODULES } from '../../chambers/registry.ts';
import { CORRIDOR } from '../layout.ts';
import { holeOf } from './openings.ts';
import { buildLamps } from './lighting.ts';
import { buildOpenLamp, OPEN_LAMP, openLampCentre } from './openDoor.ts';

const doors = Object.entries(CHAMBER_MODULES).map(([id, entry]) => ({ id, spec: entry.door }));
const HEAD_CLEARANCE = CORRIDOR.eyeHeight + 0.5;

describe('the open door lamp', () => {
  it('stands out from the wall far enough to be seen down the corridor, on every door that could open', () => {
    for (const { id, spec } of doors) {
      const [, , z] = openLampCentre(spec);
      expect(z, `${id} reach`).toBeGreaterThanOrEqual(0.35);
      expect(z, `${id} stays over the margin a walker keeps from the wall`).toBeLessThanOrEqual(CORRIDOR.wallMargin + 0.1);
    }
  });

  it('hangs above the door and a walker, and under the cornice', () => {
    for (const { id, spec } of doors) {
      const [, y] = openLampCentre(spec);
      expect(y - OPEN_LAMP.glassRadius, `${id} clears a walker`).toBeGreaterThan(HEAD_CLEARANCE);
      expect(y + 0.1, `${id} mounts on the wall above its opening`).toBeGreaterThan(holeOf(spec).height);
      expect(y + 0.1, `${id} stays under the cornice`).toBeLessThan(CORRIDOR.height - CORRIDOR.corniceDepth);
    }
  });

  it('is a colour no lamp in the corridor shares: green and blue lead where every sconce leads with red', () => {
    const [r, g, b] = OPEN_LAMP.glass;
    expect(g).toBeGreaterThan(r * 3);
    expect(b).toBeGreaterThan(r * 3);
    for (const lamp of buildLamps([])) expect(lamp.colour[0], lamp.id).toBeGreaterThanOrEqual(lamp.colour[2]);
  });

  it('builds a fixture, a glass and a floor pool, with no light source of its own', () => {
    const parts = buildOpenLamp(doors[0]!.spec);
    expect(Object.keys(parts).sort()).toEqual(['fixture', 'glass', 'pool']);
    for (const part of Object.values(parts)) expect(part.vertexCount).toBeGreaterThan(0);
  });
});
