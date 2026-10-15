import { CHAMBERS } from '@tqw/engine';
import { describe, expect, it } from 'vitest';
import { CHAMBER_MODULES } from '../../../chambers/registry.ts';
import { DOOR_GRAMMAR, type DoorSpec } from '../../doorKit.ts';
import { BLANK_DOORS, blankDoorAt } from '../../layout.ts';
import { LEAF_GAP, partsOf, planDoor, transomHeight } from './plan.ts';

const chamberDoors = CHAMBERS.map((c) => ({ id: c.id, status: c.status, spec: CHAMBER_MODULES[c.id].door }));
const blankSpecs: DoorSpec[] = [...BLANK_DOORS.map((d) => d.spec), ...[6, 7, 8, 9, 10, 11].flatMap((bay) => (['left', 'right'] as const).flatMap((side) => blankDoorAt(bay, side) ?? []))];

describe('door plan: dimensions match the spec', () => {
  it.each(chamberDoors.map((d) => [d.id, d.spec] as const))('%s: opening, leaf and hole', (_id, spec) => {
    const plan = planDoor(spec);
    expect(plan.opening).toEqual({ width: spec.width, height: spec.height });
    // The older opening wins when the door is an insertion; otherwise the hole is the door plus its lining and transom.
    if (spec.surround) expect(plan.hole).toEqual(spec.surround);
    else expect(plan.hole.width).toBeCloseTo(spec.width + 2 * plan.lining, 9);
    const total = plan.leaves.reduce((sum, l) => sum + l.width, 0);
    const gaps = 2 * LEAF_GAP.side + (plan.leaves.length === 2 ? 0.006 : 0);
    expect(total).toBeCloseTo(spec.width - gaps, 9);
    for (const leaf of plan.leaves) expect(leaf.height).toBeCloseTo(spec.height - LEAF_GAP.bottom - LEAF_GAP.top, 9);
  });

  it('a ceremonial pair is two leaves hinged at the outer edges; every other family is one leaf', () => {
    for (const { spec } of chamberDoors) {
      const plan = planDoor(spec);
      expect(plan.leaves.length).toBe(spec.family === 'ceremonial-double' ? 2 : 1);
    }
    const pair = planDoor(chamberDoors.find((d) => d.spec.family === 'ceremonial-double')!.spec);
    expect(pair.leaves.map((l) => l.hinge)).toEqual(['left', 'right']);
  });

  it('keeps ordinary doors in their ADR ranges and reserves the Outline Room size for its custom leaves', () => {
    for (const { id, spec } of chamberDoors) {
      if (id === 'outline-room') {
        expect(spec.width).toBe(2.2);
        expect(spec.height).toBe(2.1);
        expect(spec.width).toBeGreaterThanOrEqual(1.5);
        continue;
      }
      if (spec.family === 'ceremonial-double') {
        expect(spec.width).toBeGreaterThanOrEqual(1.6);
        expect(spec.width).toBeLessThanOrEqual(2.2);
        expect(spec.height).toBeGreaterThanOrEqual(2.6);
        expect(spec.height).toBeLessThanOrEqual(3.2);
      } else {
        expect(spec.width).toBeGreaterThanOrEqual(0.85);
        expect(spec.width).toBeLessThanOrEqual(1.25);
        expect(spec.height).toBeGreaterThanOrEqual(2.1);
        expect(spec.height).toBeLessThanOrEqual(2.7);
      }
    }
    for (const spec of blankSpecs) {
      if (spec.family === 'ceremonial-double') {
        expect(spec.width).toBeGreaterThanOrEqual(1.6);
        expect(spec.width).toBeLessThanOrEqual(2.2);
        expect(spec.height).toBeGreaterThanOrEqual(2.6);
        expect(spec.height).toBeLessThanOrEqual(3.2);
      } else {
        expect(spec.width).toBeGreaterThanOrEqual(0.85);
        expect(spec.width).toBeLessThanOrEqual(1.25);
        expect(spec.height).toBeGreaterThanOrEqual(2.1);
        expect(spec.height).toBeLessThanOrEqual(2.7);
      }
    }
  });
});

describe('door plan: the shared grammar', () => {
  it('every handle is centred at 1.0 m', () => {
    for (const { spec } of chamberDoors) {
      for (const handle of partsOf(planDoor(spec), 'handle')) expect(handle.centre[1]).toBe(DOOR_GRAMMAR.handleCentreY);
    }
  });

  it('a plaque is about 280 x 90 mm, centred at 1.55 m, and only where the spec asks for one', () => {
    for (const { spec } of chamberDoors) {
      const plaques = partsOf(planDoor(spec), 'plaque');
      if (!spec.plaque) {
        expect(plaques).toHaveLength(0);
        continue;
      }
      expect(plaques).toHaveLength(1);
      expect(plaques[0]!.centre[1]).toBe(DOOR_GRAMMAR.plaqueCentreY);
      expect(plaques[0]!.size).toEqual([DOOR_GRAMMAR.plaque.width, DOOR_GRAMMAR.plaque.height]);
    }
  });

  it('either a transom or a lamp tops every door, never both and never neither', () => {
    for (const spec of [...chamberDoors.map((d) => d.spec), ...blankSpecs]) {
      const plan = planDoor(spec);
      const transom = plan.transom !== null;
      const lamp = partsOf(plan, 'lamp').length > 0;
      expect(transom !== lamp).toBe(true);
      expect(transom).toBe(spec.topper === 'transom');
    }
  });

  it('a transom fits under the cornice: the opening and its architrave stay below 3.5 m', () => {
    for (const spec of [...chamberDoors.map((d) => d.spec), ...blankSpecs]) {
      expect(planDoor(spec).hole.height + 0.1).toBeLessThanOrEqual(3.5 + 1e-9);
    }
    expect(transomHeight({ ...chamberDoors[3]!.spec, topper: 'transom' })).toBeGreaterThanOrEqual(0.18);
  });
});

describe('door plan: states', () => {
  it('the open chamber has a seam of light and no closure; every sealed chamber has a closure and no seam light', () => {
    for (const { status, spec } of chamberDoors) {
      const plan = planDoor(spec);
      const closures = plan.parts.filter((p) => p.kind.startsWith('closure-'));
      const seam = partsOf(plan, 'seam-light');
      if (status === 'open') {
        expect(spec.spill).toBeDefined();
        expect(seam).toHaveLength(1);
        expect(closures).toHaveLength(0);
      } else {
        expect(spec.spill).toBeUndefined();
        expect(seam).toHaveLength(0);
        expect(closures.length).toBeGreaterThan(0);
      }
    }
  });

  it('each closure the spec names appears in the plan', () => {
    const want: Record<NonNullable<DoorSpec['closure']>, string> = { chain: 'closure-chain', padlock: 'closure-padlock', seal: 'closure-seal', bolt: 'closure-bolt' };
    for (const { spec } of chamberDoors) {
      if (!spec.closure) continue;
      expect(planDoor(spec).parts.map((p) => p.kind)).toContain(want[spec.closure]);
    }
    // A chain is looped through a padlock.
    const chained = planDoor({ ...chamberDoors[3]!.spec, closure: 'chain' });
    expect(chained.parts.map((p) => p.kind)).toEqual(expect.arrayContaining(['closure-chain', 'closure-padlock']));
  });

  it('each fitting the spec names appears in the plan, and no others', () => {
    for (const { spec } of chamberDoors) {
      const kinds = planDoor(spec)
        .parts.filter((p) => p.kind.startsWith('fitting-'))
        .map((p) => p.kind.replace('fitting-', ''))
        .sort();
      expect(kinds).toEqual([...(spec.fittings ?? [])].sort());
    }
  });

  it('the Office door has its service hatch at the specified size and height', () => {
    const office = chamberDoors.find((d) => d.id === 'certification-office')!.spec;
    const hatch = partsOf(planDoor(office), 'hatch');
    expect(hatch).toHaveLength(1);
    expect(hatch[0]!.size).toEqual([office.hatch!.width, office.hatch!.height]);
    expect(hatch[0]!.centre[1]).toBe(office.hatch!.centreY);
  });
});

describe('blank doors are architecture, not destinations', () => {
  it('have no departmental fittings: no plaque, hatch, closure, fitting, seam light or lit lamp', () => {
    for (const spec of blankSpecs) {
      const kinds = planDoor(spec).parts.map((p) => p.kind);
      for (const forbidden of ['plaque', 'hatch', 'seam-light', 'closure-chain', 'closure-padlock', 'closure-seal', 'closure-bolt', 'fitting-number-4', 'fitting-doormat', 'fitting-letterbox', 'fitting-pressure-gauge', 'fitting-rivets']) {
        expect(kinds, `a blank door carries ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
