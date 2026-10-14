import { smoothstep01 } from '../../firstPerson/easing.ts';
import { SITE_SCROLL } from '../../timing.ts';

/**
 * The hero's ambient camera (ADR 0003; art consult 4, section 1): one shallow lateral arc under
 * the live world, so the page is alive without being busy. Sinusoidal sideways movement of
 * `lateralM` over `periodS`, and a yaw correction (a point `PIVOT_M` ahead stays framed as the
 * camera slides) kept within `yawDeg`. Nothing else: no forward creep, no vertical movement, no
 * roll. It blends back to the authored walk-in pose over the first `driftBlendOut` of scroll.
 */

/** The yaw correction keeps a point this far down the corridor in the same place in the frame. */
export const AMBIENT_PIVOT_M = 8;

/**
 * Drift frames are drawn at this cadence, not every display frame: the movement is under 7 mm a
 * second (a few pixels of parallax), so fifteen frames a second is smooth and a quarter of the
 * work.
 */
export const AMBIENT_FRAME_MS = 1000 / 15;

export interface AmbientConfig {
  lateralM: number;
  periodS: number;
  yawDeg: number;
}

export interface Ambient {
  /** Sideways offset in metres, toward the visitor's right. */
  x: number;
  /** Yaw correction in degrees (positive turns right). */
  yawDeg: number;
}

/** The drift at `clockMs` of drift time: zero at the start, so it begins exactly at the authored pose. */
export function ambientDrift(clockMs: number, config: AmbientConfig = SITE_SCROLL.ambient): Ambient {
  const x = config.lateralM * Math.sin((2 * Math.PI * clockMs) / (config.periodS * 1000));
  const yaw = (-Math.atan(x / AMBIENT_PIVOT_M) * 180) / Math.PI;
  return { x, yawDeg: Math.max(-config.yawDeg, Math.min(config.yawDeg, yaw)) };
}

/**
 * How much of the drift is applied at scroll `progress`: all of it at 0, none from `driftBlendOut`
 * on, with no corner at either end (smoothstep), so the first scroll does not nudge the view.
 */
export function driftWeight(progress: number, blendOut: number = SITE_SCROLL.driftBlendOut): number {
  return 1 - smoothstep01(progress / blendOut);
}
