/**
 * The gramophone's music, for the rest of the app: the one shared store (the needle, the record,
 * the listener), the catalogue, and the engine the sound desk builds on its first unlock. The
 * things inside the folder import each other directly; the desk, the prop and the page import this.
 */
import { RECORDS } from './catalogue.ts';
import { createGramophoneStore } from './store.ts';

/** The page's one gramophone. A module-level object on purpose: see `store.ts`. */
export const gramophone = createGramophoneStore({ records: RECORDS.length });

export { RECORDS, type RecordInfo } from './catalogue.ts';
export { MusicSound } from './musicSound.ts';
export { GRAMOPHONE, GRAMOPHONE_SOURCE, mixAt } from './space.ts';
export { needleDown, needleVerb, platterTurns, type GramophoneState, type NeedleState, type Verb } from './needle.ts';
export type { GramophoneStore, ListenerPose } from './store.ts';
