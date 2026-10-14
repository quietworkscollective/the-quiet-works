import { CONTEXTUAL_CUES as C } from '@tqw/ui';
export interface CueSample { id: string; distance: number; angle: number; occluded: boolean }
export interface CueSelection { id: string | null; wakeAt: number | null }
/** Hysteresis and bounded deadlines; the scene sleeps between camera changes and these deadlines. */
export function createCueSelection() {
  let shown: string | null = null, candidate: string | null = null, since = 0;
  let obscuredAt: number | null = null;
  return (samples: readonly CueSample[], now: number, focused: string | null = null, preferred: string | null = null): CueSelection => {
    if (focused) { shown = focused; candidate = null; obscuredAt = null; return { id: focused, wakeAt: null }; }
    const preference = samples.find(s => s.id === preferred && !s.occluded && s.distance <= C.enterDistance && s.angle <= C.enterHalfAngle);
    const current = samples.find(s => s.id === shown);
    if (current && (!preference || preference.id === shown) && current.distance <= C.leaveDistance && current.angle <= C.leaveHalfAngle) {
      if (!current.occluded) { obscuredAt = null; return { id: shown, wakeAt: null }; }
      obscuredAt ??= now;
      if (now < obscuredAt + C.occludedMs) return { id: shown, wakeAt: obscuredAt + C.occludedMs };
    }
    shown = null; obscuredAt = null;
    const next = preference?.id ?? samples.filter(s => !s.occluded && s.distance <= C.enterDistance && s.angle <= C.enterHalfAngle)
      .sort((a, b) => a.angle - b.angle || a.distance - b.distance)[0]?.id ?? null;
    if (next !== candidate) { candidate = next; since = now; }
    if (!next) return { id: null, wakeAt: null };
    if (now >= since + C.appearMs) { shown = next; candidate = null; return { id: shown, wakeAt: null }; }
    return { id: null, wakeAt: since + C.appearMs };
  };
}
