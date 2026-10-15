import { describe, expect, it } from 'vitest';
import { EXCHANGE_OBJECTS } from './state.ts';
import { isDynamicExchangeNode } from './nodes.ts';

describe('The Exchange interactive model contract', () => {
  it('keeps every inspectable object as a named node outside the static bake', () => {
    for (const object of EXCHANGE_OBJECTS) expect(isDynamicExchangeNode(object.node), object.node).toBe(true);
  });

  it('keeps every connection jack, lamp, card, and operator control as a named node', () => {
    for (let line = 1; line <= 12; line += 1) {
      const number = String(line).padStart(2, '0');
      expect(isDynamicExchangeNode('line_jack_' + number)).toBe(true);
      expect(isDynamicExchangeNode('line_lamp_' + number)).toBe(true);
      expect(isDynamicExchangeNode('line_card_' + number)).toBe(true);
    }
    expect(isDynamicExchangeNode('operator_lamp')).toBe(true);
    expect(isDynamicExchangeNode('phone_handset')).toBe(true);
  });

  it('keeps the arrival sign readable as a separately named live-lit node', () => {
    expect(isDynamicExchangeNode('exchange_board_title')).toBe(true);
  });

  it('keeps only the inset gallery soffits outside the indirect lightmap', () => {
    expect(isDynamicExchangeNode('gallery_soffits')).toBe(true);
    expect(isDynamicExchangeNode('gallery_rails_and_walks')).toBe(false);
  });
});
