import { describe, expect, it } from 'vitest';
import { isChamberOpenInBuild, preloadChamber } from './registry.ts';

describe('chamber release flags', () => {
  it('keeps the Apartment sealed in production and refuses to load its code', () => {
    expect(isChamberOpenInBuild('apartment', false)).toBe(false);
    expect(preloadChamber('apartment', false)).toBeNull();
  });

  it('opens and loads the Apartment in development while its release flag is off', async () => {
    expect(isChamberOpenInBuild('apartment', true)).toBe(true);
    const room = preloadChamber('apartment', true);
    expect(room).not.toBeNull();
    if (!room) throw new Error('The Apartment must load in development');
    await expect(room).resolves.toHaveProperty('default');
  });
});
