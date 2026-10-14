import { describe, expect, it } from 'vitest';
import { Group, Vector3 } from 'three';
import { beatAt, beatDuration, beatKind, pressAt, impression, SPILL_STEPS, poseFoldPanel, windowTarget } from './beatMotion.ts';

const guards: Array<{ name: string; check: () => void }> = [
  { name: 'five different material responses', check: () => {
    expect([1, 2, 3, 4, 5].map(beatKind)).toEqual(['receive', 'expire', 'witness', 'fold', 'authority']);
  } },
  { name: 'receive travels 350mm and returns the original', check: () => {
    expect(beatAt(1, 450).travel).toBeCloseTo(0.35, 6);
    expect(beatAt(1, 1100).travel).toBe(0);
    expect(beatAt(1, 1100).active).toBe(false);
  } },
  { name: 'expiry overlay and tab precede reversing paper settlement', check: () => {
    const paused = beatAt(2, 600);
    const returning = beatAt(2, 1000);
    expect(paused.overlay).toBeGreaterThan(0);
    expect(returning.expired).toBe(true);
    expect(returning.travel).toBeGreaterThan(0);
    expect(returning.travel).toBeLessThan(paused.travel);
    expect(beatAt(2, 1400).travel).toBe(0);
  } },
  { name: 'carbon reaches the world window then returns unsigned', check: () => {
    expect(beatAt(3, 850).duplicate).toBe(1);
    expect(beatAt(3, 1350).duplicate).toBe(1);
    expect(beatAt(3, 2000).duplicate).toBe(0);
    expect(beatAt(3, 2000).unsigned).toBe(true);
    const desk = new Group();
    desk.position.set(-1, 0.82, 4);
    desk.rotation.y = Math.PI;
    desk.updateMatrixWorld(true);
    const world = new Vector3(-2.25, 1.08, 8);
    const local = windowTarget(desk, world.toArray());
    expect(desk.localToWorld(local).distanceTo(world)).toBeLessThan(1e-9);
  } },
  { name: 'fan fold grows beyond its tray and drapes', check: () => {
    const start = beatAt(4, 0);
    const end = beatAt(4, 2200);
    expect(end.folds).toBeGreaterThan(start.folds);
    expect(end.folds).toBe(6);
    expect(end.drape).toBeGreaterThan(0.2);
    const panels = Array.from({ length: 6 }, (_, i) => {
      const panel = new Group();
      poseFoldPanel(panel, i, end.folds, end.drape, new Vector3(0, 0.0115, 0.092));
      panel.updateMatrixWorld(true);
      return panel;
    });
    for (let i = 0; i < 5; i += 1) {
      const tail = panels[i]!.localToWorld(new Vector3(0, 0, 0.09));
      const head = panels[i + 1]!.localToWorld(new Vector3(0, 0, -0.09));
      expect(tail.distanceTo(head)).toBeLessThan(1e-9);
    }
    expect(panels[5]!.position.y).toBeLessThan(-0.2);
  } },
  { name: 'authority retracts then releases linkage with three receipts', check: () => {
    expect(beatAt(5, 450).travel).toBeCloseTo(0.35, 6);
    expect(beatAt(5, 450).rearRelease).toBe(0);
    expect(beatAt(5, 3000).rearRelease).toBe(1);
    expect(SPILL_STEPS).toHaveLength(3);
  } },
  { name: 'aftermath has only three repeating finite paper variants', check: () => {
    const kinds = Array.from({ length: 30 }, (_, i) => beatKind(i + 6));
    expect(new Set(kinds).size).toBe(3);
    expect(kinds.slice(0, 3)).toEqual(kinds.slice(27));
    for (let step = 6; step < 36; step += 1) {
      expect(beatAt(step, 10000).rearRelease).toBe(1);
      expect(beatAt(step, 10000).active).toBe(false);
    }
  } },
  { name: '65mm two stage travel and bounded hold change ink not validity', check: () => {
    expect(pressAt(0, 0).travel).toBe(0);
    expect(pressAt(100, 0).travel).toBeCloseTo(0.045, 6);
    expect(pressAt(180, 0).travel).toBeCloseTo(0.065, 6);
    expect(pressAt(180, 1200).compression).toBeGreaterThan(pressAt(180, 150).compression);
    expect(pressAt(180, 8000)).toEqual(pressAt(180, 1200));
    const light = impression('left', false, 150);
    const rich = impression('right', true, 1200);
    expect(light.offset).toBeLessThan(0);
    expect(rich.offset).toBeGreaterThan(0);
    expect(rich.spread).toBeGreaterThan(light.spread);
    expect(rich.opacity).toBeGreaterThan(light.opacity);
    expect([light.valid, rich.valid]).toEqual([true, true]);
  } },
  { name: 'reduced motion skips travel and every beat reaches demand idle', check: () => {
    for (let step = 1; step <= 8; step += 1) {
      const end = beatAt(step, beatDuration(step));
      expect(beatAt(step, 500, true).travel).toBe(end.travel);
      expect(beatAt(step, 500, true).duplicate).toBe(end.duplicate);
      expect(beatAt(step, 120, true).active).toBe(false);
      expect(end.active).toBe(false);
      expect(beatAt(step, -100).travel).toBe(0);
      expect(beatAt(step, beatDuration(step) + 5000)).toEqual(end);
    }
  } },
];

describe('physical Office beats', () => {
  it.each(guards)('$name', ({ check }) => check());
});

it('feeds exactly one additional confirmation fold', () => {
  expect(beatAt(4, 0).folds).toBe(5);
  expect(beatAt(4, 2200).folds).toBe(6);
});
