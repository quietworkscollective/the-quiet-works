import { describe, expect, it } from 'vitest';
import { EXCHANGE_LAMP, EXCHANGE_LIGHTING, EXCHANGE_LIGHT_COUNT, EXCHANGE_OPERATOR_GLOW } from './lighting.ts';
import { EXCHANGE_ROOM_LOOK } from './look.ts';

describe('Exchange lighting', () => {
  it('spends five real lights of the six allowed, with no hemisphere', () => {
    expect(EXCHANGE_LIGHT_COUNT).toBe(5);
    expect(Object.keys(EXCHANGE_LIGHTING).sort()).toEqual(['clerestory', 'desk', 'ledge', 'operator', 'underDesk']);
  });

  it('drives the line lamps in three falling steps; their displayed ratios are held by exchange-guards.spec.ts', () => {
    expect(EXCHANGE_LAMP.full).toBe(1);
    expect(EXCHANGE_LAMP.dim).toBeLessThan(EXCHANGE_LAMP.full);
    expect(EXCHANGE_LAMP.night).toBeLessThan(EXCHANGE_LAMP.dim);
  });

  it('lets only the full lamp and the operator lamp reach the bloom', () => {
    const { threshold } = EXCHANGE_ROOM_LOOK.bloom;
    expect(EXCHANGE_LAMP.peak * EXCHANGE_LAMP.full).toBeGreaterThan(threshold);
    expect(EXCHANGE_LAMP.peak * EXCHANGE_LAMP.dim).toBeLessThan(threshold);
    expect(EXCHANGE_OPERATOR_GLOW.peak).toBeGreaterThan(EXCHANGE_LAMP.peak);
  });

  it('makes the operator lamp the warmest source in the room', () => {
    const others = [EXCHANGE_LIGHTING.desk, EXCHANGE_LIGHTING.ledge, EXCHANGE_LIGHTING.underDesk, EXCHANGE_LIGHTING.clerestory];
    for (const light of others) expect(EXCHANGE_LIGHTING.operator.kelvin).toBeLessThan(light.kelvin);
  });
});
