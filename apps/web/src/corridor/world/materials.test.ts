import { describe, expect, it } from 'vitest';
import { TERRAZZO_ROUGHNESS, WALKED_TERRAZZO_ROUGHNESS } from './materials.ts';

describe('the walked terrazzo finish', () => {
  it('is visibly glossier than the surrounding honed floor', () => {
    expect(TERRAZZO_ROUGHNESS).toBeGreaterThan(1);
    expect(WALKED_TERRAZZO_ROUGHNESS).toBeGreaterThan(0);
    expect(WALKED_TERRAZZO_ROUGHNESS).toBeLessThan(TERRAZZO_ROUGHNESS * 0.7);
  });
});
