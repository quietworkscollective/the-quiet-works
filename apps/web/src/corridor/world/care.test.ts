import { describe, expect, it } from 'vitest';
import { ANNEX, bayCentreZ, CORRIDOR } from '../layout.ts';
import { PlaqueLayout } from './artLayout.ts';
import { createBuckets } from './buckets.ts';
import { buildCare, CARE, coatAndCap, mug, newspaper, RAIL_LENGTH, wedge } from './care.ts';
import { PROPS } from '../props.ts';
import { RADIATOR, RADIATOR_SLOTS } from './fixtures.ts';
import { buildAnnexSign, farPrintSlots, PIER_PRINTS } from './groupings.ts';
import { gapOf, FRAME, placements } from './openings.ts';
import { STAGE } from './stage.ts';

/**
 * Founder feedback: show present-day care, not abandonment, and no long bare walls. A coat and cap
 * on a hook rail, a mug and a folded newspaper on radiators, a door wedge; a print wherever a far
 * bay would otherwise run bare.
 */

const HW = CORRIDOR.width / 2;

describe('signs of present-day care', () => {
  const places = placements();
  const care = createBuckets();
  buildCare(care);

  it('has a coat and cap, a mug, a newspaper and a door wedge, each built', () => {
    expect(care.paint.triangleCount, 'coat, cap and newspaper').toBeGreaterThan(100);
    expect(care.enamel.triangleCount, 'mug').toBeGreaterThan(20);
    expect(care.rubber.triangleCount, 'wedge').toBeGreaterThan(4);
    expect(care.oak.triangleCount, 'hook rail').toBeGreaterThan(0);
    expect(care.brass.triangleCount, 'hooks').toBeGreaterThan(0);
  });

  it('puts the coat on the left wall clear of every door, the mug and the newspaper on radiators, the wedge on the floor', () => {
    const coat = CARE.coat;
    const wall = coat.side === 'left' ? -HW : HW;
    const near = (z: number, half: number) => places.filter((p) => p.side === coat.side).every((p) => {
      const g = gapOf(p.spec);
      const reach = g.width / 2 + FRAME.architrave + 0.1;
      return Math.abs(p.z - z) > reach + half;
    });
    // The rail is RAIL_LENGTH long, centred on the coat.
    expect(near(coat.z, RAIL_LENGTH / 2)).toBe(true);
    // And clear of the props lane's anchors on this wall (the football hangs at the first door's far side).
    for (const p of PROPS.filter((q) => q.side === coat.side && typeof q.bay === 'number')) {
      const z = bayCentreZ(p.bay as number) + p.along;
      expect(Math.abs(z - coat.z), `prop ${p.id}`).toBeGreaterThan(RAIL_LENGTH / 2 + p.size[0] / 2);
    }
    const oak = care.oak.bounds();
    expect(Math.abs(oak.min[0] - wall)).toBeLessThan(0.1);
    // Mug and newspaper stand on the top of a radiator, over its footprint.
    for (const [name, spec] of [['mug', CARE.mug], ['newspaper', CARE.newspaper]] as const) {
      expect(RADIATOR_SLOTS.some((r) => r.side === spec.side && Math.abs(r.z - spec.z) < RADIATOR.length / 2), name).toBe(true);
    }
    const mug = care.enamel.bounds();
    expect(mug.min[1]).toBeGreaterThanOrEqual(RADIATOR.height - 0.005);
    expect(mug.max[1] - mug.min[1]).toBeLessThan(0.15);
    // The wedge sits on the floor, against the wall, outside every door's opening.
    const wedge = care.rubber.bounds();
    expect(wedge.min[1]).toBeLessThan(0.01);
    expect(wedge.max[1]).toBeLessThan(0.08);
    for (const p of places.filter((q) => q.side === CARE.wedge.side)) {
      expect(Math.abs(p.z - CARE.wedge.z), `wedge beside ${p.key}`).toBeGreaterThan(gapOf(p.spec).width / 2 + FRAME.architrave);
    }
  });

  it('keeps every item inside the corridor, under 1.9 m and within 0.3 m of its wall: nothing blocks the way', () => {
    const items = [
      ['coat and cap', coatAndCap, CARE.coat.side],
      ['mug', mug, CARE.mug.side],
      ['newspaper', newspaper, CARE.newspaper.side],
      ['wedge', wedge, CARE.wedge.side],
    ] as const;
    for (const [name, build, side] of items) {
      const own = createBuckets();
      build(own);
      for (const key of ['paint', 'enamel', 'rubber', 'oak', 'brass'] as const) {
        if (own[key].triangleCount === 0) continue;
        const bb = own[key].bounds();
        expect(bb.min[0], `${name} ${key}`).toBeGreaterThan(-HW - 0.005);
        expect(bb.max[0], `${name} ${key}`).toBeLessThan(HW + 0.005);
        expect(bb.max[1], `${name} ${key}`).toBeLessThan(1.9);
        const reach = side === 'left' ? bb.max[0] - -HW : HW - bb.min[0];
        expect(reach, `${name} ${key} projection`).toBeLessThan(0.3);
      }
    }
  });
});

describe('no long bare walls', () => {
  it('the prints added to the long piers stay clear of every door and of the props lane\'s anchors', () => {
    const places = placements();
    for (const p of PIER_PRINTS) {
      const half = p.w / 2 + 0.087;
      for (const d of places.filter((q) => q.side === p.side)) {
        expect(Math.abs(d.z - p.s), `print at ${p.s} beside ${d.key}`).toBeGreaterThan(half + gapOf(d.spec).width / 2 + FRAME.architrave);
      }
      for (const a of PROPS.filter((q) => q.side === p.side && typeof q.bay === 'number')) {
        const z = bayCentreZ(a.bay as number) + a.along;
        const printY: [number, number] = [p.y - p.h / 2 - 0.09, p.y + p.h / 2 + 0.09];
        const propY: [number, number] = [a.height - a.size[1] / 2, a.height + a.size[1] / 2];
        const overlapsInY = printY[0] < propY[1] && printY[1] > propY[0];
        if (overlapsInY) expect(Math.abs(z - p.s), `print at ${p.s} against ${a.id}`).toBeGreaterThan(half + a.size[0] / 2);
      }
    }
  });

  it('every far bay with no door on a side has a print at its centre, and none where there is a door (authored or repeated)', () => {
    const slots = farPrintSlots();
    const doors = placements();
    expect(slots.length).toBeGreaterThan(1);
    for (let bay = CORRIDOR.walkableBays; bay < STAGE.bays; bay += 1) {
      for (const side of ['left', 'right'] as const) {
        const has = slots.some((s) => s.bay === bay && s.side === side);
        const hasDoor = doors.some((d) => d.side === side && Math.abs(d.z - bayCentreZ(bay)) < CORRIDOR.bay / 2);
        expect(has, `bay ${bay} ${side}`).toBe(!hasDoor);
      }
    }
    for (const s of slots) expect(s.z).toBeCloseTo(bayCentreZ(s.bay), 6);
  });

  it('sets an enamel Annex sign directly above the bay 6 door', () => {
    const buckets = createBuckets();
    buildAnnexSign(buckets, new PlaqueLayout([{ text: 'ANNEX', code: 'BAY 6' }]));
    const enamel = buckets.enamel.bounds();
    expect(buckets.enamel.triangleCount).toBeGreaterThan(0);
    expect(buckets.plaque.triangleCount).toBeGreaterThan(0);
    expect(enamel.min[1]).toBeCloseTo(ANNEX.sign.y - 0.145, 3);
    expect(enamel.max[1]).toBeCloseTo(ANNEX.sign.y + 0.145, 3);
    expect((enamel.min[2] + enamel.max[2]) / 2).toBeCloseTo(bayCentreZ(ANNEX.bay), 3);
  });

});
