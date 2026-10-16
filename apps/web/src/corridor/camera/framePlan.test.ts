import { describe, expect, it } from 'vitest';
import { framePlan, type FrameNeeds } from './framePlan.ts';

const base: FrameNeeds = { visible: true, busy: false, ambientOnly: false, windowOpen: false };

describe('when a frame is drawn', () => {
  it('draws none when nothing moves and no ambient window is open', () => {
    expect(framePlan(base)).toBe('none');
  });

  it('draws at the display pace while something moves', () => {
    expect(framePlan({ ...base, busy: true })).toBe('now');
    expect(framePlan({ ...base, busy: true, windowOpen: true })).toBe('now');
  });

  it('draws at the ambient cadence for the hero drift alone', () => {
    expect(framePlan({ ...base, busy: true, ambientOnly: true })).toBe('ambient');
  });

  it('draws at the ambient cadence while a window is open and nothing else moves', () => {
    expect(framePlan({ ...base, windowOpen: true })).toBe('ambient');
  });

  it('draws nothing while hidden or off screen, whatever else is asked', () => {
    const hidden = { ...base, visible: false };
    expect(framePlan({ ...hidden, busy: true })).toBe('none');
    expect(framePlan({ ...hidden, windowOpen: true })).toBe('none');
    expect(framePlan({ ...hidden, busy: true, ambientOnly: true, windowOpen: true })).toBe('none');
  });

  it('is exhaustive: no combination outside a window or motion ever draws', () => {
    for (const visible of [true, false]) {
      for (const busy of [true, false]) {
        for (const ambientOnly of [true, false]) {
          for (const windowOpen of [true, false]) {
            const plan = framePlan({ visible, busy, ambientOnly, windowOpen });
            if (!visible || (!busy && !windowOpen)) expect(plan).toBe('none');
            else expect(plan).not.toBe('none');
          }
        }
      }
    }
  });
});
