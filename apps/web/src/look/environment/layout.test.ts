import { describe, expect, it } from 'vitest';
import { kelvinToLinear } from '../colour.ts';
import {
  angleBetween,
  environmentLayout,
  meanLuminance,
  normalisedRadiance,
  patchHalfExtent,
  patchSolidAngle,
  type EnvironmentPatch,
} from './layout.ts';
import { CORRIDOR_LOOK, LOOK_PROFILES } from '../profiles.ts';
import { inRange, LOOK_RANGES } from '../ranges.ts';

const profiles = Object.values(LOOK_PROFILES);

describe('generated environment layout', () => {
  it('has broad warm ceiling patches, one window patch and a floor-bounce patch', () => {
    const layout = environmentLayout(CORRIDOR_LOOK.environment);
    expect(layout.patches.map((p) => p.id)).toEqual(['ceiling-left', 'ceiling-right', 'window', 'floor-bounce']);
  });

  it('colours the ceiling patches at 2800 to 3200 K in every space', () => {
    for (const profile of profiles) {
      const layout = environmentLayout(profile.environment);
      for (const patch of layout.patches.filter((p) => p.id.startsWith('ceiling'))) {
        expect(inRange(patch.kelvin, LOOK_RANGES.ceilingKelvin), `${profile.space} ${patch.id} ${patch.kelvin} K`).toBe(true);
        const [r, g, b] = kelvinToLinear(patch.kelvin);
        expect(r, 'warm: red leads').toBeGreaterThan(g);
        expect(g).toBeGreaterThan(b);
        expect(r / b, 'warm enough to read as lamplight').toBeGreaterThan(1.6);
      }
    }
  });

  it('makes the window patch dim and neutral', () => {
    for (const profile of profiles) {
      const layout = environmentLayout(profile.environment);
      const windowPatch = layout.patches.find((p) => p.id === 'window')!;
      const ceiling = layout.patches.find((p) => p.id === 'ceiling-left')!;
      expect(windowPatch.weight).toBeLessThan(ceiling.weight);
      const [r, , b] = kelvinToLinear(windowPatch.kelvin);
      expect(Math.abs(r - b), `${profile.space} window colour`).toBeLessThan(0.08);
    }
  });

  it('keeps the floor bounce faint and warm', () => {
    for (const profile of profiles) {
      const floor = environmentLayout(profile.environment).patches.find((p) => p.id === 'floor-bounce')!;
      expect(floor.weight).toBeGreaterThan(0);
      expect(floor.weight).toBeLessThanOrEqual(0.15);
      expect(floor.direction[1]).toBe(-1);
      expect(floor.kelvin).toBeLessThan(4000);
    }
  });

  it('uses unit directions and keeps the patches apart', () => {
    const { patches } = environmentLayout(CORRIDOR_LOOK.environment);
    for (const p of patches) expect(Math.hypot(...p.direction), p.id).toBeCloseTo(1, 9);
    for (let i = 0; i < patches.length; i += 1) {
      for (let j = i + 1; j < patches.length; j += 1) {
        const a = patches[i]!;
        const b = patches[j]!;
        expect(angleBetween(a, b), `${a.id} against ${b.id}`).toBeGreaterThan(patchHalfExtent(a) + patchHalfExtent(b));
      }
    }
  });
});

describe('environment radiance normalisation', () => {
  it('averages luminance 1 over the sphere, so the intensity means a fraction of a unit ambient', () => {
    for (const profile of profiles) {
      const layout = environmentLayout(profile.environment);
      expect(meanLuminance(layout, normalisedRadiance(layout)), profile.space).toBeCloseTo(1, 9);
    }
  });

  it('holds the mean at 1 when a patch is moved or made brighter', () => {
    const layout = environmentLayout(CORRIDOR_LOOK.environment);
    const heavier = { ...layout, patches: layout.patches.map((p) => (p.id === 'window' ? { ...p, weight: p.weight * 5 } : p)) };
    expect(meanLuminance(heavier, normalisedRadiance(heavier))).toBeCloseTo(1, 9);
    const wider = { ...layout, patches: layout.patches.map((p) => (p.id === 'ceiling-left' ? { ...p, size: [6, 4.8] as const } : p)) };
    expect(meanLuminance(wider, normalisedRadiance(wider))).toBeCloseTo(1, 9);
  });

  it('keeps the ceiling brighter than the window and the window brighter than the room around it', () => {
    const layout = environmentLayout(CORRIDOR_LOOK.environment);
    const radiance = normalisedRadiance(layout);
    expect(radiance.patches['ceiling-left']).toBeGreaterThan(radiance.patches.window);
    expect(radiance.patches.window).toBeGreaterThan(radiance.base);
    expect(radiance.base).toBeGreaterThan(0);
  });
});

describe('patch solid angle', () => {
  const patch = (size: readonly [number, number], distance: number): EnvironmentPatch => ({
    id: 'window', direction: [0, 1, 0], distance, size, kelvin: 3000, weight: 1,
  });

  it('is area over distance squared for a small patch far away', () => {
    expect(patchSolidAngle(patch([0.1, 0.1], 10))).toBeCloseTo(0.01 / 100, 6);
  });

  it('approaches a hemisphere for a huge patch close up, and never exceeds a sphere', () => {
    expect(patchSolidAngle(patch([1e5, 1e5], 1))).toBeCloseTo(2 * Math.PI, 3);
    expect(patchSolidAngle(patch([1e6, 1e6], 1))).toBeLessThan(4 * Math.PI);
  });

  it('grows with the patch', () => {
    expect(patchSolidAngle(patch([3, 2.4], 4))).toBeGreaterThan(patchSolidAngle(patch([1.8, 1.5], 4)));
  });
});
