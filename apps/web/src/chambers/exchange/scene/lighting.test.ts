import { describe, expect, it } from 'vitest';
import { EXCHANGE_LIGHT_COUNT, EXCHANGE_LIGHTING } from './lighting.ts';

describe('Exchange light balance', () => {
  it('keeps a broad warm return, a softer desk pool and restrained grazing fills', () => {
    expect(EXCHANGE_LIGHTING.desk.relative).toBe(1);
    expect(EXCHANGE_LIGHTING.clerestory.relative / EXCHANGE_LIGHTING.desk.relative).toBeCloseTo(0.4);
    expect(EXCHANGE_LIGHTING.warmReturn.relative / EXCHANGE_LIGHTING.desk.relative).toBeGreaterThanOrEqual(0.15);
    expect(EXCHANGE_LIGHTING.warmReturn.relative / EXCHANGE_LIGHTING.desk.relative).toBeLessThanOrEqual(0.25);
    expect(EXCHANGE_LIGHTING.equipment.relative).toBeGreaterThan(0.45);
    expect(EXCHANGE_LIGHTING.underDesk.relative).toBeGreaterThan(0.2);
    expect(EXCHANGE_LIGHTING.desk.kelvin).toBe(2700);
    expect(EXCHANGE_LIGHTING.clerestory.kelvin).toBe(5000);
    expect(EXCHANGE_LIGHTING.desk.intensity).toBeLessThan(2);
    expect(EXCHANGE_LIGHTING.clerestory.intensity).toBeGreaterThan(EXCHANGE_LIGHTING.desk.intensity);
    expect(EXCHANGE_LIGHTING.warmReturn.intensity).toBeGreaterThan(1);
    expect(EXCHANGE_LIGHTING.warmReturn.intensity).toBeLessThanOrEqual(1.7);
    expect(EXCHANGE_LIGHTING.equipment.intensity).toBeLessThanOrEqual(2.4);
    expect(EXCHANGE_LIGHTING.underDesk.intensity).toBeLessThanOrEqual(0.5);
    expect(EXCHANGE_LIGHTING.galleryBounce.intensity).toBeLessThanOrEqual(1.5);
    expect(EXCHANGE_LIGHT_COUNT).toBeLessThanOrEqual(6);
  });

  it('keeps active and idle lamp materials below the display clipping range', () => {
    expect(EXCHANGE_LIGHTING.indicator.active).toBeLessThanOrEqual(0.4);
    expect(EXCHANGE_LIGHTING.indicator.idle).toBeLessThan(EXCHANGE_LIGHTING.indicator.active);
    const deskEmitter = [-0.24, 1.285, -5.31];
    const deskOffset = Math.hypot(...EXCHANGE_LIGHTING.desk.position.map((value, axis) => value - (deskEmitter[axis] ?? 0)));
    expect(deskOffset).toBeGreaterThan(0.35);
    const clerestoryEmitter = [1.83, 11.17, -5.18];
    const sourceOffset = Math.hypot(...EXCHANGE_LIGHTING.clerestory.position.map((value, axis) => value - (clerestoryEmitter[axis] ?? 0)));
    expect(sourceOffset).toBeGreaterThan(1);
  });
});
