import { cleanup, render } from '@testing-library/react';
import { useRestingInputGate } from './useRestingInputGate.ts';

function Gate({ engaged, enabled = true }: { engaged: boolean; enabled?: boolean }) {
  useRestingInputGate(engaged, enabled);
  return null;
}

/** What a scene does: listens on window, in the bubble phase, for the wheel and the walking keys. */
function sceneListeners() {
  const wheel = vi.fn();
  const keydown = vi.fn();
  const keyup = vi.fn();
  window.addEventListener('wheel', wheel);
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  return {
    wheel,
    keydown,
    keyup,
    stop: () => {
      window.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
    },
  };
}

const press = (code: string, type: 'keydown' | 'keyup' = 'keydown') => {
  const event = new KeyboardEvent(type, { code, bubbles: true, cancelable: true });
  document.body.dispatchEvent(event);
  return event;
};
const wheel = () => {
  const event = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
  document.body.dispatchEvent(event);
  return event;
};

let scene: ReturnType<typeof sceneListeners>;
beforeEach(() => {
  scene = sceneListeners();
});
afterEach(() => {
  scene.stop();
  cleanup();
});

describe('useRestingInputGate', () => {
  it('keeps the wheel from the scene while the window is only resting', () => {
    render(<Gate engaged={false} />);
    wheel();
    expect(scene.wheel).not.toHaveBeenCalled();
  });

  it.each(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])('keeps %s from the scene while resting', (code) => {
    render(<Gate engaged={false} />);
    press(code);
    expect(scene.keydown).not.toHaveBeenCalled();
  });

  it('lets every other key through: the page and its controls still work', () => {
    render(<Gate engaged={false} />);
    press('Tab');
    press('Enter');
    press('Space');
    press('Escape');
    expect(scene.keydown).toHaveBeenCalledTimes(4);
  });

  it('never stops a key release, so a key held across a state change cannot stay stuck down', () => {
    render(<Gate engaged={false} />);
    press('KeyW', 'keyup');
    expect(scene.keyup).toHaveBeenCalledTimes(1);
  });

  it('does not cancel the browser\'s own scrolling: only the scene\'s listeners are kept out', () => {
    render(<Gate engaged={false} />);
    expect(wheel().defaultPrevented).toBe(false);
    expect(press('ArrowDown').defaultPrevented).toBe(false);
    expect(press('Space').defaultPrevented).toBe(false);
  });

  it('lets the scene have the wheel and the keys once engaged', () => {
    render(<Gate engaged />);
    wheel();
    press('KeyW');
    expect(scene.wheel).toHaveBeenCalledTimes(1);
    expect(scene.keydown).toHaveBeenCalledTimes(1);
  });

  it('follows the state both ways', () => {
    const view = render(<Gate engaged={false} />);
    wheel();
    expect(scene.wheel).toHaveBeenCalledTimes(0);
    view.rerender(<Gate engaged />);
    wheel();
    expect(scene.wheel).toHaveBeenCalledTimes(1);
    view.rerender(<Gate engaged={false} />);
    wheel();
    expect(scene.wheel).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled (text mode has no scene to gate)', () => {
    render(<Gate engaged={false} enabled={false} />);
    wheel();
    press('KeyW');
    expect(scene.wheel).toHaveBeenCalledTimes(1);
    expect(scene.keydown).toHaveBeenCalledTimes(1);
  });

  it('removes its listeners when it goes away', () => {
    const view = render(<Gate engaged={false} />);
    view.unmount();
    wheel();
    press('KeyW');
    expect(scene.wheel).toHaveBeenCalledTimes(1);
    expect(scene.keydown).toHaveBeenCalledTimes(1);
  });
});
