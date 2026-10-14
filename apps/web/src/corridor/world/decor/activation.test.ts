import { describe, expect, it } from 'vitest';
import { shouldLoadCorridorDecor } from './activation.ts';

describe('corridor photographic dressing load boundary', () => {
  it('keeps the untouched landing out of the first-visit model download', () => {
    expect(shouldLoadCorridorDecor({ progress: 0, engaged: false, phase: 'entrance', bakeWorkbench: false })).toBe(false);
  });

  it('loads before the handover as soon as the visitor scrolls or engages', () => {
    expect(shouldLoadCorridorDecor({ progress: 0.01, engaged: false, phase: 'entrance', bakeWorkbench: false })).toBe(true);
    expect(shouldLoadCorridorDecor({ progress: 0, engaged: true, phase: 'entrance', bakeWorkbench: false })).toBe(true);
    expect(shouldLoadCorridorDecor({ progress: 0, engaged: false, phase: 'corridor', bakeWorkbench: false })).toBe(true);
  });

  it('loads eagerly in the lightmap workbench so the baked scene includes the models', () => {
    expect(shouldLoadCorridorDecor({ progress: 0, engaged: false, phase: 'entrance', bakeWorkbench: true })).toBe(true);
  });
});
