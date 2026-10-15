import type { AtmosphereProfile } from '../../look/atmosphere/data.ts';
import { ATMOSPHERES } from '../../look/atmosphere/data.ts';
import type { AtmosphereLamp } from '../../look/atmosphere/lamps.ts';
import { OFFICE_LOOK, type LookProfile } from '../../look/profiles.ts';

export interface CodexRoomLookProfile extends Omit<LookProfile, 'space'> {
  readonly space: 'codex-room';
}

const AIR: AtmosphereProfile = {
  ...ATMOSPHERES.office,
  ceilingY: 3.4,
  heightFog: [
    { id: 'bench-air', y: 0, thins: 'up', scaleHeight: 2.4, density: 0.003, colour: '#D5D5CF' },
    { id: 'ceiling-air', y: 3.4, thins: 'down', scaleHeight: 0.7, density: 0.006, colour: '#D5D5CF' },
    { id: 'floor-air', y: 0, thins: 'up', scaleHeight: 0.4, density: 0.009, colour: '#D5D5CF' },
  ],
  farGlow: { from: 4, to: 7.5, colour: '#D5D5CF', strength: 0.025 },
  cones: { specs: [], maxVisible: 0 },
  haze: { amplitude: 0.12, scale: 6, drift: 0.004 },
  dust: { count: 180, sizePx: [1, 1.8], brightness: 0.45, drift: 0.004, rise: 0.003, volume: [6.4, 3.2, 7.2] },
  budget: { drawCalls: 0, triangles: 0 },
};

/** Room-local finish: the lower bloom energy protects the opal diffuser and polished brass. */
export const CODEX_ROOM_LOOK: CodexRoomLookProfile = {
  ...OFFICE_LOOK,
  space: 'codex-room',
  ao: { ...OFFICE_LOOK.ao, radius: 0.1, intensity: 0.62 },
  bloom: { strength: 0.03, radius: 0.12, levels: 2, threshold: 2.2, mobile: { enabled: false, scale: 0.5 } },
  lut: { intensity: 0.3, mobileIntensity: 0.36 },
  vignette: { amount: 0.05, inner: 0.5 },
  grain: { amount: 0.03 },
  exposure: OFFICE_LOOK.exposure,
  environment: { intensity: 0.05, ceilingKelvin: 3300, windowKelvin: 6500, windowWeight: 0.38, floorBounceWeight: 0.06 },
  atmosphere: AIR,
};

/** LookStack's shared profile type predates this room; the profile data itself stays room-scoped. */
export const CODEX_STACK_PROFILE = CODEX_ROOM_LOOK as unknown as LookProfile;

export const CODEX_ROOM_LAMPS: readonly AtmosphereLamp[] = [
  { id: 'codex-task-lamp', kind: 'codex-task', position: [0.82, 2.58, 4.1], direction: [-0.45, -0.88, -0.23] },
  { id: 'codex-threshold-lamp', kind: 'codex-threshold', position: [0, 2.05, 0.55], direction: [0, -1, 0] },
];
