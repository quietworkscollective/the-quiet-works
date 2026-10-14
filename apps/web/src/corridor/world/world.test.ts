import { CHAMBERS } from '@tqw/engine';
import { describe, expect, it } from 'vitest';
import { CHAMBER_MODULES } from '../../chambers/registry.ts';
import { CHAMBER_SLOTS, CORRIDOR, LOBBY, WALK_LIMITS } from '../layout.ts';
import { ART, PLAQUE_ATLAS, PlaqueLayout, uvRect } from './artLayout.ts';
import { BENCH } from './architecture/lobbyFixtures.ts';
import { LOBBY_MID_Z, TROPHY_ZONE } from './architecture/lobbyPlan.ts';
import { BOARD_DEPTH, CLIPPINGS, CLIPPING_SIZE, FREE_EDGE_STANDOFF, SLEEVE, boardToWorld } from './board.ts';
import { BUCKET_KEYS, triangleTotal } from './buckets.ts';
import { buildWorld } from './build.ts';
import { buildRadiator, buildSconce, radiatorMounts, SCONCE_FAR_Z, sconceGroups, sconceMounts } from './fixtures.ts';
import { LOBBY_SCONCES, MAX_LAMPS } from './lighting.ts';
import { PROPS } from '../props.ts';
import { FRAME, gapOf, placements } from './openings.ts';

const world = buildWorld();

describe('placements', () => {
  const places = placements();

  it('puts the four chamber doors in corridor order, on the sides the registry names', () => {
    const chamber = places.filter((p) => p.chamber !== null).sort((a, b) => b.z - a.z);
    expect(chamber.map((p) => p.chamber)).toEqual(CHAMBERS.map((c) => c.id));
    for (const p of chamber) {
      expect(p.side).toBe(CHAMBERS.find((c) => c.id === p.chamber)!.side);
      expect(p.spec).toBe(CHAMBER_MODULES[p.chamber!].door);
    }
    expect(chamber.map((p) => p.z)).toEqual(CHAMBER_SLOTS.map((s) => s.z));
  });

  it('keeps every opening and its architrave clear of the next, on both sides, all the way to the fog', () => {
    for (const side of ['left', 'right'] as const) {
      const spans = places
        .filter((p) => p.side === side)
        .map((p) => [p.z - gapOf(p.spec).width / 2, p.z + gapOf(p.spec).width / 2] as const)
        .sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < spans.length; i += 1) expect(spans[i]![0], `${side} openings ${i - 1}/${i}`).toBeGreaterThan(spans[i - 1]![1] + 0.1);
      expect(spans[0]![0]).toBeGreaterThan(CORRIDOR.farZ);
      expect(spans[spans.length - 1]![1]).toBeLessThan(CORRIDOR.innerDoorZ - 0.5);
    }
  });

  it('recedes past the walkable bays: blank doors continue to the far fog and are marked far', () => {
    const far = places.filter((p) => p.far);
    expect(far.length).toBeGreaterThan(20);
    expect(Math.min(...far.map((p) => p.z))).toBeLessThan(-70);
    for (const p of far) expect(p.chamber).toBeNull();
    // Each reveal is 0.22 m deep; the architrave is 0.1 m wide.
    expect(FRAME.reveal).toBe(0.22);
  });
});

describe('the built world', () => {
  it('stays inside the triangle budget (250k) counting everything drawn, and well under the draw-call budget (150)', () => {
    // The merged world, plus what is drawn on top of it: the animated doors (counted whole, so a
    // part also merged is counted twice: an upper bound) and the instanced sconces and radiators.
    const doors = world.chamberDoors.reduce(
      (n, d) => n + triangleTotal(d.build.flat) + triangleTotal(d.build.fixed) + d.build.leaves.reduce((m, leaf) => m + triangleTotal(leaf.body), 0),
      0,
    );
    const lantern = (detail: 'near' | 'far'): number => {
      const sconce = buildSconce(detail);
      return sconce.brass.triangleCount + sconce.glass.triangleCount;
    };
    const radiator = buildRadiator();
    const groups = sconceGroups();
    const instanced = groups.near.length * lantern('near') + groups.far.length * lantern('far') + radiatorMounts().length * (radiator.paint.triangleCount + radiator.iron.triangleCount);
    expect(world.triangles + doors + instanced).toBeLessThan(250_000);
    const drawn = BUCKET_KEYS.filter((k) => world.buckets[k].triangleCount > 0).length;
    // One mesh per material, plus the instanced fixtures (4) and each chamber door's parts (about 8).
    expect(drawn + 6 + world.chamberDoors.length * 8 + 4).toBeLessThan(150);
  });

  it('only the sconces the visitor can never approach get the light-weight lantern', () => {
    const { near, far } = sconceGroups();
    // Every sconce is in exactly one group.
    expect(near.length + far.length).toBe(sconceMounts().length);
    expect(far.length).toBeGreaterThan(8);
    // Nothing the visitor can walk up to, or see from within eight metres of the end of the walk, is thinned.
    for (const m of near) expect(m.position[2]).toBeGreaterThanOrEqual(SCONCE_FAR_Z);
    for (const m of far) expect(m.position[2]).toBeLessThan(WALK_LIMITS.minZ - 7.99);
    const full = buildSconce('near');
    const light = buildSconce('far');
    const weight = (b: typeof full): number => b.brass.triangleCount + b.glass.triangleCount;
    // The far lantern costs under half the near one, and keeps its glass shade and brass cap.
    expect(weight(light)).toBeLessThan(weight(full) / 2);
    expect(light.glass.triangleCount).toBeGreaterThan(0);
    expect(light.brass.triangleCount).toBeGreaterThan(0);
  });

  it('has no non-finite vertex data and unit normals', () => {
    // Plain loops, one assertion per bucket: an expect() per scalar was millions of calls.
    const nonFinite = (values: readonly number[]): number => {
      let n = 0;
      for (const v of values) if (!Number.isFinite(v)) n += 1;
      return n;
    };
    for (const key of BUCKET_KEYS) {
      const b = world.buckets[key];
      expect(nonFinite(b.pos), `${key} positions`).toBe(0);
      expect(nonFinite(b.uv), `${key} uvs`).toBe(0);
      for (let i = 0; i < b.nor.length; i += 3) {
        const l = Math.hypot(b.nor[i]!, b.nor[i + 1]!, b.nor[i + 2]!);
        if (Math.abs(l - 1) > 1e-3) throw new Error(`${key}: normal ${i / 3} has length ${l}`);
      }
      let highest = -1;
      for (const i of b.idx) if (i > highest) highest = i;
      expect(highest, `${key} indices`).toBeLessThan(b.vertexCount);
    }
  });

  it('keeps every vertex inside the lobby and corridor volume (or just beyond the walls, for door recesses)', () => {
    const { min, max } = (() => {
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      for (const key of BUCKET_KEYS) {
        if (world.buckets[key].triangleCount === 0) continue;
        const b = world.buckets[key].bounds();
        for (let k = 0; k < 3; k += 1) {
          lo[k] = Math.min(lo[k]!, b.min[k]!);
          hi[k] = Math.max(hi[k]!, b.max[k]!);
        }
      }
      return { min: lo, max: hi };
    })();
    // Behind the walls only the openings' reveals and the interior proxy (built separately) go.
    expect(min[0]!).toBeGreaterThan(-LOBBY.width / 2 - 0.4);
    expect(max[0]!).toBeLessThan(LOBBY.width / 2 + 0.4);
    expect(min[1]!).toBeGreaterThanOrEqual(-0.001);
    expect(max[1]!).toBeLessThanOrEqual(LOBBY.height + 0.05);
    expect(min[2]!).toBeGreaterThanOrEqual(CORRIDOR.farZ - 0.01);
    expect(max[2]!).toBeLessThanOrEqual(LOBBY.startZ + 0.4);
  });

  it('uses at most MAX_LAMPS static lamps and none further than the fog can show', () => {
    expect(world.lamps.length).toBeLessThanOrEqual(MAX_LAMPS);
    for (const l of world.lamps) expect(l.position[2]).toBeGreaterThan(-62);
  });

  it('washes every door whose character names a lamp, at the colour and strength the data gives, and no other door', () => {
    const lamps = world.lamps.filter((l) => l.kind === 'door-lamp');
    const named = world.places.filter((p) => p.spec.character?.lamp && !p.far).map((p) => p.key);
    expect(lamps.map((l) => l.id).sort()).toEqual(named.map((k) => `door-lamp-${k}`).sort());
    // The four chamber doors all have one (ADR 0004: Office 3000 K, Apartment 2800 K, Tomorrow Engine 3400 K, Atrium 3100 K).
    expect(named).toEqual(expect.arrayContaining(['certification-office', 'apartment', 'tomorrow-engine', 'great-atrium']));
    // Warmer data is redder: 2800 K carries a higher red-to-blue ratio than 3400 K.
    const ratio = (id: string): number => {
      const l = lamps.find((x) => x.id === id);
      if (!l) throw new Error(`no lamp ${id}`);
      return l.colour[0] / l.colour[2];
    };
    expect(ratio('door-lamp-apartment')).toBeGreaterThan(ratio('door-lamp-tomorrow-engine'));
  });
});

describe('notice board layout', () => {
  it('has one clipping per chamber, each rotated within +-2 degrees', () => {
    expect(CLIPPINGS.map((c) => c.chamberIndex).sort()).toEqual(CHAMBERS.map((_, i) => i));
    for (const c of CLIPPINGS) expect(Math.abs(c.tiltDeg)).toBeLessThanOrEqual(2);
  });

  it('keeps clippings and the sleeve on the felt and off each other', () => {
    const halfW = (LOBBY.board.width - 2 * LOBBY.board.frame) / 2;
    const halfH = (LOBBY.board.height - 2 * LOBBY.board.frame) / 2;
    const boxes = [
      ...CLIPPINGS.map((c) => ({ u: c.u, v: c.v, w: CLIPPING_SIZE, h: CLIPPING_SIZE })),
      { u: SLEEVE.u, v: SLEEVE.v, w: SLEEVE.w, h: SLEEVE.h },
    ];
    for (const b of boxes) {
      expect(Math.abs(b.u) + b.w / 2).toBeLessThan(halfW);
      expect(Math.abs(b.v) + b.h / 2).toBeLessThan(halfH);
    }
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlap = Math.abs(a.u - b.u) < (a.w + b.w) / 2 && Math.abs(a.v - b.v) < (a.h + b.h) / 2;
        expect(overlap, `items ${i} and ${j} overlap`).toBe(false);
      }
    }
  });

  it('is swivelled by the contract\'s 15 degrees toward the entrance, hinged 56 mm off the wall and standing off by its free edge', () => {
    const origin = boardToWorld(0, 0, 0);
    const out = boardToWorld(0, 0, 1);
    const normal = [out[0] - origin[0], out[2] - origin[2]];
    expect((Math.atan2(normal[1]!, normal[0]!) * 180) / Math.PI).toBeCloseTo(LOBBY.board.swivelDeg, 6);
    // Centred where the contract puts it, at the contract height.
    expect(origin[2]).toBeCloseTo(LOBBY.board.z, 6);
    expect(origin[1]).toBeCloseTo(LOBBY.board.y, 6);
    // The hinged edge (toward the entrance, +z) is just proud of the 50 mm dado cap; the free edge stands off by width x sin(swivel).
    const hinge = boardToWorld(-LOBBY.board.width / 2, 0, 0);
    const free = boardToWorld(LOBBY.board.width / 2, 0, 0);
    expect(hinge[0] - -LOBBY.width / 2).toBeGreaterThan(0.05);
    expect(hinge[2]).toBeGreaterThan(free[2]);
    expect(free[0] - hinge[0]).toBeCloseTo(LOBBY.board.width * Math.sin((LOBBY.board.swivelDeg * Math.PI) / 180), 6);
    // The plank closing the free edge reaches the wall.
    expect(free[0] - FREE_EDGE_STANDOFF * Math.cos((LOBBY.board.swivelDeg * Math.PI) / 180)).toBeLessThan(-LOBBY.width / 2 + 0.005);
    expect(BOARD_DEPTH.frontOfFrame - BOARD_DEPTH.back).toBeCloseTo(LOBBY.board.frame, 6);
    expect(BOARD_DEPTH.clipping).toBeGreaterThan(BOARD_DEPTH.felt);
    expect(BOARD_DEPTH.clipping).toBeLessThan(BOARD_DEPTH.frontOfFrame);
  });
});

describe('the lobby\'s anchors for the props lane', () => {
  it('keeps the right wall clear from the cabinet\'s anchor to the photograph\'s, to the height of the cabinet group', () => {
    expect(TROPHY_ZONE.z1 - TROPHY_ZONE.z0).toBeGreaterThan(2);
    // Sconces, the bench and everything else on the right wall stand outside the zone.
    // The cabinet's own light is the one exception: it hangs above the group, over its top.
    const cabinetLight = LOBBY_SCONCES.find((x) => x.id === 'lobby-cabinet');
    expect(cabinetLight && (cabinetLight.y ?? 0), 'the cabinet has a light above it').toBeGreaterThanOrEqual(1.9);
    for (const l of LOBBY_SCONCES.filter((x) => x.x > 0 && x.id !== 'lobby-cabinet')) {
      expect(l.z < TROPHY_ZONE.z0 - 0.15 || l.z > TROPHY_ZONE.z1 + 0.15, `${l.id} at z=${l.z} in the trophy zone ${TROPHY_ZONE.z0}..${TROPHY_ZONE.z1}`).toBe(true);
    }
    expect(BENCH.z0 > TROPHY_ZONE.z1 || BENCH.z1 < TROPHY_ZONE.z0).toBe(true);
    // The anchors really are where the contract says: the cabinet and the photograph on the right, the can on the left.
    const cabinet = PROPS.find((p) => p.id === 'trophy-cabinet');
    const photo = PROPS.find((p) => p.id === 'team-photo');
    expect(cabinet && cabinet.side).toBe('right');
    expect(photo && photo.side).toBe('right');
    for (const p of [cabinet, photo]) {
      const z = LOBBY_MID_Z + (p?.along ?? 0);
      expect(z, p?.id).toBeGreaterThan(TROPHY_ZONE.z0);
      expect(z, p?.id).toBeLessThan(TROPHY_ZONE.z1);
    }
  });

});

describe('lettered art layout', () => {
  it('gives every distinct plaque its own slot on the atlas, inside it, without overlap', () => {
    const layout = new PlaqueLayout(
      CHAMBERS.flatMap((c) => {
        const plaque = CHAMBER_MODULES[c.id].door.plaque;
        return plaque ? [plaque, plaque] : [];
      }),
    );
    expect(layout.all.length).toBe(3);
    const rects = layout.all.map((p) => layout.rect(p.text));
    for (const r of rects) {
      expect(r.y + r.h).toBeLessThanOrEqual(PLAQUE_ATLAS.height);
      expect(r.x + r.w).toBeLessThanOrEqual(PLAQUE_ATLAS.width);
    }
    for (let i = 1; i < rects.length; i += 1) expect(rects[i]!.y).toBeGreaterThanOrEqual(rects[i - 1]!.y + rects[i - 1]!.h);
    for (const p of layout.all) {
      for (const v of layout.uv(p.text)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('refuses a plaque it never registered, rather than drawing the wrong words', () => {
    expect(() => new PlaqueLayout([]).rect('NOT THERE')).toThrow();
  });

  it('converts canvas pixel rectangles to WebGL UVs (v up)', () => {
    expect(uvRect({ x: 0, y: 0, w: 512, h: 256 }, 1024, 1024)).toEqual([0, 0.75, 0.5, 1]);
    expect(ART.section.w / ART.section.h).toBeCloseTo(1.6, 6);
  });
});
