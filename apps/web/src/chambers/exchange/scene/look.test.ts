import { describe, expect, it } from 'vitest';
import { EXCHANGE_ROOM_LOOK } from './look.ts';

describe('Exchange room lamp finish', () => {
  it('lets lamp glass bloom while the lamp cores remain below clipping', () => {
    expect(EXCHANGE_ROOM_LOOK.bloom.threshold).toBeGreaterThanOrEqual(1.3);
    expect(EXCHANGE_ROOM_LOOK.bloom.threshold).toBeLessThanOrEqual(1.4);
    expect(EXCHANGE_ROOM_LOOK.bloom.strength).toBeLessThanOrEqual(0.10);
  });
});
