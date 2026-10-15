/**
 * What a door sounds like, derived from the door kit (`DoorSpec`) the corridor builds it from.
 * A door is data, so its sound is data too: the family sets the leaf's body and how metallic it
 * is, the handle sets the mechanism, the closure sets the rattle of a sealed door, the glazing
 * and size trim it. A future chamber that ships a door spec gets a plausible door without audio
 * code of its own.
 */
import type { ChamberId } from '@tqw/engine';
import type { DoorFamily, DoorSpec, Glazing, Handle } from '../corridor/doorKit.ts';
import { SWING_EASING } from '../timing.ts';

export interface DoorFeel {
  handle: Handle;
  /** 0 timber .. 1 steel: how much of the sound is ring and crisp click rather than knock. */
  metal: number;
  /** The leaf's body resonance in Hz and how long it rings, in seconds. Bigger doors sit lower. */
  bodyHz: number;
  bodyDecay: number;
  /** The latch's click: centre frequency and loudness relative to a plain timber latch. */
  latchHz: number;
  latchWeight: number;
  /** Hinge friction (a dry scrape) and groan (a low strain on a heavy leaf), each 0..1. */
  creak: number;
  groan: number;
  /** The air a swinging leaf pushes: lowpass in Hz and loudness. */
  airHz: number;
  airWeight: number;
  /** Glass rattling in its frame, 0 for a solid leaf. */
  glass: number;
}

interface FamilyFeel {
  metal: number;
  /** Body resonance of a 1 m² leaf. */
  bodyHz: number;
  bodyDecay: number;
  latchHz: number;
  latchWeight: number;
  creak: number;
  groan: number;
  airWeight: number;
}

const FAMILY: Record<DoorFamily, FamilyFeel> = {
  'panelled-timber': { metal: 0.2, bodyHz: 170, bodyDecay: 0.12, latchHz: 1900, latchWeight: 0.8, creak: 0.55, groan: 0.1, airWeight: 0.8 },
  'glazed-office': { metal: 0.3, bodyHz: 210, bodyDecay: 0.09, latchHz: 2300, latchWeight: 0.7, creak: 0.3, groan: 0, airWeight: 0.7 },
  'steel-insertion': { metal: 0.9, bodyHz: 230, bodyDecay: 0.16, latchHz: 2800, latchWeight: 1, creak: 0.15, groan: 0.3, airWeight: 0.9 },
  'ceremonial-double': { metal: 0.5, bodyHz: 135, bodyDecay: 0.35, latchHz: 1500, latchWeight: 1.1, creak: 0.35, groan: 0.7, airWeight: 1.5 },
};

const GLASS: Record<Glazing, number> = { none: 0, wired: 0.5, frosted: 0.4, reeded: 0.4, clear: 0.7, porthole: 0.3 };

/** A 2.2 m² leaf is the reference size; the Office door is 2.4 m². */
const REFERENCE_AREA = 2.2;

export function doorFeel(spec: DoorSpec): DoorFeel {
  const family = FAMILY[spec.family];
  const area = Math.max(0.5, spec.width * spec.height);
  // Mass scales with area; a leaf four times the size rings an octave or so lower and longer.
  const size = (REFERENCE_AREA / area) ** 0.25;
  return {
    handle: spec.handle,
    metal: family.metal,
    bodyHz: family.bodyHz * size,
    bodyDecay: family.bodyDecay / size,
    latchHz: family.latchHz,
    latchWeight: family.latchWeight,
    creak: family.creak,
    groan: Math.min(1, family.groan * (area / REFERENCE_AREA) ** 0.5),
    airHz: 650 * size,
    airWeight: family.airWeight * Math.min(1.6, (area / REFERENCE_AREA) ** 0.5),
    glass: GLASS[spec.material.glazing],
  };
}

export type Closure = NonNullable<DoorSpec['closure']>;

/** How a sealed door resists. A door that says nothing is bolted. */
export function closureOf(spec: DoorSpec): Closure {
  return spec.closure ?? 'bolt';
}

/**
 * The air that comes through as the camera walks in, before the chamber's own room tone takes
 * over. It hands off to the real ambience, so it matches it in character and stays quiet.
 */
export interface AirProfile {
  /** Lowpass in Hz: how warm and enclosed the room is. */
  lowpass: number;
  /** Peak level relative to the standard chamber air. */
  level: number;
  /** Faint tonal machinery, as [Hz, weight]. Empty for a room with no hum. */
  hum: readonly (readonly [number, number])[];
  /** Reverb send: a dry office, a large cold hall. */
  wet: number;
}

export const AIR: Record<ChamberId, AirProfile> = {
  // The Office: warm, dry, ventilated, with the duct resonance near D2 (73.42 Hz) and A2 that its
  // own ambience carries. The other three doors stay sealed in this build; their profiles only
  // keep a future door from borrowing the Office's room.
  'certification-office': { lowpass: 850, level: 1, hum: [[73.42, 1], [110, 0.8]], wet: 0.05 },
  exchange: { lowpass: 780, level: 0.85, hum: [[60, 0.35], [120, 0.2]], wet: 0.16 },
  apartment: { lowpass: 1100, level: 0.7, hum: [], wet: 0.04 },
  'tomorrow-engine': { lowpass: 700, level: 1, hum: [], wet: 0.2 },
  'great-atrium': { lowpass: 1500, level: 0.9, hum: [], wet: 0.6 },
  'outline-room': { lowpass: 1450, level: 0.62, hum: [], wet: 0.06 },
};

/**
 * Speed of a leaf through its swing, sampled at `points` equal steps in time and scaled so the
 * fastest is 1. It is the derivative of the swing easing, so air and friction follow the same
 * curve the door is drawn with: nothing at the start, most of the noise at the middle, nothing
 * as it settles.
 */
export function swingVelocity(points: number): number[] {
  const [x1, y1, x2, y2] = SWING_EASING;
  const bezier = (t: number, a: number, b: number): number => {
    const u = 1 - t;
    return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
  };
  const slope = (t: number, a: number, b: number): number => {
    const u = 1 - t;
    return 3 * u * u * a + 6 * u * t * (b - a) + 3 * t * t * (1 - b);
  };
  const velocities: number[] = [];
  for (let i = 0; i < points; i += 1) {
    const time = points === 1 ? 0 : i / (points - 1);
    // Find the curve parameter whose x is this fraction of the swing's duration.
    let lo = 0;
    let hi = 1;
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const mid = (lo + hi) / 2;
      if (bezier(mid, x1, x2) < time) lo = mid;
      else hi = mid;
    }
    const t = (lo + hi) / 2;
    const dx = slope(t, x1, x2);
    velocities.push(dx === 0 ? 0 : slope(t, y1, y2) / dx);
  }
  const peak = Math.max(...velocities, Number.EPSILON);
  return velocities.map((v) => Math.max(0, v / peak));
}
