/**
 * Words the props carry that are not in `CORRIDOR_PROPS` (the lead's drafted copy). They are the
 * props lane's own drafts: a recipe card, a score book's cover. Marked for editorial review; the
 * DOM equivalents of the props (text mode, the "Things nearby" list) should read these too, so
 * that what the 3D card says, the page says.
 */
export const PROP_COPY = {
  /** The recipe card that lifts out of the drawer: a plain, kind recipe in a few lines. */
  recipe: { title: 'Lentil soup', lines: ['one onion, two carrots,', 'a cup of red lentils.', 'Salt. Time. Taste.'] },
  /** The cricket scorebook hung beside the bat: stationery, nothing more. */
  scorebook: { cover: 'SCORE BOOK', season: 'SEASON' },
} as const;

/** Split a drafted label at its first sentence break: a heading, then the rest. */
export function splitLabel(copy: string): { heading: string; rest: string; joiner: string } {
  const colon = copy.indexOf(': ');
  const stop = copy.indexOf('. ');
  if (colon >= 0 && (stop < 0 || colon < stop)) return { heading: copy.slice(0, colon), rest: copy.slice(colon + 2), joiner: ': ' };
  if (stop >= 0) return { heading: copy.slice(0, stop + 1), rest: copy.slice(stop + 2), joiner: ' ' };
  return { heading: copy, rest: '', joiner: '' };
}
