import { describe, expect, it } from 'vitest';
import { createPropAnimation, type PropId } from '../../props.ts';
import { buildProps } from './build.ts';
import { ATTENTION_GAIN, GLINT_GAIN, fittingGain } from './glow.ts';
import { createPropMaterials } from './materials.ts';
import { NO_AMBIENT } from './motion.ts';
import { createPropsRig } from './rig.ts';
import { PROP_IDS, displacement, poseOf } from './testkit.ts';
import { dropAt, POT } from './models/wateringCan.ts';

const assembly = buildProps();
const REST = {};
const SAMPLES = Array.from({ length: 51 }, (_, i) => i / 50);

/** Props whose action ends open, tipped, lifted or moved, and stays there until `action` falls. */
const HOLDS: readonly PropId[] = ['trophy-cabinet', 'team-photo', 'watering-can', 'team-shirts', 'walking-boots', 'repair-kit', 'recipe-drawer', 'chess', 'work-glove'];
/** Props whose action is a turn that ends exactly where it began (the lane cuts or runs the fall from there). */
const TURNS: readonly PropId[] = ['bicycle-wheel', 'football', 'cricket-bat'];
/** Poses that are not the plain reverse of their rise: a turn is not unwound, a drop does not climb. */
const PHASED: readonly PropId[] = ['football', 'cricket-bat', 'repair-kit', 'watering-can'];

describe('action drives every prop from 0 to 1 and back', () => {
  it('has every prop at rest at action 0, whichever way the action is running', () => {
    for (const id of PROP_IDS) {
      for (const phase of ['rising', 'falling'] as const) {
        expect(displacement(assembly, id, poseOf(id, 0, { phase }), REST), `${id} (${phase})`).toBeLessThan(1e-9);
      }
    }
  });

  it('moves every prop by action 0.5', () => {
    for (const id of PROP_IDS) {
      expect(displacement(assembly, id, poseOf(id, 0.5), REST), `${id} mid-action`).toBeGreaterThan(0.004);
    }
  });

  it('leaves the props that hold their action visibly changed at action 1, by at least a centimetre', () => {
    for (const id of HOLDS) {
      expect(displacement(assembly, id, poseOf(id, 1), REST), `${id} held`).toBeGreaterThan(0.01);
    }
  });

  it('sends the wheel, the football and the bat round and home: at action 1 they sit exactly where they began', () => {
    // The wheel has no return (the lane cuts from 1 to 0), so any other end would show as a jump.
    for (const id of TURNS) {
      expect(displacement(assembly, id, poseOf(id, 1), REST), `${id} ends at rest`).toBeLessThan(1e-4);
    }
  });

  it('makes the fall the rise run backwards for every prop that has no phase of its own', () => {
    for (const id of PROP_IDS.filter((p) => !PHASED.includes(p))) {
      for (const a of SAMPLES) {
        expect(displacement(assembly, id, poseOf(id, a, { phase: 'rising' }), poseOf(id, a, { phase: 'falling' })), `${id} at ${a}`).toBeLessThan(1e-9);
      }
    }
  });

  it('keeps every part continuous: no vertex jumps between neighbouring values of action', () => {
    // Per 0.02 of action. The wheel is the fastest thing in the corridor: its rim travels furthest at the start of its spin-down.
    const LIMIT: Partial<Record<PropId, number>> = { 'bicycle-wheel': 0.2, 'cricket-bat': 0.08, football: 0.04, 'work-glove': 0.045, 'trophy-cabinet': 0.05, chess: 0.03, 'walking-boots': 0.07 };
    // The water drop is buried in the pot at rest and grows from nothing at the rose: it is checked on its own below.
    const visible = (id: PropId, a: number) => {
      const { drop: _drop, ...rest } = poseOf(id, a);
      return id === 'watering-can' ? rest : poseOf(id, a);
    };
    for (const id of PROP_IDS) {
      let previous = visible(id, 0);
      for (const a of SAMPLES.slice(1)) {
        const now = visible(id, a);
        expect(displacement(assembly, id, previous, now), `${id} ${(a - 0.02).toFixed(2)} to ${a.toFixed(2)}`).toBeLessThan(LIMIT[id] ?? 0.025);
        previous = now;
      }
    }
  });

  it('grows the water drop from nothing and lets it vanish small, so it never pops in or out', () => {
    const scales = SAMPLES.map((a) => poseOf('watering-can', a)['drop']?.scale).filter((s): s is number => s !== undefined);
    expect(scales.length).toBeGreaterThan(5);
    expect(scales[0]).toBeLessThan(0.25);
    expect(scales[scales.length - 1]).toBeLessThan(0.3);
    expect(Math.max(...scales)).toBeCloseTo(1, 6);
  });

  it('drops the water beside the pot, onto the saucer: not into the pot, where it could not be seen', () => {
    const [x] = dropAt(0.7).position;
    // Seen from the room the pot's wall hides anything inside its silhouette; the saucer reaches out past it.
    expect(x).toBeLessThan(POT.x - POT.rim - 0.01);
    expect(x).toBeGreaterThan(POT.x - POT.saucer + 0.005);
  });

  it('lets the water drop fall on the way up and never climb back to the rose', () => {
    const tip = dropAt(0.6).position;
    const floor = dropAt(0.82).position;
    expect(floor[1], 'the drop lands lower than it leaves').toBeLessThan(tip[1] - 0.1);
    // Falling: the drop's part is not posed at any value of action.
    for (const a of SAMPLES) {
      const set = poseOf('watering-can', a, { phase: 'falling' });
      expect(set['drop'], `no drop at ${a} on the way down`).toBeUndefined();
    }
    // Rising: it is posed only inside its short life, and its height never rises.
    let last = Infinity;
    for (const a of SAMPLES) {
      const set = poseOf('watering-can', a, { phase: 'rising' });
      const drop = set['drop'];
      if (!drop?.move) continue;
      expect(a).toBeGreaterThan(0.45);
      expect(a).toBeLessThan(0.92);
      expect(drop.move[1], `drop height at ${a}`).toBeLessThanOrEqual(last + 1e-9);
      last = drop.move[1];
    }
    expect(last).toBeLessThan(Infinity);
  });

  it('under reduced motion shows one small state at action 1 and nothing at action 0', () => {
    for (const id of PROP_IDS) {
      expect(displacement(assembly, id, poseOf(id, 0, { reduced: true }), REST), `${id} at 0`).toBeLessThan(1e-9);
      expect(displacement(assembly, id, poseOf(id, 1, { reduced: true }), REST), `${id} at 1`).toBeGreaterThan(0.004);
    }
  });
});

describe('the ivory fittings', () => {
  it('lightens a fitting by attention, by a modest amount', () => {
    expect(fittingGain(1, 0)).toBeCloseTo(ATTENTION_GAIN, 9);
    expect(fittingGain(0.5, 0)).toBeCloseTo(ATTENTION_GAIN / 2, 9);
    expect(fittingGain(0, 0)).toBe(0);
    expect(fittingGain(1, 0)).toBeLessThanOrEqual(0.4);
  });

  it('caps the idle glint at about 8 per cent, however hard it is driven', () => {
    expect(fittingGain(0, 1)).toBeLessThanOrEqual(0.0801);
    expect(fittingGain(0, 1)).toBeGreaterThan(0.05);
    expect(fittingGain(0, 7)).toBeLessThanOrEqual(0.0801);
    expect(GLINT_GAIN).toBeLessThanOrEqual(0.08);
  });

  it('applies the glint to one prop\'s fitting only, and by no more than the cap, in the built mesh', () => {
    const materials = createPropMaterials(null, null);
    const rig = createPropsRig(assembly, materials);
    const enamel = rig.meshes.find((m) => m.name === 'prop-enamel');
    if (!enamel) throw new Error('no enamel mesh');
    const colour = enamel.geometry.getAttribute('color');
    const rest = new Float32Array(colour.array as Float32Array);
    const animation = createPropAnimation();
    animation['bicycle-wheel'].glint = 1;
    rig.update(animation, NO_AMBIENT, false);
    let lit = 0;
    let worst = 0;
    const ours = assembly.fittings.filter((f) => f.prop === 'bicycle-wheel');
    const inFitting = (i: number): boolean => ours.some((f) => i >= f.start && i < f.end);
    for (let i = 0; i < colour.count; i += 1) {
      for (let k = 0; k < 3; k += 1) {
        const before = rest[i * 3 + k] ?? 0;
        const after = colour.array[i * 3 + k] ?? 0;
        if (inFitting(i)) {
          if (before > 0) {
            worst = Math.max(worst, after / before - 1);
            if (after > before) lit += 1;
          }
        } else {
          expect(after, `vertex ${i} of another prop is untouched`).toBe(before);
        }
      }
    }
    expect(lit).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(0.0801);
    expect(worst).toBeGreaterThan(0.07);
    // And back to rest exactly.
    animation['bicycle-wheel'].glint = 0;
    rig.update(animation, NO_AMBIENT, false);
    expect(Array.from(colour.array as Float32Array)).toEqual(Array.from(rest));
    rig.dispose();
    materials.dispose();
  });
});

describe('the rig', () => {
  it('poses a prop from its action and lets go of it again, exactly', () => {
    const materials = createPropMaterials(null, null);
    const rig = createPropsRig(assembly, materials);
    const animation = createPropAnimation();
    const bone = rig.root.getObjectByName('trophy-cabinet:door');
    if (!bone) throw new Error('no door bone');
    const rest = bone.quaternion.clone();
    animation['trophy-cabinet'].action = 0.5;
    expect(rig.update(animation, NO_AMBIENT, false)).toBe(true);
    expect(bone.quaternion.angleTo(rest)).toBeGreaterThan(0.2);
    animation['trophy-cabinet'].action = 0;
    rig.update(animation, NO_AMBIENT, false);
    expect(bone.quaternion.angleTo(rest)).toBeLessThan(1e-9);
    // Nothing changed: nothing to draw.
    expect(rig.update(animation, NO_AMBIENT, false)).toBe(false);
    rig.dispose();
    materials.dispose();
  });

  it('knows the way an action is running from the values it is given', () => {
    const materials = createPropMaterials(null, null);
    const rig = createPropsRig(assembly, materials);
    const animation = createPropAnimation();
    const drop = rig.root.getObjectByName('watering-can:drop');
    if (!drop) throw new Error('no drop bone');
    const buried = drop.position.clone();
    const moved = (a: number): number => {
      animation['watering-can'].action = a;
      rig.update(animation, NO_AMBIENT, false);
      return drop.position.distanceTo(buried);
    };
    // On the way up, mid-fall, the drop is out of the pot.
    expect(moved(0.7)).toBeGreaterThan(0.05);
    // The same value, reached on the way down: it is back in the pot, unseen.
    moved(1);
    expect(moved(0.7)).toBe(0);
    rig.dispose();
    materials.dispose();
  });
});
