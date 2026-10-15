/**
 * The records on the gramophone's shelf, as the page knows them: what to call each, what its
 * caption says, and where its two encodings are. Licences, hashes and provenance are in
 * `records/manifest.json`, which a test holds this list to; nothing of that is bundled here.
 *
 * The URLs are the bundler's, imported as `?url` (the files are not inlined and not fetched until an
 * `<audio>` element is given one, which the engine does only after the first sound unlock). Media
 * loads under the page's `media-src 'self'`; nothing here uses `fetch`.
 */
import chopinOpus from './records/chopin-waltz-a-minor.webm?url';
import chopinAac from './records/chopin-waltz-a-minor.m4a?url';
import satieOpus from './records/satie-gymnopedie-1.webm?url';
import satieAac from './records/satie-gymnopedie-1.m4a?url';
import schumannOpus from './records/schumann-at-the-fireside.webm?url';
import schumannAac from './records/schumann-at-the-fireside.m4a?url';

export type RecordFormat = 'opus-webm' | 'aac-mp4';

export interface RecordSource {
  readonly format: RecordFormat;
  /** What to ask `canPlayType`. */
  readonly mime: string;
  readonly url: string;
}

export interface RecordInfo {
  /** The id in `records/manifest.json`. */
  readonly id: string;
  /** The title and the composer, as the page names them. */
  readonly title: string;
  readonly composer: string;
  /**
   * The caption when the record starts, in the corridor's captions' voice: bracketed, a few words.
   * A draft for the clarity and editorial pass.
   */
  readonly caption: string;
  /** Opus first (smaller), then AAC. */
  readonly sources: readonly RecordSource[];
}

const OPUS = 'audio/webm; codecs="opus"';
const AAC = 'audio/mp4; codecs="mp4a.40.2"';

const sources = (opus: string, aac: string): readonly RecordSource[] => [
  { format: 'opus-webm', mime: OPUS, url: opus },
  { format: 'aac-mp4', mime: AAC, url: aac },
];

/** The shelf, in the order the records change. */
export const RECORDS: readonly RecordInfo[] = [
  {
    id: 'satie-gymnopedie-1',
    title: 'Gymnopédie No. 1',
    composer: 'Erik Satie',
    caption: '[gramophone: Satie, Gymnopédie No. 1]',
    sources: sources(satieOpus, satieAac),
  },
  {
    id: 'chopin-waltz-a-minor',
    title: 'Waltz in A minor',
    composer: 'Frédéric Chopin',
    caption: '[gramophone: Chopin, Waltz in A minor]',
    sources: sources(chopinOpus, chopinAac),
  },
  {
    id: 'schumann-at-the-fireside',
    title: 'At the Fireside',
    composer: 'Robert Schumann',
    caption: '[gramophone: Schumann, At the Fireside]',
    sources: sources(schumannOpus, schumannAac),
  },
];

/**
 * The encodings this browser says it can play, best first. `canPlayType` answers "", "maybe" or
 * "probably": anything but "" is worth trying, and the engine falls back to the next one if the
 * element then fails.
 */
export function playableSources(record: RecordInfo, canPlayType: (mime: string) => string): readonly RecordSource[] {
  return record.sources.filter((source) => canPlayType(source.mime) !== '');
}
