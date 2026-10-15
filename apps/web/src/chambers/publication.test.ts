import { CHAMBERS } from '@tqw/engine';
import { describe, expect, it } from 'vitest';
import { publicChambers } from '../../../../packages/ui/src/spine/chamberCopy.ts';
import { isChamberOpenInBuild } from './registry.ts';

describe('public chamber copy', () => {
  const productionChambers = CHAMBERS.map((chamber) => ({
    ...chamber,
    status: isChamberOpenInBuild(chamber.id, false) ? 'open' as const : 'sealed' as const,
  }));

  it('gives sealed notice-board clippings only the room name and release status', () => {
    const rooms = publicChambers(productionChambers, true);
    for (const room of rooms.filter((entry) => entry.status === 'sealed')) {
      expect(room.clipping.headline).toBe(room.title.toUpperCase());
      expect(room.clipping.dek).toBe('Not yet open.');
      expect(room.clipping.dateline).toBe('');
      expect(room.clipping.headline).not.toMatch(/now open/i);
      expect(room.doorDescription).toBe('Not yet open.');
    }
  });

  it('keeps authored copy available in development for unreleased rooms', () => {
    const authoredRooms = CHAMBERS.map((chamber) => ({
      ...chamber,
      status: isChamberOpenInBuild(chamber.id, true) ? 'open' as const : 'sealed' as const,
    }));
    const rooms = publicChambers(authoredRooms, false);
    const exchange = rooms.find((room) => room.id === 'exchange');
    expect(exchange?.status).toBe('open');
    expect(exchange?.clipping.headline).toBe('ANNEX ROOM NOW OPEN');
  });
});
