import { RECORDS, type RecordInfo } from '../../../../audio/music/catalogue.ts';
import { needleVerb, type GramophoneState, type Verb } from '../../../../audio/music/needle.ts';
import { GRAMOPHONE_COPY } from './copy.ts';

/**
 * What the gramophone says as text, for the page's own equivalents of the 3D scene: the reading a
 * screen reader gets, the line text mode carries, and the labels on the verbs. It is a pure function
 * of the needle, the record and whether the sound is on, so the words always agree with the object.
 */

/** The two things the visitor can act on: the needle and the record on the platter. */
export type Target = 'needle' | 'records';

export interface Action {
  readonly target: Target;
  readonly verb: Verb;
  /** The words on the cue and the control. */
  readonly label: string;
}

export interface Reading {
  /** One or two sentences: what it is and what it is doing. */
  readonly text: string;
  readonly actions: readonly Action[];
}

const piece = (record: RecordInfo | undefined): string => (record ? `${record.title}, ${record.composer}` : 'a record');

/** The verbs on offer now: the needle's own (play it, or lift it) and the change of record. */
export function actionsFor(state: GramophoneState): readonly Action[] {
  const verb = needleVerb(state.needle);
  return [
    { target: 'needle', verb, label: GRAMOPHONE_COPY.verbs[verb] },
    { target: 'records', verb: 'change', label: GRAMOPHONE_COPY.verbs.change },
  ];
}

/** The action for a target now. */
export function actionFor(state: GramophoneState, target: Target): Action {
  const found = actionsFor(state).find((a) => a.target === target);
  if (!found) throw new RangeError(`unknown target ${target}`);
  return found;
}

export function readingOf(state: GramophoneState, soundOn: boolean, records: readonly RecordInfo[] = RECORDS): Reading {
  const here = piece(records[state.record]);
  const name = GRAMOPHONE_COPY.name;
  let text: string;
  switch (state.needle) {
    case 'up':
      text = `${name}. The needle is up. On the platter: ${here}.`;
      break;
    case 'lead-in':
      text = `${name}. The needle has come down on ${here}.`;
      break;
    case 'playing':
      text = `${name}. Playing: ${here}.`;
      break;
    case 'run-out':
      text = `${name}. The record has ended; the needle is in the groove.`;
      break;
    case 'gap':
      text = `${name}. The needle has lifted. Next: ${here}.`;
      break;
    case 'swap':
      text = `${name}. Changing the record. Next: ${here}.`;
      break;
  }
  return { text: soundOn ? text : `${text} ${GRAMOPHONE_COPY.soundOff}`, actions: actionsFor(state) };
}
