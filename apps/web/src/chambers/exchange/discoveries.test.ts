import { describe, expect, it } from 'vitest';
import { openSealed, parseSealedFile } from '@tqw/engine';
import sealedExchange from '../../../../../packages/engine/src/sealed/exchange.sealed.json';
import { EXCHANGE_TOKENS } from './state.ts';

const SEALED = parseSealedFile(sealedExchange);

describe('The Exchange sealed discoveries', () => {
  it('opens each authored finding with its matching discovery token', async () => {
    const ids = Object.keys(EXCHANGE_TOKENS).sort();
    expect(Object.keys(SEALED.items).sort()).toEqual(ids);
    for (const id of ids) {
      const token = EXCHANGE_TOKENS[id];
      expect(token, id).toBeDefined();
      const item = await openSealed(SEALED, id, token ?? '');
      expect(item?.id, id).toBe(id);
      expect(item?.label, id).toBe('Fictional room text');
    }
  });

  it('keeps the three route payoffs sealed as secrets', () => {
    const secretIds = ['certification-callback', 'operator-ticket', 'rule-14'];
    expect(secretIds.every(id => Object.hasOwn(SEALED.items, id))).toBe(true);
    expect(Object.keys(SEALED.items)).toHaveLength(26);
  });
});
