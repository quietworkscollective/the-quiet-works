import { CORRIDOR, LOBBY } from '../../layout.ts';

/**
 * Where the lobby's furnishings go (ADR 0004: a lobby deepened to LOBBY.startZ with room to
 * linger). One place for every position so the geometry, the lamps, the ambient motions and the
 * clear-zone tests read the same numbers. Heights are metres above the floor; `s` and `z` are
 * along the lobby (z runs from the inner doors at CORRIDOR.innerDoorZ to the entrance at
 * LOBBY.startZ).
 */

/** Mid-depth of the lobby: the props contract (props.ts) measures its lobby anchors from here. */
export const LOBBY_MID_Z = (CORRIDOR.innerDoorZ + LOBBY.startZ) / 2;

/**
 * The right wall's reserved zone: the trophy cabinet, its team shirts and the team photograph
 * (props.ts anchors, which the props lane may move by up to half a metre). Nothing of the world
 * lane's stands in it below 2.2 m.
 */
export const TROPHY_ZONE = { z0: LOBBY_MID_Z - 0.6 - 0.5 - 0.5, z1: LOBBY_MID_Z + 0.9 + 0.21 + 0.5, top: 2.2 } as const;

/** A high window in the left wall above the notice board, with an extractor fan in its middle light. */
export const LOBBY_WINDOW = {
  /** Along the wall (z). */
  s: [2.15, 4.25] as readonly [number, number],
  y: [2.72, 3.78] as readonly [number, number],
  /** The wall's depth behind the window, to the light well. */
  reveal: 0.36,
  /** Centre of the fan, and its blades' radius. */
  fan: { s: 3.2, y: 3.25, depth: -0.12, radius: 0.255 },
  /** The mullions' centres, dividing three lights. */
  mullions: [2.865, 3.535] as readonly number[],
} as const;

/** The fan's service switch, and the paper tag tied to it. */
export const FAN_SWITCH = { s: 4.52, y: 2.08 } as const;

/** The lobby clock on the end wall, right of the fascia. */
export const LOBBY_CLOCK = { x: 1.82, y: 3.05, radius: 0.25 } as const;

/** Two pendant lamps down the middle of the lobby. */
export const PENDANTS = [4.0, 8.0] as const;

/** The waiting bench against the right wall, by the entrance. */
export const BENCH_ZONE = { z0: 8.85, z1: 10.65 } as const;

/** A small hall table on the free stretch of the left wall, clear of the board and watering can. */
export const HALL_TABLE = {
  z0: 4.55,
  z1: 5.35,
  depth: 0.48,
  topY: 0.78,
  lampZ: 4.95,
} as const;

/** Banker lamp base on the table, and the warm source beneath its shade. */
export const BANKER_LAMP_ORIGIN = [-LOBBY.width / 2 + HALL_TABLE.depth / 2 + 0.035, HALL_TABLE.topY, HALL_TABLE.lampZ] as const;
export const BANKER_LAMP_SOURCE = [BANKER_LAMP_ORIGIN[0] + 0.16, BANKER_LAMP_ORIGIN[1] + 0.34, BANKER_LAMP_ORIGIN[2]] as const;

/** Ceiling beams across the lobby, between the pendants. */
export const LOBBY_BEAMS = [3.0, 5.0, 7.0, 9.0] as const;
