import { CHAMBER_SLOTS, BLANK_DOORS, blankDoorAt, CORRIDOR, LOBBY } from '../layout.ts';
import { CORRIDOR_END_Z, CORRIDOR_WINDOW, CORRIDOR_END_BAYS } from './extent.ts';
import { BANKER_LAMP_SOURCE, LOBBY_WINDOW, PENDANTS } from './architecture/lobbyPlan.ts';
import { boardLampPosition } from './board.ts';
import { kelvinToLinear, type Rgb } from './colour.ts';
import type { Vec3 } from './math.ts';

/**
 * The static lamps. The brief caps real (dynamic) lights at six and forbids shadow maps, so the
 * sconces are not three.js lights: each is a point in a uniform array that the materials' shader
 * evaluates analytically (inverse-square with a softened core, no shadows, no animation). They
 * cost a few ALU per pixel, never change, and cannot pop as the visitor walks.
 *
 * Positions are the *virtual* source: set a little out from the wall so a wall washed by it shows
 * a soft pool instead of a ring around the fixture.
 */

export interface Lamp {
  id: string;
  kind: 'sconce' | 'lobby' | 'door-lamp';
  /** World position of the virtual source. */
  position: Vec3;
  /** Linear RGB scaled by intensity. */
  colour: Rgb;
  /** Softening distance: attenuation is 1 / (1 + (d / soft)^2). */
  soft: number;
  /** No contribution beyond this distance. */
  range: number;
}

/** Hard cap on analytic lamps: the shader's array length. */
export const MAX_LAMPS = 40;

/** Past this distance the fog has taken everything; lamps further on cost pixels for nothing. */
export const LAMP_CULL_Z = -46;

export interface SconceSlot {
  id: string;
  side: 'left' | 'right';
  z: number;
}

/**
 * Corridor sconces: every 7.2 m per wall, the right wall staggered 3.6 m behind the left, the
 * first on the left at the pier just past the first bay. Positions are bay boundaries, which
 * always fall on a pier between doors (checked by the layout tests).
 */
export function corridorSconceSlots(farZ: number = Math.max(LAMP_CULL_Z, CORRIDOR_END_Z)): SconceSlot[] {
  const { spacing, stagger } = CORRIDOR.sconce;
  const first = CORRIDOR.innerDoorZ - CORRIDOR.bay;
  const slots: SconceSlot[] = [];
  for (let k = 0; first - k * spacing > farZ; k += 1) {
    const zl = first - k * spacing;
    slots.push({ id: `sconce-L${k}`, side: 'left', z: zl });
    const zr = zl - stagger;
    if (zr > farZ) slots.push({ id: `sconce-R${k}`, side: 'right', z: zr });
  }
  return slots;
}

/**
 * The lobby's own sconces, spaced down its ten metres. They keep clear of the right wall's trophy
 * zone (the cabinet and its photograph stand between the second and third) and leave the left
 * wall's first third dark and quiet, where the brand's wordmark is set (the board has its own
 * picture light, the window its own cool one). The end wall's sconces would sit behind the open
 * inner doors.
 */
export const LOBBY_SCONCES: readonly { id: string; x: number; z: number; face: 'z+' | 'x+' | 'x-'; y?: number }[] = [
  { id: 'lobby-R1', x: LOBBY.width / 2, z: 2.1, face: 'x-' },
  { id: 'lobby-R2', x: LOBBY.width / 2, z: 4.15, face: 'x-' },
  { id: 'lobby-R3', x: LOBBY.width / 2, z: 8.0, face: 'x-' },
  { id: 'lobby-R4', x: LOBBY.width / 2, z: 9.9, face: 'x-' },
  { id: 'lobby-L1', x: -LOBBY.width / 2, z: 5.9, face: 'x+' },
  { id: 'lobby-L2', x: -LOBBY.width / 2, z: 9.0, face: 'x+' },
  // The props' own light (every pool has a visible source): over the trophy cabinet, above its top
  // and clear of the photograph's hook, and low over the watering can and its pot on the left wall.
  { id: 'lobby-cabinet', x: LOBBY.width / 2, z: 6.15, face: 'x-', y: 2.05 },
  { id: 'lobby-can', x: -LOBBY.width / 2, z: 7.6, face: 'x+', y: 1.85 },
];

/**
 * A sconce beside each corridor prop that would otherwise stand more than 1.6 m from any light
 * (the cricket bat, the walking boots, the work glove, the chess board). They are on the piers
 * the props use, at the sconces' height; the props lane's `placementOf` positions are the source
 * and a test checks every prop has a light within reach.
 */
export const PROP_SCONCES: readonly SconceSlot[] = [
  { id: 'sconce-bat', side: 'left', z: -5.55 },
  { id: 'sconce-boots', side: 'right', z: -10.34 },
  { id: 'sconce-glove', side: 'right', z: -17.4 },
  { id: 'sconce-chess', side: 'left', z: -20.1 },
];

/** How far the virtual source stands out from the wall it is mounted on. */
export const SCONCE_STANDOFF = 0.32;

/** Peak-normalised colour of a source at `kelvin`, scaled to `intensity`. */
const lampColour = (kelvin: number, intensity: number): Rgb => {
  const c = kelvinToLinear(kelvin);
  return [c[0] * intensity, c[1] * intensity, c[2] * intensity];
};

export interface LampTuning {
  corridorIntensity: number;
  lobbyIntensity: number;
  /** Multiplier on a door wash's strength (1 = the data's strength relative to a sconce). */
  doorWash: number;
  /** Softening distances: how broad each pool is before it falls away. */
  corridorSoft: number;
  lobbySoft: number;
}

export const DEFAULT_LAMP_TUNING: LampTuning = {
  corridorIntensity: 13,
  lobbyIntensity: 11,
  doorWash: 1.2,
  corridorSoft: 0.55,
  lobbySoft: 0.7,
};

/**
 * A door whose character names an external lamp wash (ADR 0004): where it sits, and the 2700-3600 K
 * wash the data asks for. `strength` is the door face's light relative to a sconce's pool centre.
 */
export interface DoorLamp {
  key: string;
  side: 'left' | 'right';
  z: number;
  /** Top of the door opening, metres. */
  top: number;
  kelvin: number;
  strength: number;
}

/** Every analytic lamp, nearest the lobby first. */
export function buildLamps(doorLamps: readonly DoorLamp[], tuning: LampTuning = DEFAULT_LAMP_TUNING): Lamp[] {
  const { y, kelvin } = CORRIDOR.sconce;
  const lamps: Lamp[] = [];
  for (const l of LOBBY_SCONCES) {
    const ly = l.y ?? y;
    const position: Vec3 =
      l.face === 'z+'
        ? [l.x, ly, l.z + SCONCE_STANDOFF]
        : [l.x + (l.face === 'x-' ? -SCONCE_STANDOFF : SCONCE_STANDOFF), ly, l.z];
    lamps.push({ id: l.id, kind: 'lobby', position, colour: lampColour(kelvin, tuning.lobbyIntensity), soft: tuning.lobbySoft, range: 7 });
  }
  // The picture light over the notice board, 3000 K, washing the felt and the clippings. It rides
  // on the board, so it swivels with it.
  lamps.push({
    id: 'lobby-board',
    kind: 'lobby',
    position: boardLampPosition(),
    colour: lampColour(3000, tuning.lobbyIntensity * 0.85),
    soft: 0.6,
    range: 3,
  });
  // Two pendants down the middle of the lobby: the room's general light, a little warmer than the walls'.
  for (const z of PENDANTS) {
    lamps.push({ id: `lobby-pendant-${z}`, kind: 'lobby', position: [0, 3.0, z], colour: lampColour(2800, tuning.lobbyIntensity * 0.8), soft: 0.95, range: 7.2 });
  }
  // The high window's daylight: a pale, slightly warm overcast morning (5200 K), a faint wash on the ceiling and the far
  // wall. It was a cold 8200 K until founder feedback that shadows must read amber or brown, never blue-grey.
  lamps.push({
    id: 'lobby-window',
    kind: 'lobby',
    position: [-LOBBY.width / 2 + 0.7, 3.2, LOBBY_WINDOW.fan.s],
    colour: lampColour(5200, tuning.lobbyIntensity * 0.45),
    soft: 1.1,
    range: 5.6,
  });
  // The picture light over the fascia, raking the gilt lettering from above and in front.
  lamps.push({
    id: 'lobby-fascia',
    kind: 'lobby',
    position: [0, 3.78, CORRIDOR.innerDoorZ + 0.5],
    colour: lampColour(kelvin, tuning.lobbyIntensity * 0.9),
    soft: 0.65,
    range: 3.4,
  });
  lamps.push({
    id: 'lobby-banker-lamp',
    kind: 'lobby',
    position: BANKER_LAMP_SOURCE,
    colour: lampColour(2900, tuning.lobbyIntensity * 0.42),
    soft: 0.38,
    range: 2.8,
  });
  // Low amber daylight enters at the far window and gives its bar-shaped floor patches a source.
  lamps.push({
    id: 'corridor-window',
    kind: 'lobby',
    position: [CORRIDOR_WINDOW.x, CORRIDOR_WINDOW.bottom + CORRIDOR_WINDOW.height * 0.55, CORRIDOR_END_Z + 0.22],
    colour: lampColour(CORRIDOR_WINDOW.kelvin, tuning.corridorIntensity * 1.05),
    soft: 2.8,
    range: 10.5,
  });
  for (const s of [...corridorSconceSlots(CORRIDOR_END_Z), ...PROP_SCONCES.filter((slot) => slot.z > CORRIDOR_END_Z)]) {
    const wall = s.side === 'left' ? -CORRIDOR.width / 2 : CORRIDOR.width / 2;
    const x = wall + (s.side === 'left' ? SCONCE_STANDOFF : -SCONCE_STANDOFF);
    lamps.push({ id: s.id, kind: 'sconce', position: [x, y, s.z], colour: lampColour(kelvin, tuning.corridorIntensity), soft: tuning.corridorSoft, range: 6.2 });
  }
  // Door washes: a small, short-ranged glow in front of each door whose character asks for one,
  // at the colour temperature and strength the data gives. Static and shared with the sconces'
  // shader loop, so a wash costs no real light and no draw call.
  for (const slot of doorLamps) {
    const wall = slot.side === 'left' ? -CORRIDOR.width / 2 : CORRIDOR.width / 2;
    // Set well out from the wall: a lamp this close to the door it hangs over would only graze it.
    const x = wall + (slot.side === 'left' ? 0.5 : -0.5);
    lamps.push({
      id: `door-lamp-${slot.key}`,
      kind: 'door-lamp',
      position: [x, Math.min(slot.top - 0.25, 2.7), slot.z],
      colour: lampColour(slot.kelvin, tuning.corridorIntensity * slot.strength * tuning.doorWash),
      soft: 0.75,
      range: 3.6,
    });
  }
  return lamps.filter((l) => l.position[2] > Math.max(LAMP_CULL_Z, CORRIDOR_END_Z)).slice(0, MAX_LAMPS);
}

/** Every door opening on a side, for placement checks: [z0, z1] extents including any surround. */
export function doorExtents(side: 'left' | 'right', specOf: (slotKey: string) => { width: number; surround?: { width: number } | undefined } | null): [number, number][] {
  const out: [number, number][] = [];
  for (const slot of [...CHAMBER_SLOTS, ...BLANK_DOORS]) {
    if (slot.side !== side) continue;
    const spec = specOf(slot.key);
    if (!spec) continue;
    const w = spec.surround?.width ?? spec.width;
    out.push([slot.z - w / 2, slot.z + w / 2]);
  }
  for (let bay = CORRIDOR.walkableBays; bay < CORRIDOR_END_BAYS; bay += 1) {
    const spec = blankDoorAt(bay, side);
    if (!spec) continue;
    const z = CORRIDOR.innerDoorZ - CORRIDOR.bay * (bay + 0.5);
    const w = spec.surround?.width ?? spec.width;
    out.push([z - w / 2, z + w / 2]);
  }
  return out;
}

/** Pack lamps into the two uniform arrays the shader reads: (xyz, range) and (rgb, soft). */
export function packLamps(lamps: readonly Lamp[]): { position: Float32Array; colour: Float32Array } {
  const position = new Float32Array(MAX_LAMPS * 4);
  const colour = new Float32Array(MAX_LAMPS * 4);
  lamps.slice(0, MAX_LAMPS).forEach((l, i) => {
    position.set([l.position[0], l.position[1], l.position[2], l.range], i * 4);
    colour.set([l.colour[0], l.colour[1], l.colour[2], l.soft], i * 4);
  });
  return { position, colour };
}
