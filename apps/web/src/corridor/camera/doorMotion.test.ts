import { describe, expect, it } from 'vitest';
import { SPINE_TIMING } from '../../timing.ts';
import {
  approach,
  CLOSE_HOLD_MS,
  CLOSING_END_MS,
  closingAt,
  ENTRY_START_MS,
  openingAt,
  rattleAt,
  SWING_START_MS,
} from './doorMotion.ts';

describe('opening', () => {
  it('stays closed and at rest at the cue', () => {
    expect(openingAt(0)).toEqual({ handle: 0, open: 0 });
    expect(openingAt(-50)).toEqual({ handle: 0, open: 0 });
  });

  it('turns the handle over 140 ms, holds the latch for 80 ms, then swings', () => {
    expect(openingAt(SPINE_TIMING.handleTurnMs).handle).toBe(1);
    expect(openingAt(SPINE_TIMING.handleTurnMs / 2).handle).toBeGreaterThan(0);
    expect(openingAt(SPINE_TIMING.handleTurnMs / 2).handle).toBeLessThan(1);
    expect(SWING_START_MS).toBe(SPINE_TIMING.handleTurnMs + SPINE_TIMING.latchMs);
    expect(openingAt(SWING_START_MS - 1).open).toBe(0);
    expect(openingAt(SWING_START_MS + 40).open).toBeGreaterThan(0);
  });

  it('swings the full 82 degrees over 800 ms and no further', () => {
    expect(openingAt(SWING_START_MS + SPINE_TIMING.swingMs).open).toBe(1);
    expect(openingAt(SWING_START_MS + SPINE_TIMING.swingMs + 1000).open).toBe(1);
    let last = 0;
    for (let ms = 0; ms <= 1200; ms += 10) {
      const { open } = openingAt(ms);
      expect(open).toBeGreaterThanOrEqual(last);
      last = open;
    }
  });

  it('eases the swing: slow to start, quick in the middle, soft at the end', () => {
    const at = (fraction: number) => openingAt(SWING_START_MS + SPINE_TIMING.swingMs * fraction).open;
    expect(at(0.1)).toBeLessThan(0.05);
    expect(at(0.5)).toBeGreaterThan(0.5);
    expect(at(0.9)).toBeGreaterThan(0.95);
  });

  it('lets the lever spring back once the leaf has moved off the latch', () => {
    expect(openingAt(SWING_START_MS + 100).handle).toBe(1);
    expect(openingAt(SWING_START_MS + 120 + 200).handle).toBe(0);
    expect(openingAt(2000).handle).toBe(0);
  });

  it('starts the camera through the door 300 ms into the swing', () => {
    expect(ENTRY_START_MS).toBe(SWING_START_MS + SPINE_TIMING.entryDelayMs);
    // The door is already well open then (the leaf has cleared the visitor's path).
    expect(openingAt(ENTRY_START_MS).open).toBeGreaterThan(0.2);
  });
});

describe('closing', () => {
  it('is open for a beat, then closes over 600 ms', () => {
    expect(closingAt(0)).toBe(1);
    expect(closingAt(CLOSE_HOLD_MS)).toBe(1);
    expect(closingAt(CLOSE_HOLD_MS + SPINE_TIMING.closeMs / 2)).toBeGreaterThan(0);
    expect(closingAt(CLOSE_HOLD_MS + SPINE_TIMING.closeMs / 2)).toBeLessThan(1);
    expect(closingAt(CLOSING_END_MS)).toBe(0);
    expect(closingAt(CLOSING_END_MS + 500)).toBe(0);
  });
});

describe('rattle', () => {
  it('runs a phase through (0, 1] over the rattle time and then rests at 0', () => {
    expect(rattleAt(0)).toBe(0);
    expect(rattleAt(1)).toBeGreaterThan(0);
    expect(rattleAt(SPINE_TIMING.rattleMs / 2)).toBeCloseTo(0.5, 9);
    expect(rattleAt(SPINE_TIMING.rattleMs - 1)).toBeLessThanOrEqual(1);
    expect(rattleAt(SPINE_TIMING.rattleMs)).toBe(0);
    expect(rattleAt(SPINE_TIMING.rattleMs + 100)).toBe(0);
  });
});

describe('approach', () => {
  it('moves toward the target without overshooting and lands on it', () => {
    let value = 0;
    for (let i = 0; i < 100; i += 1) {
      value = approach(value, 1, 1000 / 60, 90);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(value).toBe(1);
  });

  it('makes about 63% of the way in one time constant', () => {
    expect(approach(0, 1, 90, 90)).toBeCloseTo(1 - Math.exp(-1), 6);
  });
});
