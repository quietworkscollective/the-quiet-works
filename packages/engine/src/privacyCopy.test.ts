import { describe, expect, it } from 'vitest';
import { DISCOVERY_STORAGE_KEY } from './discoveries.ts';
import { PRIVACY } from './siteCopy.ts';

/**
 * The Privacy page is the visitor's account of what the site keeps. The discovery store writes one
 * local-storage key after the first find, so the page must name that key and say that nothing is
 * stored before it. Without both, the page can again say that nothing is stored at all.
 */
describe('Privacy page and the discovery store', () => {
  const text = PRIVACY.body.join(' ');

  it('names the one storage key the discovery store writes', () => {
    expect(text).toContain(DISCOVERY_STORAGE_KEY);
  });

  it('says that nothing is stored until the first find', () => {
    expect(text).toMatch(/until you find something, it stores nothing/i);
  });
});
