import { CHAMBERS } from '@tqw/engine';
import { describe, expect, it } from 'vitest';
import { CHAMBER_SLOTS } from '../corridor/layout.ts';
import { CHAMBER_MODULES } from './registry.ts';

describe('chamber modules', () => {
  it.each(CHAMBERS.map((c) => [c.id, c] as const))('%s has a door, and code exactly when open', (id, entry) => {
    const module = CHAMBER_MODULES[id];
    expect(module.door).toBeDefined();
    expect(typeof module.load === 'function').toBe(entry.status === 'open');
  });

  it.each(CHAMBERS.map((c) => [c.id, c] as const))('%s door plaque agrees with the registry', (id, entry) => {
    const plaque = CHAMBER_MODULES[id].door.plaque;
    if (plaque) expect(plaque.text).toBe(entry.plaque);
  });

  it('every chamber has exactly one corridor slot, on its registry side, in registry order', () => {
    expect(CHAMBER_SLOTS.map((s) => s.chamber)).toEqual(CHAMBERS.map((c) => c.id));
    for (const slot of CHAMBER_SLOTS) {
      expect(slot.side).toBe(CHAMBERS.find((c) => c.id === slot.chamber)?.side);
    }
    const zs = CHAMBER_SLOTS.map((s) => s.z);
    expect([...zs].sort((a, b) => b - a)).toEqual(zs);
  });
});
