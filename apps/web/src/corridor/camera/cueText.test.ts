import { CORRIDOR_PROPS } from '@tqw/engine';
import { describe, expect, it } from 'vitest';
import { PROPS } from '../props.ts';
import { readingOf } from '../world/props/reading.ts';
import { cueText, readerFor } from './cueText.ts';

describe('the reader a prop opens', () => {
  it('says everything that is written on the prop, in reading order: the first line as the lead, the rest listed', () => {
    for (const spec of PROPS) {
      const reading = readingOf(spec.id);
      const reader = readerFor(spec.id);
      expect(reader.id).toBe(spec.id);
      expect(reader.verb, spec.id).toBe(CORRIDOR_PROPS.verbs[spec.id]);
      expect([reader.text, ...reader.inscriptions].filter((line) => line !== null), spec.id).toEqual([...reading.lines]);
    }
  });

  it('has nothing to read for a prop with nothing written on it: its action is its whole content', () => {
    for (const id of ['watering-can', 'football', 'bicycle-wheel', 'chess', 'work-glove'] as const) {
      expect(readerFor(id).text, id).toBeNull();
      expect(readerFor(id).inscriptions, id).toEqual([]);
    }
  });

  it('reads the cabinet’s label and its trophies, the scorebook’s cover and season, the recipe’s title and steps', () => {
    expect(readerFor('trophy-cabinet').text).toBe(CORRIDOR_PROPS.labels['trophy-cabinet']);
    expect(readerFor('trophy-cabinet').inscriptions).toEqual(CORRIDOR_PROPS.trophies);
    expect(readerFor('cricket-bat').inscriptions.length).toBeGreaterThan(0);
    expect(readerFor('recipe-drawer').inscriptions.length).toBeGreaterThan(1);
  });
});

describe('the verb on a cue', () => {
  it('is the prop’s drafted verb', () => {
    for (const spec of PROPS) expect(cueText({ kind: 'prop', id: spec.id })).toBe(CORRIDOR_PROPS.verbs[spec.id]);
  });
});
