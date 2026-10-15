import { describe, expect, it } from 'vitest';
import { opticalDepth } from '../../look/atmosphere/data.ts';
import { APARTMENT_ROOM_LOOK } from './look.ts';

describe('the Apartment room look', () => {
  it('lifts shadow detail with soft environment bounce while keeping the practicals as focal highlights', () => {
    expect(APARTMENT_ROOM_LOOK.lut).toMatchObject({ intensity: 0.18, mobileIntensity: 0.18 });
    expect(APARTMENT_ROOM_LOOK.environment).toMatchObject({
      intensity: 0.09,
      ceilingKelvin: 3200,
      windowKelvin: 5600,
      windowWeight: 1.55,
      floorBounceWeight: 1.0,
    });
    expect(APARTMENT_ROOM_LOOK.environment.floorBounceWeight).toBeGreaterThan(0.12);
  });

  it('keeps the window cool and the white-grey air faint', () => {
    const window = APARTMENT_ROOM_LOOK.atmosphere.cones.specs.find(({ lamp }) => lamp === 'window');
    expect(window?.kelvin).toBe(4700);
    const depth = opticalDepth(APARTMENT_ROOM_LOOK.atmosphere.heightFog, 1.62, 10);
    const veil = 1 - Math.exp(-depth);
    expect(veil).toBeGreaterThanOrEqual(0.01);
    expect(veil).toBeLessThanOrEqual(0.02);
  });
});
