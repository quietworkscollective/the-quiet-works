import { describe, expect, it } from 'vitest';
import exchange from './exchange/provenance.json';
import outline from './annex-codex/provenance.json';

/** Who made each Annex room: the founder's scoped exception allows a quiet, accurate makers' credit. */
const makers = {
  'The Exchange': ['Claude (Anthropic)'],
  'The Outline Room': ['OpenAI Codex'],
} as const;

/** The date each credit states. */
const dates = {
  'The Exchange': '7 November 2026',
  'The Outline Room': '15 October 2026',
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
      // The release flag is not a founder review; the record must not claim one that has not happened.
      review: { status: 'pending founder review' },
    });
    const agents = record.creators.filter((creator) => creator.role !== 'supervisor').map((creator) => creator.name);
    expect(agents).toEqual([...makers[room]]);
    expect(record.creators).toContainEqual({ name: 'Asiri Dalugoda', role: 'supervisor' });
    for (const name of makers[room]) expect(record.credit).toContain(name);
    expect(record.credit).toContain('Machine-made');
    expect(record.credit).toContain(dates[room]);
    expect(record.credit).toContain('CC BY 4.0');
    expect(record.credit).toContain('Supervised by Siri (Asiri) Dalugoda (founder)');
    expect(record.credit).toContain('licensed under CC BY 4.0 by Asiri Dalugoda');
    expect(record.credit).toContain('no human testimony');
  });

  it('The Exchange names one maker for both its design and its build, and no other agent', () => {
    expect(exchange.date).toBe('2026-11-07');
    expect(exchange.credit).toContain('designed and built by Claude (Anthropic)');
    expect(exchange.credit).not.toContain('Codex');
    expect(exchange.credit).not.toContain('GPT');
    expect(JSON.stringify(exchange.creators)).not.toContain('Codex');
    expect(JSON.stringify(exchange.creators)).not.toContain('GPT');
  });
});
