/**
 * The lockup's motion, as numbers (ADR 0003, the founder's direction: the word is about being let
 * go; animate meaning, not decoration). The timeline lives in the stylesheet; this is what is
 * different about each of the six letters, so the word is never in unison.
 *
 * The letters are HELD at first, set tight and perfectly still; UN arrives; the word is released
 * and each letter takes its own small rest offset, then breathes very slowly around it. Scrolling
 * into the smoke lets the letters go upward and apart.
 */

export interface LetterMotion {
  /** Where this letter settles once released, from where it was held: px and degrees, all small. */
  rest: { x: number; y: number; rotate: number };
  /** The breathing: a vertical travel in px, a tilt in degrees, and a period in seconds. */
  breath: { y: number; rotate: number; periodS: number };
  /** How far this letter rises (px) as the word is let go into the smoke. */
  lift: number;
}

/** U N H E L D, in order. */
export const LETTERS: readonly LetterMotion[] = [
  { rest: { x: -0.8, y: 1.2, rotate: -0.25 }, breath: { y: 1.5, rotate: 0.35, periodS: 11 }, lift: 10 },
  { rest: { x: 0.5, y: -1.4, rotate: 0.2 }, breath: { y: 1.2, rotate: 0.28, periodS: 13 }, lift: 16 },
  { rest: { x: -0.4, y: -0.6, rotate: -0.15 }, breath: { y: 1.5, rotate: 0.32, periodS: 9.5 }, lift: 7 },
  { rest: { x: 0.9, y: 1.5, rotate: 0.3 }, breath: { y: 1, rotate: 0.22, periodS: 12 }, lift: 13 },
  { rest: { x: -0.6, y: -1.2, rotate: -0.3 }, breath: { y: 1.4, rotate: 0.35, periodS: 10 }, lift: 18 },
  { rest: { x: 0.7, y: 0.9, rotate: 0.25 }, breath: { y: 1.1, rotate: 0.3, periodS: 12.5 }, lift: 9 },
];

/** The most a breath may move a letter, whatever the amplitude setting: the founder's limit. */
export const BREATH_MAX = { y: 2, rotate: 0.35 } as const;

/** The breath's amplitude is multiplied by this while the wordmark is touched: briefly held again. */
export const HELD_AMPLITUDE = 0.5;
/** How long the wordmark stays gathered after the pointer arrives. */
export const HELD_MS = 1500;

/** The inline custom properties for one letter. */
export function letterStyle(index: number): Record<string, string | number> {
  const letter = LETTERS[index];
  if (!letter) return { '--i': index };
  return {
    '--i': index,
    '--lift': `${letter.lift}px`,
    '--ox': `${letter.rest.x}px`,
    '--oy': `${letter.rest.y}px`,
    '--or': `${letter.rest.rotate}deg`,
    '--by': `${letter.breath.y}px`,
    '--br': `${letter.breath.rotate}deg`,
    '--bp': `${letter.breath.periodS}s`,
    // Each letter starts breathing a little after the last: never all at once.
    '--bd': `${2450 + index * 380}ms`,
  };
}

/**
 * How far into its release the word is at a scroll progress: 0 held, 1 let go. The letters are fully
 * released by the end of the first veil keyframe, so they are gone into the smoke by the time the
 * hero has scrolled away.
 */
export const RELEASE_BY = 0.2;
export function releaseAt(progress: number): number {
  const t = Math.min(1, Math.max(0, progress / RELEASE_BY));
  return t * t * (3 - 2 * t);
}

/** How visible the letters still are at a veil coverage: they fade with the veil, gone before it is full. */
export const FADE_AT_COVERAGE = 0.6;
export function visibilityAt(coverage: number): number {
  return 1 - Math.min(1, Math.max(0, coverage / FADE_AT_COVERAGE));
}
