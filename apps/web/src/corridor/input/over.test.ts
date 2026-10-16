import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createOverTracker } from './over.ts';

/** A stand-in for the scene's container: the tracker only reads and writes its dataset. */
const fakeSurface = (): HTMLElement => ({ dataset: {} as DOMStringMap }) as unknown as HTMLElement;

describe('what the pointer is over', () => {
  it('marks the scene only while the pointer is on a door, a prop or the board', () => {
    const surface = fakeSurface();
    const over = createOverTracker(surface);
    expect(surface.dataset['over']).toBeUndefined();
    for (const kind of ['door', 'prop', 'board'] as const) {
      over.enter(kind);
      expect(surface.dataset['over']).toBe(kind);
      over.leave(kind);
      expect(surface.dataset['over']).toBeUndefined();
    }
  });

  it('is not marked on a bare floor, a wall or the background, which never enter anything', () => {
    const surface = fakeSurface();
    createOverTracker(surface);
    expect(surface.dataset['over']).toBeUndefined();
  });

  it('moves from one target straight onto another without a gap, in either order of events', () => {
    const surface = fakeSurface();
    const over = createOverTracker(surface);
    over.enter('prop');
    over.enter('board');
    expect(surface.dataset['over']).toBe('board');
    over.leave('prop');
    expect(surface.dataset['over']).toBe('board');
    over.leave('board');
    expect(surface.dataset['over']).toBeUndefined();
  });

  it('is not cleared by leaving something the pointer was not on', () => {
    const surface = fakeSurface();
    const over = createOverTracker(surface);
    over.enter('door');
    over.leave('prop');
    expect(surface.dataset['over']).toBe('door');
  });

  it('clears everything at once', () => {
    const surface = fakeSurface();
    const over = createOverTracker(surface);
    over.enter('door');
    over.enter('prop');
    over.clear();
    expect(surface.dataset['over']).toBeUndefined();
    expect(over.current()).toBeNull();
  });
});

describe('the scene stylesheet', () => {
  const css = readFileSync(new URL('./scene.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]!.trim(), body: m[2]! }));
  const cursorOf = (selector: string) =>
    rules.find((r) => r.selector.split(',').map((s) => s.trim()).includes(selector))?.body.match(/cursor:\s*([a-z-]+)/)?.[1];

  it('shows the ordinary cursor by default: no hand, no crosshair', () => {
    expect(cursorOf('.tqw-corridor-canvas')).toBe('default');
    expect(css).not.toMatch(/cursor:\s*(grab|crosshair|move|all-scroll)\b/);
  });

  it('shows the pointer only when the scene is marked as over a target', () => {
    expect(cursorOf(".tqw-corridor-canvas[data-over]")).toBe('pointer');
    const pointerRules = rules.filter((r) => /cursor:\s*pointer/.test(r.body)).map((r) => r.selector);
    // The scene itself (over a target) and the buttons drawn over it; nothing else asks for a pointer.
    for (const selector of pointerRules) {
      expect(selector, selector).toMatch(/data-over|tqw-walk__button|hover/);
    }
  });

  it('keeps the grabbing cursor for an actual drag only', () => {
    expect(cursorOf(".tqw-corridor-canvas[data-dragging='true']")).toBe('grabbing');
  });
});
