import { describe, expect, it } from 'vitest';
import { pastGameWindowAt, sceneVisible, type VisibilityState } from './visibility.ts';

const base: VisibilityState = {
  documentVisible: true,
  intersecting: true,
  fixed: false,
  scrollY: 0,
  viewportHeight: 900,
  fullscreen: false,
};
const state = (over: Partial<VisibilityState>): VisibilityState => ({ ...base, ...over });

describe('scene visibility', () => {
  it('is visible in the viewport of a visible tab', () => {
    expect(sceneVisible(base)).toBe(true);
  });

  it('is not visible in a hidden tab, whatever else is true', () => {
    expect(sceneVisible(state({ documentVisible: false }))).toBe(false);
    expect(sceneVisible(state({ documentVisible: false, fullscreen: true }))).toBe(false);
  });

  it('is not visible once it has left the viewport (a scene in the page flow)', () => {
    expect(sceneVisible(state({ intersecting: false }))).toBe(false);
    expect(sceneVisible(state({ intersecting: false, scrollY: 100 }))).toBe(false);
  });

  it('ends at the bottom of the game window for a fixed scene: 2.5 viewports of run plus its own', () => {
    expect(pastGameWindowAt(900)).toBe(3.5 * 900);
    expect(sceneVisible(state({ fixed: true, scrollY: 0 }))).toBe(true);
    expect(sceneVisible(state({ fixed: true, scrollY: 2.5 * 900 }))).toBe(true);
    expect(sceneVisible(state({ fixed: true, scrollY: 3.5 * 900 - 1 }))).toBe(true);
    expect(sceneVisible(state({ fixed: true, scrollY: 3.5 * 900 }))).toBe(false);
    expect(sceneVisible(state({ fixed: true, scrollY: 8000 }))).toBe(false);
  });

  it('does not use the scroll position for a scene that is not fixed: the viewport test decides', () => {
    expect(sceneVisible(state({ fixed: false, scrollY: 8000, intersecting: true }))).toBe(true);
  });

  it('is always visible while fullscreen, wherever the page is scrolled', () => {
    expect(sceneVisible(state({ fullscreen: true, intersecting: false, fixed: true, scrollY: 9000 }))).toBe(true);
  });
});
