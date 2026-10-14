/**
 * The smoke veil's coverage over the run between the hero and the game window (ADR 0003, consult
 * 4): 0 is clear, 1 is fully opaque. The shell passes the keyframes (`SITE_SCROLL.veil`), so the
 * timings stay in one place; this is only the interpolation.
 */
export type VeilKeyframes = readonly (readonly [progress: number, coverage: number])[];

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Coverage at `progress`, linearly interpolated between the keyframes and clamped at both ends. */
export function veilCoverage(progress: number, keyframes: VeilKeyframes): number {
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (!first || !last) return 0;
  const p = clamp01(progress);
  if (p <= first[0]) return first[1];
  for (let i = 1; i < keyframes.length; i += 1) {
    const to = keyframes[i];
    const from = keyframes[i - 1];
    if (!to || !from) continue;
    const [toProgress, toCoverage] = to;
    const [fromProgress, fromCoverage] = from;
    if (p <= toProgress) {
      const span = toProgress - fromProgress;
      return span <= 0 ? toCoverage : fromCoverage + ((p - fromProgress) / span) * (toCoverage - fromCoverage);
    }
  }
  return last[1];
}

/** True while the veil is as dense as it gets: the seam's cover, and where "Loading" may appear. */
export const VEIL_FULL = 0.999;
