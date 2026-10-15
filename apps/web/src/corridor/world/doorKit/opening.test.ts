import { describe, expect, it } from 'vitest';
import { createBuckets } from '../buckets.ts';
import { DOOR as OUTLINE_DOOR } from '../../../chambers/annex-codex/door.ts';
import { FRAME } from './frame.ts';
import { holeFor } from './plan.ts';
import { buildOpeningFrame, buildOpeningReveal } from './opening.ts';

describe('custom chamber door opening reveals', () => {
  it('finishes both jambs and the head beyond the corridor wall return', () => {
    const buckets = createBuckets();
    buildOpeningReveal(buckets, OUTLINE_DOOR, {});
    const bounds = buckets.plaster.bounds();
    const hole = holeFor(OUTLINE_DOOR);

    expect(bounds.min[0]).toBeCloseTo(-hole.width / 2, 6);
    expect(bounds.max[0]).toBeCloseTo(hole.width / 2, 6);
    expect(bounds.min[1]).toBe(0);
    expect(bounds.max[1]).toBeCloseTo(hole.height, 6);
    expect(bounds.min[2]).toBeLessThan(-(FRAME.reveal + 0.03));
    expect(bounds.max[2]).toBe(0);
    expect(buckets.plaster.triangleCount).toBe(12);
    expect(buckets.brass.bounds().min[0]).toBeCloseTo(-hole.width / 2, 6);
    expect(buckets.brass.bounds().max[0]).toBeCloseTo(hole.width / 2, 6);
    expect(buckets.brass.triangleCount).toBeGreaterThan(0);
  });

  it('carries a standard threshold under the full lining width', () => {
    const buckets = createBuckets();
    const hole = { width: 1.4, height: 2.6 };
    buildOpeningFrame(
      buckets,
      hole,
      { reveal: FRAME.reveal, plasterReveal: false, lining: FRAME.lining, backed: true },
      { trim: {}, plaster: {}, dark: {} },
    );

    expect(buckets.brass.bounds().min[0]).toBeCloseTo(-hole.width / 2, 6);
    expect(buckets.brass.bounds().max[0]).toBeCloseTo(hole.width / 2, 6);
  });
});
