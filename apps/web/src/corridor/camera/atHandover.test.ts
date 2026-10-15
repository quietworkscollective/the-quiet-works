import { describe, expect, it } from 'vitest';
import { START_VIEW } from '../layout.ts';
import { atHandover } from './atHandover.ts';

describe('returning from the lobby to the page', () => {
  it('accepts the handover across the lobby after an angled reverse gesture slides along the back wall', () => {
    const start = START_VIEW.portrait;
    for (const x of [-2, 0, 2]) expect(atHandover({ ...start, x, z: start.z - 0.002 }, start)).toBe(true);
  });

  it('keeps walking while short of the seam or facing away from it', () => {
    const start = START_VIEW.portrait;
    expect(atHandover({ ...start, z: start.z - 0.2 }, start)).toBe(false);
    expect(atHandover({ ...start, yawDeg: start.yawDeg + 90 }, start)).toBe(false);
    expect(atHandover({ ...start, pitchDeg: start.pitchDeg + 5 }, start)).toBe(false);
    expect(atHandover(start, start)).toBe(true);
  });
});
