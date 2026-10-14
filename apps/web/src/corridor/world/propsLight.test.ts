import { describe, expect, it } from 'vitest';
import { CORRIDOR } from '../layout.ts';
import { PROPS } from '../props.ts';
import { BENCH } from './architecture/lobbyFixtures.ts';
import { buildWorld } from './build.ts';
import { corridorSconceSlots, LOBBY_SCONCES, PROP_SCONCES } from './lighting.ts';
import { gapOf, FRAME, placements } from './openings.ts';
import { placementOf } from './props/placement.ts';

/**
 * Every pool of light has a visible source (founder look references), and the props lane's report
 * found the cabinet group, the watering can and four piers dim. Each prop now has a sconce within
 * reach on its own wall, and the bench stands clear of the cabinet it once ran into.
 */

/** Reach of a sconce's pool along a wall, metres. */
const REACH = 1.6;

describe('every prop has a light of its own in frame', () => {
  const corridorLights = [...corridorSconceSlots(CORRIDOR.farZ), ...PROP_SCONCES];

  it(`has a sconce on its own wall within ${REACH} m of every prop's centre`, () => {
    for (const spec of PROPS) {
      const at = placementOf(spec.id);
      const lights = spec.bay === 'lobby' ? LOBBY_SCONCES.filter((l) => (l.x < 0 ? 'left' : 'right') === at.side).map((l) => l.z) : corridorLights.filter((l) => l.side === at.side).map((l) => l.z);
      const nearest = Math.min(...lights.map((z) => Math.abs(z - at.z)));
      expect(nearest, `${spec.id} at z=${at.z.toFixed(2)} on the ${at.side} wall`).toBeLessThanOrEqual(REACH);
    }
  });

  it('keeps every extra sconce\'s lamp inside the shader\'s array: none is dropped by the cap, with the far lamps culled', () => {
    const ids = new Set(buildWorld().lamps.map((l) => l.id));
    for (const id of [...PROP_SCONCES.map((s) => s.id), 'lobby-cabinet', 'lobby-can']) expect(ids.has(id), id).toBe(true);
    // And the door washes the chamber doors need come after them in the list, so they are kept too.
    for (const id of ['door-lamp-certification-office', 'door-lamp-great-atrium']) expect(ids.has(id), id).toBe(true);
  });

  it('puts each extra sconce beside a prop and clear of every door opening and architrave on its wall', () => {
    for (const s of PROP_SCONCES) {
      const prop = PROPS.find((p) => p.bay !== 'lobby' && p.side === s.side && Math.abs(placementOf(p.id).z - s.z) < 0.5);
      expect(prop, `a prop beside ${s.id}`).toBeDefined();
      for (const d of placements().filter((q) => q.side === s.side)) {
        // A sconce is about 0.3 m wide.
        expect(Math.abs(d.z - s.z), `${s.id} beside ${d.key}`).toBeGreaterThan(gapOf(d.spec).width / 2 + FRAME.architrave + 0.15);
      }
    }
  });
});

describe('the waiting bench stands clear of the trophy cabinet', () => {
  it('leaves at least 0.3 m between the bench and the cabinet group, however the props lane has moved it', () => {
    const cabinet = placementOf('trophy-cabinet');
    const spec = PROPS.find((p) => p.id === 'trophy-cabinet');
    const half = (spec?.size[0] ?? 1) / 2;
    const gapAbove = BENCH.z0 - (cabinet.z + half);
    const gapBelow = cabinet.z - half - BENCH.z1;
    expect(Math.max(gapAbove, gapBelow)).toBeGreaterThanOrEqual(0.3);
  });
});
