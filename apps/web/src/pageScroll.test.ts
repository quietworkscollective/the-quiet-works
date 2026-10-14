import { describe, expect, it } from 'vitest';
import { escapeReleases, LEAVE_SLACK_PX, progressAt, REACH_SLACK_PX, scrollAction } from './pageScroll.ts';

const TOP = 2250;

describe('progressAt', () => {
  it('is 0 at the top of the hero and 1 at the game window', () => {
    expect(progressAt(0, TOP)).toBe(0);
    expect(progressAt(TOP, TOP)).toBe(1);
  });

  it('is the fraction of the journey in between', () => {
    expect(progressAt(TOP / 2, TOP)).toBe(0.5);
    expect(progressAt(TOP * 0.8, TOP)).toBeCloseTo(0.8, 10);
  });

  it('stays within 0..1 past either end (overscroll, or the page below the window)', () => {
    expect(progressAt(-40, TOP)).toBe(0);
    expect(progressAt(TOP + 3000, TOP)).toBe(1);
  });

  it('is 0 when there is no run to measure', () => {
    expect(progressAt(100, 0)).toBe(0);
    expect(progressAt(100, -5)).toBe(0);
    expect(progressAt(100, Number.NaN)).toBe(0);
  });
});

describe('scrollAction', () => {
  const at = (y: number, phase: 'entrance' | 'corridor' | 'threshold' | 'chamber', engaged = false) => scrollAction({ y, top: TOP, phase, engaged });

  it('hands over to the corridor when the window\'s top is reached from the entrance', () => {
    expect(at(TOP, 'entrance')).toBe('handover');
    expect(at(TOP + 500, 'entrance')).toBe('handover');
  });

  it('allows two pixels of slack at the top, and not more', () => {
    // The numbers are the contract, not whatever the constant says today.
    expect(REACH_SLACK_PX).toBe(2);
    expect(at(TOP - 2, 'entrance')).toBe('handover');
    expect(at(TOP - 3, 'entrance')).toBeNull();
  });

  it('does nothing in the entrance while the window is still ahead', () => {
    expect(at(0, 'entrance')).toBeNull();
    expect(at(TOP * 0.7, 'entrance')).toBeNull();
  });

  it('returns to the entrance when the visitor scrolls back above the window, from the corridor', () => {
    expect(at(TOP - LEAVE_SLACK_PX - 1, 'corridor')).toBe('return');
    expect(at(0, 'corridor')).toBe('return');
  });

  it('holds the corridor inside a 24 px hysteresis band, so a nudge never flickers between states', () => {
    expect(LEAVE_SLACK_PX).toBe(24);
    expect(at(TOP, 'corridor')).toBeNull();
    expect(at(TOP - 10, 'corridor')).toBeNull();
    expect(at(TOP - 24, 'corridor')).toBeNull();
    expect(at(TOP - 25, 'corridor')).toBe('return');
    expect(at(TOP + 400, 'corridor')).toBeNull();
  });

  it('never acts while the window is engaged: the page is held and nothing here moves the visitor', () => {
    expect(at(TOP, 'entrance', true)).toBeNull();
    expect(at(0, 'corridor', true)).toBeNull();
  });

  it('never interrupts a chamber or a threshold by scrolling', () => {
    for (const phase of ['threshold', 'chamber'] as const) {
      expect(at(0, phase)).toBeNull();
      expect(at(TOP, phase)).toBeNull();
    }
  });

  it('does nothing where there is no run (the section is not laid out)', () => {
    expect(scrollAction({ y: 100, top: 0, phase: 'entrance', engaged: false })).toBeNull();
    expect(scrollAction({ y: 0, top: 0, phase: 'corridor', engaged: false })).toBeNull();
  });
});

describe('escapeReleases', () => {
  const base = { key: 'Escape', defaultPrevented: false, dialogOpen: false, engaged: true, textMode: false };

  it('releases an engaged window', () => {
    expect(escapeReleases(base)).toBe(true);
  });

  it('closes a dialog first: with one open, the window keeps its hold', () => {
    expect(escapeReleases({ ...base, dialogOpen: true })).toBe(false);
  });

  it('is for Escape only', () => {
    expect(escapeReleases({ ...base, key: 'Enter' })).toBe(false);
    expect(escapeReleases({ ...base, key: 'q' })).toBe(false);
  });

  it('leaves a press something else has already handled alone', () => {
    expect(escapeReleases({ ...base, defaultPrevented: true })).toBe(false);
  });

  it('has nothing to release when the window is resting, or in text mode', () => {
    expect(escapeReleases({ ...base, engaged: false })).toBe(false);
    expect(escapeReleases({ ...base, textMode: true })).toBe(false);
  });
});
