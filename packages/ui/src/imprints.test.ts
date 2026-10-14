import { imprintPose, MAX_IMPRINTS } from './imprints.ts';

describe('imprintPose', () => {
  it('is deterministic: the same index always lies the same way', () => {
    for (let i = 0; i < 30; i += 1) expect(imprintPose(i)).toEqual(imprintPose(i));
  });

  it('keeps every rotation within a few degrees and never level', () => {
    for (let i = 0; i < 200; i += 1) {
      const { tilt } = imprintPose(i);
      expect(Math.abs(tilt)).toBeGreaterThanOrEqual(1.5);
      expect(Math.abs(tilt)).toBeLessThanOrEqual(7);
    }
  });

  it('keeps offsets small enough to stay inside the imprint cell', () => {
    for (let i = 0; i < 200; i += 1) {
      const { dx, dy } = imprintPose(i);
      expect(Math.abs(dx)).toBeLessThanOrEqual(6);
      expect(Math.abs(dy)).toBeLessThanOrEqual(5);
    }
  });

  it('varies from stamp to stamp, with tilts leaning both ways', () => {
    const poses = Array.from({ length: MAX_IMPRINTS }, (_, i) => imprintPose(i));
    expect(new Set(poses.map((p) => p.tilt)).size).toBeGreaterThan(8);
    expect(poses.some((p) => p.tilt < 0)).toBe(true);
    expect(poses.some((p) => p.tilt > 0)).toBe(true);
  });
});
