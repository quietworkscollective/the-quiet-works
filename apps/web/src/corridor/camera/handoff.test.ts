import { describe, expect, it } from 'vitest';
import { handoffFrameMode } from './handoff.ts';

describe('poster handoff frame budget', () => {
  const state = { visible: true, stillHero: true, handoffPending: true, firstFrameSubmitted: true, constrained: true };

  it('holds a submitted software frame while the GPU and DOM finish the handoff', () => {
    expect(handoffFrameMode(state)).toBe('never');
    expect(handoffFrameMode({ ...state, firstFrameSubmitted: false })).toBe('demand');
    expect(handoffFrameMode({ ...state, handoffPending: false })).toBe('demand');
  });

  it('keeps hardware ambient motion and resumes immediately for visitor movement', () => {
    expect(handoffFrameMode({ ...state, constrained: false })).toBe('demand');
    expect(handoffFrameMode({ ...state, stillHero: false })).toBe('demand');
    expect(handoffFrameMode({ ...state, visible: false, stillHero: false })).toBe('never');
  });
});
