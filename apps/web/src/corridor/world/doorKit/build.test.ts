import { CHAMBERS } from '@tqw/engine';
import { describe, expect, it } from 'vitest';
import { CHAMBER_MODULES } from '../../../chambers/registry.ts';
import type { DoorSpec } from '../../doorKit.ts';
import { BLANK_DOORS } from '../../layout.ts';
import { PlaqueLayout } from '../artLayout.ts';
import { BUCKET_KEYS, type Buckets } from '../buckets.ts';
import { buildDoor } from './build.ts';
import { LEAF_GAP, planDoor } from './plan.ts';

const specs = CHAMBERS.map((c) => ({ id: c.id, spec: CHAMBER_MODULES[c.id].door }));
const plaques = new PlaqueLayout(specs.flatMap((s) => (s.spec.plaque ? [s.spec.plaque] : [])));
const build = (spec: DoorSpec, animated = false, lod: 'near' | 'far' = 'near') => buildDoor(spec, { lod, plaques, animated, seed: 1 });
const tris = (b: Buckets, key: (typeof BUCKET_KEYS)[number]): number => b[key].triangleCount;
const total = (b: Buckets): number => BUCKET_KEYS.reduce((n, k) => n + b[k].triangleCount, 0);
const withoutClosure = (spec: DoorSpec): DoorSpec => {
  const { closure: _closure, ...rest } = spec;
  return rest;
};

describe('door geometry', () => {
  it('a chain door has a chain: removing the closure removes iron links and a padlock', () => {
    const atrium = specs.find((s) => s.id === 'great-atrium')!.spec;
    expect(atrium.closure).toBe('chain');
    const chained = build(atrium);
    const bare = build(withoutClosure(atrium));
    expect(tris(chained.flat, 'iron')).toBeGreaterThan(tris(bare.flat, 'iron') + 200);
    expect(tris(chained.flat, 'brass')).toBeGreaterThan(tris(bare.flat, 'brass'));
  });

  it('a bolt, a seal and a padlock each add geometry on their own', () => {
    // The closure on its own: the character's locks (which name a bolt of their own) are set aside.
    const { character: _character, ...base } = specs.find((s) => s.id === 'apartment')!.spec;
    const none = total(build(withoutClosure({ ...base, fittings: [] })).flat);
    for (const closure of ['bolt', 'seal', 'padlock'] as const) {
      expect(total(build({ ...base, fittings: [], closure }).flat), closure).toBeGreaterThan(none);
    }
  });

  it('a blank door has no plaque mesh; a door with a plaque has one', () => {
    for (const door of BLANK_DOORS) expect(tris(build(door.spec).flat, 'plaque'), door.key).toBe(0);
    const office = specs.find((s) => s.id === 'certification-office')!.spec;
    expect(tris(build(office).flat, 'plaque')).toBeGreaterThan(0);
    // The Apartment has no plaque in its spec, so none is built, but it has its brass numeral.
    const apartment = specs.find((s) => s.id === 'apartment')!.spec;
    expect(tris(build(apartment).flat, 'plaque')).toBe(0);
    expect(tris(build(apartment).flat, 'numeral')).toBeGreaterThan(0);
  });

  it('a blank door carries no departmental fittings in geometry: no numeral, doormat, glow or lit lamp glass', () => {
    for (const door of BLANK_DOORS) {
      const flat = build(door.spec).flat;
      expect(tris(flat, 'numeral')).toBe(0);
      expect(tris(flat, 'rubber')).toBe(0);
      expect(tris(flat, 'glow')).toBe(0);
    }
  });

  it('the leaf is the size the spec says, less its hanging clearances', () => {
    for (const { id, spec } of specs) {
      // Closures and fittings that overhang the leaf edge (a seal strip) are not leaf members.
      const members = build(withoutClosure({ ...spec, fittings: [] }), true);
      const plan = planDoor(spec);
      members.leaves.forEach((leaf, i) => {
        const { min, max } = (() => {
          let lo = [Infinity, Infinity];
          let hi = [-Infinity, -Infinity];
          for (const key of BUCKET_KEYS) {
            if (key === 'glow') continue;
            const b = leaf.body[key];
            if (b.triangleCount === 0) continue;
            const bounds = b.bounds();
            lo = [Math.min(lo[0]!, bounds.min[0]), Math.min(lo[1]!, bounds.min[1])];
            hi = [Math.max(hi[0]!, bounds.max[0]), Math.max(hi[1]!, bounds.max[1])];
          }
          return { min: lo, max: hi };
        })();
        expect(max[0]! - min[0]!, `${id} leaf ${i} width`).toBeCloseTo(plan.leaves[i]!.width, 3);
        expect(max[1]! - min[1]!, `${id} leaf ${i} height`).toBeCloseTo(plan.leaves[i]!.height, 3);
        expect(min[1]! , `${id} leaf ${i} bottom`).toBeCloseTo(LEAF_GAP.bottom, 3);
      });
    }
  });

  it('the Office leaf has a hatch of 280 x 160 mm and the Apartment door does not', () => {
    const office = specs.find((s) => s.id === 'certification-office')!.spec;
    const withHatch = build(office, true).leaves[0]!.body;
    const { hatch: _hatch, ...noHatch } = office;
    const without = build(noHatch, true).leaves[0]!.body;
    expect(total(withHatch)).toBeGreaterThan(total(without));
    expect(office.hatch).toMatchObject({ width: 0.28, height: 0.16 });
  });

  it('animated doors split into a leaf per hinge, each with its own handle pivot at 1.0 m', () => {
    for (const { spec } of specs) {
      const built = build(spec, true);
      expect(built.leaves).toHaveLength(spec.family === 'ceremonial-double' ? 2 : 1);
      for (const leaf of built.leaves) {
        if (!leaf.handle) continue;
        expect(leaf.handle.pivot[1]).toBe(1.0);
        // The pivot is on the leaf's face, and the handle's own geometry is built about it.
        const bounds = leaf.handle.geo.brass.triangleCount > 0 ? leaf.handle.geo.brass.bounds() : leaf.handle.geo.iron.bounds();
        expect(Math.abs((bounds.min[1] + bounds.max[1]) / 2)).toBeLessThan(0.15);
      }
    }
  });

  it('far doors are built with less geometry than near ones', () => {
    const spec = BLANK_DOORS[0]!.spec;
    expect(total(build(spec, false, 'far').flat)).toBeLessThan(total(build(spec, false, 'near').flat));
  });

  it('every door is under a sensible triangle budget', () => {
    for (const { spec } of specs) expect(total(build(spec, true).flat)).toBeLessThan(14000);
    for (const door of BLANK_DOORS) expect(total(build(door.spec).flat)).toBeLessThan(9000);
  });
});
