import { CORRIDOR_PROPS } from '@tqw/engine';
import { describe, expect, it, vi } from 'vitest';
import { PROPS, type PropId } from '../../props.ts';
import { buildProps } from './build.ts';
import { HIT, hitBoxes, pointerHandlers } from './hit.ts';
import { MODELS } from './models/index.ts';
import { CHANNELS } from './parts.ts';
import { EXCEEDS, MOVES, placementOf, ROUTE_HALF_WIDTH, toWorld } from './placement.ts';
import type { PoseSet } from './motion.ts';
import { PROP_IDS, poseOf, posedVertices, windingErrors } from './testkit.ts';

const assembly = buildProps();

describe('the twelve props are built where the contract puts them', () => {
  it('has a model for every prop in PROPS, in contract order, and builds each one', () => {
    expect(MODELS.map((m) => m.id)).toEqual(PROPS.map((p) => p.id));
    for (const id of PROP_IDS) {
      expect(assembly.bounds.has(id), `${id} has geometry`).toBe(true);
      expect(assembly.trianglesBy.get(id) ?? 0, `${id} triangles`).toBeGreaterThan(200);
    }
  });

  it('stands each prop against its own wall, on its own side, at its anchor along the wall', () => {
    for (const spec of PROPS) {
      const b = assembly.bounds.get(spec.id);
      const p = placementOf(spec.id);
      expect(b, spec.id).toBeDefined();
      if (!b) continue;
      // Against the wall of its side, projecting into the room.
      const depth = spec.side === 'left' ? b.max[0] - p.wallX : p.wallX - b.min[0];
      expect(depth, `${spec.id} projects from its wall`).toBeGreaterThan(0.03);
      expect(depth, `${spec.id} projects at most 0.45 m`).toBeLessThan(0.45);
      // Its geometry is centred on its anchor along the wall, give or take the objects grouped with it.
      const along = (b.min[2] + b.max[2]) / 2;
      expect(Math.abs(along - p.z), `${spec.id} along the wall`).toBeLessThan(0.2);
      // And at its height: wall-hung props span their contract height, floor props start at the floor.
      if (spec.height === 0) expect(b.min[1], `${spec.id} on the floor`).toBeLessThan(0.03);
      else expect(b.min[1] <= p.height && p.height <= b.max[1], `${spec.id} spans its height`).toBe(true);
    }
  });

  it('carries every prop\'s ivory fitting: a bone-coloured part that sits inside the prop', () => {
    for (const id of PROP_IDS) {
      const ranges = assembly.fittings.filter((f) => f.prop === id);
      expect(ranges.length, `${id} has a fitting`).toBeGreaterThan(0);
      const enamel = assembly.channels.enamel.bucket;
      const b = assembly.bounds.get(id);
      for (const r of ranges) {
        for (let i = r.start; i < r.end; i += 1) {
          const [cr, cg, cb] = [enamel.col[i * 3] ?? 0, enamel.col[i * 3 + 1] ?? 0, enamel.col[i * 3 + 2] ?? 0];
          // Ivory: light, warm, never saturated.
          expect(cr, `${id} fitting red`).toBeGreaterThan(0.55);
          expect(cr >= cg && cg >= cb, `${id} fitting is warm`).toBe(true);
          expect(cr - cb, `${id} fitting is not saturated`).toBeLessThan(0.25);
          const x = enamel.pos[i * 3] ?? 0;
          if (b) expect(x >= b.min[0] - 1e-6 && x <= b.max[0] + 1e-6, `${id} fitting inside bounds`).toBe(true);
        }
      }
    }
  });

  it('moves a prop at most 0.5 m from its contract anchor, except those listed as exceeding it', () => {
    for (const [id, move] of Object.entries(MOVES) as [PropId, NonNullable<(typeof MOVES)[PropId]>][]) {
      const exceeds = Math.abs(move.along ?? 0) > 0.5 || Math.abs(move.height ?? 0) > 0.5;
      expect(EXCEEDS.includes(id), `${id}: ${exceeds ? 'exceeds' : 'is within'} the allowance`).toBe(exceeds);
      expect(move.reason.length, `${id} says why`).toBeGreaterThan(20);
    }
    for (const id of EXCEEDS) expect(MOVES[id], `${id} is moved`).toBeDefined();
  });

  it('places the world point of a prop-local point on the wall plane', () => {
    for (const spec of PROPS) {
      const p = placementOf(spec.id);
      const [x, , z] = toWorld(p, [0, 0, 0]);
      expect(x).toBeCloseTo(p.wallX, 9);
      expect(z).toBeCloseTo(p.z, 9);
      const [nx] = toWorld(p, [0, 0, 1]);
      expect(Math.sign(nx - x), `${spec.id} +z faces into the room`).toBe(spec.side === 'left' ? 1 : -1);
    }
  });
});

describe('nothing renders inside the walking route', () => {
  /** Folds into `into` the smallest distance from the corridor's centre line of any vertex of each prop. */
  function nearest(poses: (id: PropId) => PoseSet, into: Map<PropId, number>): void {
    for (const v of posedVertices(assembly, Object.fromEntries(PROP_IDS.map((id) => [id, poses(id)])))) {
      const x = Math.abs(v.position[0]);
      if (x < (into.get(v.prop) ?? Infinity)) into.set(v.prop, x);
    }
  }

  it('keeps every vertex of every prop, at every point of its action, outside the central 1.5 m', () => {
    // The action runs both ways (rising and falling), and the ambient motions are at their extremes.
    const closest = new Map<PropId, number>();
    for (const sleeve of [-1, 0, 1]) {
      for (const phase of ['rising', 'falling'] as const) {
        for (const action of [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1]) nearest((id) => poseOf(id, action, { phase, ambient: { sleeve, tag: sleeve } }), closest);
      }
    }
    for (const id of PROP_IDS) expect(closest.get(id) ?? 0, `${id} comes no nearer the route than`).toBeGreaterThanOrEqual(ROUTE_HALF_WIDTH);
  });

  it('under reduced motion too', () => {
    const closest = new Map<PropId, number>();
    nearest((id) => poseOf(id, 1, { reduced: true }), closest);
    for (const id of PROP_IDS) expect(closest.get(id) ?? 0, id).toBeGreaterThanOrEqual(ROUTE_HALF_WIDTH);
  });
});

describe('the budget', () => {
  it('stays within about 25k triangles for all the props together', () => {
    expect(assembly.triangles).toBeLessThanOrEqual(25_000);
  });

  it('draws in at most 12 calls: one skinned mesh per material channel, empty channels left out', () => {
    const used = CHANNELS.filter((c) => assembly.channels[c].bucket.triangleCount > 0);
    expect(used.length).toBeLessThanOrEqual(12);
    expect(used.length).toBeLessThanOrEqual(7);
  });

  it('skins every vertex to a bone of its own prop, or to the static root', () => {
    for (const channel of CHANNELS) {
      const { bucket, bone, owner } = assembly.channels[channel];
      expect(bone.length).toBe(bucket.vertexCount);
      expect(owner.length).toBe(bucket.vertexCount);
      for (let i = 0; i < bone.length; i += 1) {
        const def = assembly.bones[bone[i] ?? -1];
        expect(def, `${channel} vertex ${i}`).toBeDefined();
        if (def && def.prop !== null) expect(def.prop).toBe(owner[i]);
      }
    }
  });

  it('winds every triangle outward, so no front-facing material shows a hole', () => {
    for (const channel of CHANNELS) expect(windingErrors(assembly.channels[channel].bucket), `${channel} winding`).toBe(0);
  });
});

describe('hit areas', () => {
  const boxes = hitBoxes(assembly);

  it('has one for every prop, never smaller than 0.42 m along the wall and in height', () => {
    expect(boxes.map((b) => b.id).sort()).toEqual([...PROP_IDS].sort());
    for (const b of boxes) {
      expect(b.size[2], `${b.id} along the wall`).toBeGreaterThanOrEqual(HIT.minSpan - 1e-9);
      expect(b.size[1], `${b.id} height`).toBeGreaterThanOrEqual(HIT.minSpan - 1e-9);
    }
  });

  it('covers the prop it belongs to, with a margin', () => {
    for (const b of boxes) {
      const own = assembly.hits.get(b.id) ?? assembly.bounds.get(b.id);
      if (!own) throw new Error(b.id);
      for (let k = 0; k < 3; k += 1) {
        const centre = b.centre[k] ?? 0;
        const half = (b.size[k] ?? 0) / 2;
        expect(centre - half, `${b.id} axis ${k} low`).toBeLessThanOrEqual((own.min[k] ?? 0) - HIT.pad + 1e-9);
        expect(centre + half, `${b.id} axis ${k} high`).toBeGreaterThanOrEqual((own.max[k] ?? 0) + HIT.pad - 1e-9);
      }
    }
  });

  it('keeps each cabinet-group hit area off its neighbour: the shirts are not hidden behind the cabinet', () => {
    const cabinet = boxes.find((b) => b.id === 'trophy-cabinet');
    const shirts = boxes.find((b) => b.id === 'team-shirts');
    if (!cabinet || !shirts) throw new Error('missing');
    // The cabinet's hit area starts above the open bay; the shirts' ends below the apron.
    expect(cabinet.centre[1] - cabinet.size[1] / 2).toBeGreaterThan(shirts.centre[1] + shirts.size[1] / 2 - 0.2);
  });

  it('reports over, out and click for its prop, and stops the pointer there', () => {
    const calls: [PropId, string][] = [];
    const handlers = pointerHandlers('football', (id, kind) => calls.push([id, kind]));
    const stop = vi.fn();
    handlers.onPointerOver({ stopPropagation: stop });
    handlers.onPointerOut();
    handlers.onClick({ stopPropagation: stop });
    expect(calls).toEqual([['football', 'over'], ['football', 'out'], ['football', 'click']]);
    expect(stop).toHaveBeenCalledTimes(2);
  });
});

describe('the drafted copy', () => {
  it('has a verb for every prop, so the lane\'s labels and the props agree on the set', () => {
    expect(Object.keys(CORRIDOR_PROPS.verbs).sort()).toEqual([...PROP_IDS].sort());
  });
});
