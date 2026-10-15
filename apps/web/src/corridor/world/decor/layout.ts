import { CORRIDOR, LOBBY } from '../../layout.ts';
import { BANKER_LAMP_ORIGIN } from '../architecture/lobbyPlan.ts';
import { radiatorMounts } from '../fixtures.ts';
import type { Vec3 } from '../math.ts';

export interface DecorPlacement {
  readonly position: Vec3;
  readonly yaw: number;
  readonly scale?: number;
}

export interface RadiatorPlacement extends DecorPlacement {
  readonly model: 'radiator6' | 'radiator10';
}

/** Fixed locations for the low-poly copies of the scanned corridor furnishings. */
export const DECOR_LAYOUT = {
  bench: { position: [LOBBY.width / 2 - 0.25, 0, 9.75], yaw: -Math.PI / 2, scale: 1 } satisfies DecorPlacement,
  plants: [
    { position: [-1.15, 0, -31.4], yaw: 0 },
    { position: [1.15, 0, -22.4], yaw: 0 },
  ] satisfies readonly DecorPlacement[],
  clock: { position: [CORRIDOR.width / 2 - 0.1, 2.72, -22.4], yaw: -Math.PI / 2 } satisfies DecorPlacement,
  frame: { position: [-CORRIDOR.width / 2 + 0.1, 2.48, -31.4], yaw: Math.PI / 2 } satisfies DecorPlacement,
  radiators: radiatorMounts().map((mount, index): RadiatorPlacement => ({
    position: mount.position,
    yaw: mount.yaw,
    model: index === 2 || index === 4 ? 'radiator6' : 'radiator10',
  })),
  bankerLamp: {
    position: BANKER_LAMP_ORIGIN,
    yaw: Math.PI / 2,
  } satisfies DecorPlacement,
} as const;

