import { beatDuration } from './beatMotion.ts';

/** A failed application never acquires a fifth bulb or a signature. */
export function applicationAt(step: number, elapsed: number, reduced = false) {
  const started = elapsed >= 0;
  const time = reduced && started ? Infinity : elapsed;
  const lamps = Array.from({ length: 5 }, (_, i) => i < 4 && (i < step - 1 || (i === step - 1 && started)));
  const catchDrop = (i: number) => i < step - 1 ? 1 : i === step - 1 && i < 4 ?
    Math.max(0, Math.min(1, (time - beatDuration(step)) / (reduced ? 1 : 180))) : 0;
  const reveal = step >= 5 ? Math.max(0, Math.min(1, (time - beatDuration(5)) / (reduced ? 1 : 1500))) : 0;
  return { lamps, catches: Array.from({ length: 4 }, (_, i) => catchDrop(i)), reveal };
}
