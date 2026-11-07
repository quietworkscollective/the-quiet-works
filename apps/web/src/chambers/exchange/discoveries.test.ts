import { describe, expect, it } from 'vitest';
import { openSealed, parseSealedFile } from '@tqw/engine';
import sealedExchange from '../../../../../packages/engine/src/sealed/exchange.sealed.json';
import { READER_OF_FINDING, READERS } from './copy.ts';
import { EXCHANGE_FINDINGS, EXCHANGE_TOKENS, type ExchangeFindingId } from './state.ts';

const SEALED = parseSealedFile(sealedExchange);
const ids = Object.keys(EXCHANGE_FINDINGS).sort() as ExchangeFindingId[];

describe('The Exchange sealed findings', () => {
  it('seals exactly the findings the room can record, and no retired item', () => {
    expect(Object.keys(SEALED.items).sort()).toEqual(ids);
    expect(ids).toHaveLength(26);
    for (const retired of ['ladder', 'lamp-test', 'operator-frame', 'wanted-bell', 'certification-callback']) {
      expect(Object.hasOwn(SEALED.items, retired), retired).toBe(false);
    }
  });

  it('opens every item with its token, under the kind and title the room records', async () => {
    for (const id of ids) {
      const item = await openSealed(SEALED, id, EXCHANGE_TOKENS[id]);
      expect(item?.id, id).toBe(id);
      expect(item?.label, id).toBe('Fictional room text');
      expect(item?.kind, id).toBe(EXCHANGE_FINDINGS[id].kind);
      expect(item?.title, id).toBe(EXCHANGE_FINDINGS[id].title);
    }
  });

  it('keeps every token distinct and opaque', () => {
    const tokens = Object.values(EXCHANGE_TOKENS);
    expect(tokens.every(token => /^[0-9a-f]{32}$/.test(token))).toBe(true);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('holds exactly three secrets and one payoff', () => {
    const ofKind = (kind: string) => ids.filter(id => EXCHANGE_FINDINGS[id].kind === kind);
    expect(ofKind('secret')).toEqual(['operator-ticket', 'rule-14', 'socket-beneath-plate']);
    expect(ofKind('payoff')).toEqual(['departments-connected']);
  });

  it('gives every finding a reader that can show it', () => {
    for (const id of ids) {
      const reader = READERS[READER_OF_FINDING[id]];
      const shown = reader.sealed?.includes(id) === true || (reader.lines?.length ?? 0) > 0;
      expect(shown, id).toBe(true);
    }
  });
});
