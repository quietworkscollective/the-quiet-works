import { describe, expect, it } from 'vitest';
import { createUi } from './ui.ts';

describe('what the scene and the page tell each other', () => {
  it('notes the verb a press began as and gives it back once, per target', () => {
    const ui = createUi();
    ui.arm('needle', 'play');
    ui.arm('records', 'change');
    expect(ui.take('needle', 'lift')).toBe('play');
    // Taken: the next press without a note means what its label says.
    expect(ui.take('needle', 'lift')).toBe('lift');
    expect(ui.take('records', 'play')).toBe('change');
  });

  it('forgets a noted verb that was never pressed to its end', () => {
    const ui = createUi();
    ui.arm('needle', 'play');
    ui.disarm('needle');
    expect(ui.take('needle', 'lift')).toBe('lift');
  });

  it('tells listeners when the hover or the focus changes, and only then', () => {
    const ui = createUi();
    let told = 0;
    const off = ui.subscribe(() => (told += 1));
    ui.setHover('needle');
    ui.setHover('needle');
    ui.setFocus('records');
    ui.setFocus('records');
    expect(told).toBe(2);
    ui.setScreen('needle', 10, 20, true);
    expect(told).toBe(2);
    expect(ui.state.screen.needle).toEqual({ x: 10, y: 20, visible: true });
    off();
    ui.setHover(null);
    expect(told).toBe(2);
  });
});
