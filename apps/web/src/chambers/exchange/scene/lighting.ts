export const EXCHANGE_LIGHTING = {
  warmReturn: { relative: 0.2, intensity: 1.6 },
  desk: { relative: 1, kelvin: 2700, intensity: 1.35, position: [-0.90, 1.65, -5.31] as const },
  clerestory: { relative: 0.4, kelvin: 5000, intensity: 8, position: [1.55, 10.8, -7.2] as const },
  equipment: { relative: 0.55, kelvin: 3200, intensity: 2.1, position: [0.55, 3.1, -7.72] as const },
  underDesk: { relative: 0.3, kelvin: 2900, intensity: 0.48, position: [0.32, 0.46, -5.35] as const },
  galleryBounce: { relative: 0.4, kelvin: 3500, intensity: 1.2, position: [0.18, 6.7, -7.55] as const },
  indicator: { active: 0.38, idle: 0.03 },
} as const;

export const EXCHANGE_LIGHT_COUNT = 6;
