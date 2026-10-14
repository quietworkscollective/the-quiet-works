import { describe, expect, it } from 'vitest';
import exchange from './exchange/provenance.json';
import outline from './annex-codex/provenance.json';

/** Who made each Annex room: the founder's scoped exception allows a quiet, accurate makers' credit. */
const makers = {
  'The Exchange': ['Claude (Anthropic)', 'OpenAI Codex'],
  'The Outline Room': ['OpenAI Codex'],
} as const;

const records = [
  ['The Exchange', exchange],
  ['The Outline Room', outline],
] as const;

describe('Annex machine-made credits', () => {
  it.each(records)('%s credits its actual makers, its grantor and licence, and claims no review yet', (room, record) => {
    expect(record).toMatchObject({
      humanGrantor: { name: 'Asiri Dalugoda', role: 'founder' },
      licence: { name: 'CC BY 4.0', grantor: 'Asiri Dalugoda' },
      // Neither room is approved for release; the record must not claim a review that has not happened.
      review: { status: 'pending founder review' },
    });
    const agents = record.creators.filter((creator) => creator.role !== 'supervisor').map((creator) => creator.name);
    expect(agents).toEqual([...makers[room]]);
    expect(record.creators).toContainEqual({ name: 'Asiri Dalugoda', role: 'supervisor' });
    for (const name of makers[room]) expect(record.credit).toContain(name);
    expect(record.credit).toContain('Machine-made');
    expect(record.credit).toContain('15 October 2026');
    expect(record.credit).toContain('CC BY 4.0');
    expect(record.credit).toContain('Supervised by Asiri Dalugoda (founder)');
    expect(record.credit).toContain('no human testimony');
  });
});
