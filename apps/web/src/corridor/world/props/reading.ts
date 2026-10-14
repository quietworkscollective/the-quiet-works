import { CORRIDOR_PROPS } from '@tqw/engine';
import type { PropId } from '../../props.ts';
import { PROP_COPY } from './copy.ts';

/**
 * What each prop says, as text, for the page's own equivalents of the 3D scene: the "Things
 * nearby" list, the reader a prop with a label opens, and text mode (every beat is carried in
 * words). `lines` are every string printed or engraved on the prop, in reading order, so the page
 * says whatever the 3D card, plate or label says; a test holds the two together. The verb is the
 * drafted one. A prop with nothing written on it has no lines: its action is its whole content.
 */
export interface PropReading {
  id: PropId;
  /** The verb for the control (`CORRIDOR_PROPS.verbs`). */
  verb: string;
  lines: readonly string[];
}

const LINES: Record<PropId, readonly string[]> = {
  'trophy-cabinet': [CORRIDOR_PROPS.labels['trophy-cabinet'], ...CORRIDOR_PROPS.trophies],
  'team-photo': [CORRIDOR_PROPS.labels['team-photo']],
  'watering-can': [],
  football: [],
  'cricket-bat': [PROP_COPY.scorebook.cover, PROP_COPY.scorebook.season],
  'team-shirts': [CORRIDOR_PROPS.labels['team-shirts']],
  'walking-boots': [CORRIDOR_PROPS.labels['walking-boots']],
  'repair-kit': [CORRIDOR_PROPS.labels['repair-kit']],
  'bicycle-wheel': [],
  'recipe-drawer': [CORRIDOR_PROPS.labels['recipe-drawer'], PROP_COPY.recipe.title, ...PROP_COPY.recipe.lines],
  chess: [],
  'work-glove': [],
};

export function readingOf(id: PropId): PropReading {
  return { id, verb: CORRIDOR_PROPS.verbs[id], lines: LINES[id] };
}
