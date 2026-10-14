import { describe, expect, it } from 'vitest';
import { CHAMBERS, type ChamberId } from '@tqw/engine';
import { CHAMBER_MODULES } from '../chambers/registry.ts';
import type { DoorSpec } from '../corridor/doorKit.ts';
import { AIR, closureOf, doorFeel, swingVelocity } from './spineDoors.ts';

const door = (id: ChamberId): DoorSpec => CHAMBER_MODULES[id].door;

describe('what a door sounds like', () => {
  it('is ring and a crisp click for steel and knock for timber', () => {
    const steel = doorFeel(door('certification-office'));
    const timber = doorFeel(door('apartment'));
    expect(steel.metal).toBeGreaterThan(0.7);
    expect(timber.metal).toBeLessThan(0.4);
    expect(steel.latchHz).toBeGreaterThan(timber.latchHz);
  });

  it('puts a bigger leaf lower and longer: the Atrium is heavier than the Apartment, the Office in between', () => {
    const atrium = doorFeel(door('great-atrium'));
    const apartment = doorFeel(door('apartment'));
    const tomorrow = doorFeel(door('tomorrow-engine'));
    expect(atrium.bodyHz).toBeLessThan(apartment.bodyHz);
    expect(atrium.bodyHz).toBeLessThan(tomorrow.bodyHz);
    expect(atrium.bodyDecay).toBeGreaterThan(apartment.bodyDecay);
    expect(atrium.airHz).toBeLessThan(apartment.airHz);
    expect(atrium.airWeight).toBeGreaterThan(apartment.airWeight);
    expect(atrium.groan).toBeGreaterThan(apartment.groan);
  });

  it('keeps every real door within a range a small speaker can carry: the body is never under 85 Hz', () => {
    for (const { id } of CHAMBERS) {
      const feel = doorFeel(door(id));
      expect(feel.bodyHz, id).toBeGreaterThanOrEqual(85);
      expect(feel.bodyHz, id).toBeLessThan(300);
      expect(feel.bodyDecay, id).toBeGreaterThan(0.04);
      expect(feel.bodyDecay, id).toBeLessThan(0.6);
    }
  });

  it('carries the handle through from the kit, so a lever, a knob, a wheel and a ring each sound as themselves', () => {
    expect(doorFeel(door('certification-office')).handle).toBe('lever');
    expect(doorFeel(door('apartment')).handle).toBe('knob');
    expect(doorFeel(door('tomorrow-engine')).handle).toBe('wheel');
    expect(doorFeel(door('great-atrium')).handle).toBe('ring-pull');
  });

  it('adds the rattle of glass only where the door has glass', () => {
    expect(doorFeel(door('apartment')).glass).toBe(0);
    expect(doorFeel(door('certification-office')).glass).toBeGreaterThan(0); // wired
    expect(doorFeel(door('great-atrium')).glass).toBeGreaterThan(doorFeel(door('certification-office')).glass); // clear
  });

  it('reads the closure of a sealed door, and treats an unsaid closure as a bolt', () => {
    expect(closureOf(door('apartment'))).toBe('bolt');
    expect(closureOf(door('tomorrow-engine'))).toBe('seal');
    expect(closureOf(door('great-atrium'))).toBe('chain');
    const bare: DoorSpec = { ...door('apartment') };
    delete bare.closure;
    expect(closureOf(bare)).toBe('bolt');
  });

  it('keeps a zero-size spec finite instead of dividing by nothing', () => {
    const tiny: DoorSpec = { ...door('apartment'), width: 0, height: 0 };
    const feel = doorFeel(tiny);
    for (const value of Object.values(feel)) if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
  });
});

describe('the air that comes through an open door', () => {
  it('has a profile for every chamber', () => {
    for (const { id } of CHAMBERS) expect(AIR[id], id).toBeDefined();
  });

  it('carries the Office duct resonance at D2 and A2 and nobody else a hum', () => {
    expect(AIR['certification-office'].hum.map(([hz]) => hz)).toEqual([73.42, 110]);
    for (const id of ['apartment', 'tomorrow-engine', 'great-atrium'] as const) expect(AIR[id].hum, id).toEqual([]);
  });

  it('keeps the Office air dry and the Atrium air large', () => {
    expect(AIR['certification-office'].wet).toBeLessThan(0.1);
    expect(AIR['great-atrium'].wet).toBeGreaterThan(0.4);
  });
});

describe('the speed of a swinging leaf', () => {
  const v = swingVelocity(64);

  it('starts and ends at rest, and is fastest in the middle', () => {
    expect(v[0]).toBeCloseTo(0, 6);
    expect(v.at(-1)).toBeCloseTo(0, 2);
    const peakAt = v.indexOf(Math.max(...v)) / (v.length - 1);
    expect(peakAt).toBeGreaterThan(0.3);
    expect(peakAt).toBeLessThan(0.55);
    expect(Math.max(...v)).toBeCloseTo(1, 9);
  });

  it('is the derivative of the swing easing, not a generic bell: it rises faster than it falls', () => {
    // cubic-bezier(0.4, 0, 0.2, 1) leaves slowly and arrives slowly, but spends longer decelerating.
    const peak = v.indexOf(Math.max(...v));
    expect(peak).toBeLessThan(v.length / 2);
    const rising = v.slice(0, peak).reduce((a, b) => a + b, 0) / peak;
    const falling = v.slice(peak).reduce((a, b) => a + b, 0) / (v.length - peak);
    expect(falling).toBeLessThan(rising);
  });

  it('never goes negative and stays finite at any resolution', () => {
    for (const points of [1, 2, 3, 16, 200]) {
      const curve = swingVelocity(points);
      expect(curve).toHaveLength(points);
      expect(curve.every((x) => Number.isFinite(x) && x >= 0 && x <= 1 + 1e-9)).toBe(true);
    }
  });
});
