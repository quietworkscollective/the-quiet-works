import { smoothstep } from '../math.ts';

/**
 * The shape of each ambient motion (art consult 5, "Ambient life"), as pure functions of the time
 * since its window opened, so the numbers the consult gives are numbers a test can check. Every
 * motion eases in and out (no corner in the velocity), returns to rest by the end of its window,
 * and is small: the corridor is lived in, not animated.
 */

/** Smooth rise from 0 at `a` to 1 at `b`, with no corner at either end. */
const ease = (a: number, b: number, t: number): number => smoothstep(a, b, t);

/** A notice corner lifting in the fan's draught: 4 mm over 0.9 s, held a moment, down by 1.8 s. */
export const PAPER = { peakM: 0.004, durationS: 1.8 } as const;
export function paperLift(t: number): number {
  return PAPER.peakM * (ease(0, 0.9, t) - ease(1.1, 1.8, t));
}

/** The idle highlight on the board's brass pin: one soft hump, 800 ms. */
export const PIN = { durationS: 0.8 } as const;
export function pinGlint(t: number): number {
  return t <= 0 || t >= PIN.durationS ? 0 : Math.sin((Math.PI * t) / PIN.durationS) ** 2;
}

/** The extractor fan: 10 rpm (the consult asks 8 to 12). */
export const FAN = { rpm: 10 } as const;
export const FAN_RAD_PER_S = (FAN.rpm * 2 * Math.PI) / 60;

/** The paper tag at the fan's switch: one slow swing of plus and minus a degree over 1.6 s, at rest again after. */
export const TAG = { amplitudeDeg: 1, durationS: 1.6 } as const;
export function tagSwing(t: number): number {
  if (t <= 0 || t >= TAG.durationS) return 0;
  // A decaying sine: a brush of air, then still.
  return ((TAG.amplitudeDeg * Math.PI) / 180) * Math.sin((2 * Math.PI * t) / TAG.durationS) * (1 - t / TAG.durationS) * 1.3;
}

/** The repair-bench mobile: plus and minus 3 degrees, over 6 s, ending where it began. */
export const MOBILE = { amplitudeDeg: 3, durationS: 6 } as const;
export function mobileTurn(t: number): number {
  if (t <= 0 || t >= MOBILE.durationS) return 0;
  const k = (t / MOBILE.durationS) * Math.PI * 2;
  return ((MOBILE.amplitudeDeg * Math.PI) / 180) * Math.sin(k) * Math.sin(k / 2);
}

/** Outside traffic as a reflection in the high glass: a broad change of 2.5% luminance over 4 s. */
export const REFLECTION = { luminance: 0.025, durationS: 4 } as const;
export function reflectionLevel(t: number): number {
  return REFLECTION.luminance * (ease(0, 1.6, t) - ease(2.2, 4, t));
}

/** Motes in one lamp's light: 16 of them (12 to 20) drifting at 15 mm a second for 4 s. */
export const DUST = { motes: 16, speedMps: 0.015, durationS: 4 } as const;

/** The clock's second hand steps once a second: whole seconds of ambient time, six degrees each. */
export function secondHandSteps(ambientSeconds: number): number {
  return Math.floor(ambientSeconds + 1e-6);
}

/** Heat over a radiator: under one CSS pixel of wobble, for 3 s. */
export const SHIMMER = { maxPx: 0.8, durationS: 3 } as const;
export function shimmerAmount(t: number): number {
  if (t <= 0 || t >= SHIMMER.durationS) return 0;
  return SHIMMER.maxPx * Math.sin((Math.PI * t) / SHIMMER.durationS);
}
