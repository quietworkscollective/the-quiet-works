import { APARTMENT_LOOK, type LookProfile } from '../../look/profiles.ts';

/** The Apartment's authored grade stays local so it cannot invalidate other rooms' bakes. */
export const APARTMENT_ROOM_LOOK: LookProfile = {
  ...APARTMENT_LOOK,
  lut: { ...APARTMENT_LOOK.lut, intensity: 0.18, mobileIntensity: 0.18 },
  environment: {
    ...APARTMENT_LOOK.environment,
    intensity: 0.09,
    ceilingKelvin: 3200,
    windowKelvin: 5600,
    windowWeight: 1.55,
    floorBounceWeight: 1.0,
  },
  atmosphere: {
    ...APARTMENT_LOOK.atmosphere,
    farGlow: { ...APARTMENT_LOOK.atmosphere.farGlow, colour: '#C1BDAF', strength: 0.018 },
    heightFog: APARTMENT_LOOK.atmosphere.heightFog.map((layer) => ({ ...layer, density: layer.density * 0.35 })),
    cones: {
      ...APARTMENT_LOOK.atmosphere.cones,
      specs: APARTMENT_LOOK.atmosphere.cones.specs.map((spec) => spec.lamp === 'window'
        ? { ...spec, kelvin: 4700, opacity: 0.015, patch: 0.42 }
        : { ...spec, opacity: 0.025, patch: 0.22 }),
    },
    haze: { ...APARTMENT_LOOK.atmosphere.haze, amplitude: 0.14 },
  },
};
