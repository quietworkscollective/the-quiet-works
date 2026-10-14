import { TIMING } from '../../../timing.ts';
import { clamp01, easeOutQuad, heavyFall, lerp, smoothstep } from './anim.ts';
import { OVERLOAD_SCRIPT } from './director.ts';
import { MACHINE } from './machineLayout.ts';

/** Angle of the machine's hatch when fully open, radians. */
export const OPEN_ANGLE = MACHINE.hatch.openRad;

/** How far the latch's pop opens the panel, radians (about 1.5 degrees). */
export const LATCH_POP = 0.026;
/** Where the panel sits when the hesitation ends and the fall begins. */
export const HANG_ANGLE = 0.044;

/**
 * The hatch during the fifth-stamp overload, `dt` ms after the latch lets go.
 *
 * - 0..hangMs (250): the hesitation. The latch pops (a quick 1.5 degrees), the panel shivers on
 *   its hinge with a small decaying tremor, then sags a hair as it commits. Nothing flashes.
 * - then a weighted fall that makes first contact exactly TIMING.overloadLatchLeadMs after the
 *   latch (the sound's thump), one small rebound, and rest.
 */
export function overloadHatchAngle(dt: number): number {
  if (dt <= 0) return 0;
  const { hangMs } = OVERLOAD_SCRIPT;
  const pop = LATCH_POP * easeOutQuad(clamp01(dt / 35));
  if (dt < hangMs) {
    const shiver = 0.011 * Math.sin(dt * 0.2) * Math.exp(-dt / 105) * smoothstep(8, 40, dt);
    const sag = (HANG_ANGLE - LATCH_POP) * smoothstep(hangMs * 0.55, hangMs, dt);
    return pop + shiver + sag;
  }
  const fallMs = TIMING.overloadLatchLeadMs - hangMs;
  return lerp(HANG_ANGLE, OPEN_ANGLE, heavyFall((dt - hangMs) / fallMs));
}
