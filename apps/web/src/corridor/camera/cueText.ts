import { chamberById, CORRIDOR_PROPS, type ChamberId } from '@tqw/engine';
import { doorLabel } from '@tqw/ui';
import type { PropId } from '../props.ts';
import { readingOf } from '../world/props/reading.ts';

/**
 * The words on the corridor's cues (ADR 0004): what the DOM label near an object says, and what
 * the reader shows for a prop with a small institutional label. Nothing is written here; every
 * string comes from the corridor copy (`CORRIDOR_PROPS`, the door labels the keyboard list uses),
 * apart from the board's verb, which the brief gives.
 */

/** The verb on the notice board, for hover, focus and touch. */
export const BOARD_VERB = 'Read notices';

/** What a cue can point at. Blank doors are not targets: they offer nothing. */
export type CueTarget =
  | { kind: 'door'; id: ChamberId }
  | { kind: 'prop'; id: PropId }
  | { kind: 'board' };

export const targetId = (t: CueTarget): string => (t.kind === 'board' ? 'board' : `${t.kind}:${t.id}`);

export const sameCueTarget = (a: CueTarget | null, b: CueTarget | null): boolean =>
  a === b || (a !== null && b !== null && targetId(a) === targetId(b));

/** The label for a cue: a prop's verb, a door's own label (a sealed door says it is not yet open), or the board's verb. */
export function cueText(target: CueTarget): string {
  switch (target.kind) {
    case 'prop':
      return CORRIDOR_PROPS.verbs[target.id];
    case 'board':
      return BOARD_VERB;
    case 'door': {
      const chamber = chamberById(target.id);
      return chamber.status === 'open' ? doorLabel(chamber.title, 'open') : CORRIDOR_PROPS.sealedDoor;
    }
  }
}

/** The small institutional label fixed to a prop, if it has one. */
export function propLabel(id: PropId): string | null {
  const labels: Partial<Record<PropId, string>> = CORRIDOR_PROPS.labels;
  return labels[id] ?? null;
}

/**
 * What the reader shows after a prop's action: its verb, then everything printed or engraved on it in
 * reading order (the lane that builds the prop says what that is: `readingOf`), the first line as the
 * lead and the rest as a list (the cabinet's trophies, the scorebook's season, the recipe's steps).
 */
export interface ReaderContent {
  id: PropId;
  verb: string;
  text: string | null;
  inscriptions: readonly string[];
}

export function readerFor(id: PropId): ReaderContent {
  const reading = readingOf(id);
  return { id, verb: reading.verb, text: reading.lines[0] ?? null, inscriptions: reading.lines.slice(1) };
}
