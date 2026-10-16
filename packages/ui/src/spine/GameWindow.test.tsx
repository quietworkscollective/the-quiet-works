import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { GAME_WINDOW_COPY, LANDING } from '@tqw/engine';
import { GameWindow } from './GameWindow.tsx';
import { fakeProgress } from './testHelpers.ts';
import type { GameWindowProps } from './types.ts';

interface Harness {
  onEnter: ReturnType<typeof vi.fn>;
  onLeave: ReturnType<typeof vi.fn>;
  onOpenMenu: ReturnType<typeof vi.fn>;
  onFullscreenChange: ReturnType<typeof vi.fn>;
  progress: ReturnType<typeof fakeProgress>;
  props: GameWindowProps;
  view: ReturnType<typeof render>;
}

function setup(over: Partial<GameWindowProps> = {}, start = 1): Harness {
  const progress = fakeProgress(start);
  const handlers = { onEnter: vi.fn(), onLeave: vi.fn(), onOpenMenu: vi.fn(), onFullscreenChange: vi.fn() };
  const props: GameWindowProps = {
    progress,
    engaged: false,
    location: 'The Quiet Works · Corridor',
    children: <div data-testid="world">world</div>,
    ...handlers,
    ...over,
  };
  const view = render(<GameWindow {...props} />);
  return { ...handlers, progress, props, view };
}

/** A browser that can do fullscreen: the one window element can be taken, and left again. */
function stubFullscreen() {
  let current: Element | null = null;
  const requestFullscreen = vi.fn((element: Element) => {
    current = element;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  });
  const exitFullscreen = vi.fn(() => {
    current = null;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  });
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => current });
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen });
  Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
    configurable: true,
    value: function request(this: Element) {
      return requestFullscreen(this);
    },
  });
  return {
    requestFullscreen,
    exitFullscreen,
    /** The browser's own exit (Escape, a system gesture): the page is not asked. */
    browserExit: () => {
      current = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    },
  };
}

function unstubFullscreen() {
  for (const key of ['fullscreenEnabled', 'fullscreenElement', 'exitFullscreen']) Reflect.deleteProperty(document, key);
  Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen');
}

afterEach(() => {
  cleanup();
  unstubFullscreen();
});

describe('GameWindow: resting', () => {
  it('is a section named "The game window", reachable at #game, holding the world', () => {
    setup();
    const section = screen.getByRole('region', { name: GAME_WINDOW_COPY.label });
    expect(section.id).toBe('game');
    expect(within(section).getByTestId('world')).toBeTruthy();
  });

  it('shows the strip title and a 48 px Enter control with the line that says what it does', () => {
    setup();
    expect(screen.getByText(GAME_WINDOW_COPY.title).className).toContain('tqw-game__title');
    expect(screen.getByRole('button', { name: LANDING.enter })).toBeTruthy();
    expect(screen.getByText(GAME_WINDOW_COPY.enterLine)).toBeTruthy();
  });

  it('has no Leave control and no location while resting', () => {
    setup();
    expect(screen.queryByRole('button', { name: /^Leave/ })).toBeNull();
    expect(screen.queryByText('The Quiet Works · Corridor')).toBeNull();
  });

  it('says the page scrolls, in words, for touch', () => {
    setup();
    expect(screen.getByText(GAME_WINDOW_COPY.modeResting)).toBeTruthy();
    expect(screen.queryByText(GAME_WINDOW_COPY.modeEngaged)).toBeNull();
  });

  it('enters when the Enter control is pressed, and only then', () => {
    const { onEnter, onLeave } = setup();
    fireEvent.click(screen.getByRole('button', { name: LANDING.enter }));
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('marks the window as not engaged, for the stylesheet and for tests', () => {
    const { view } = setup();
    expect(view.container.querySelector('.tqw-game__window')?.getAttribute('data-engaged')).toBe('false');
  });
});

describe('GameWindow: engaged', () => {
  it('swaps Enter for "Leave · Esc" with the location beside it', () => {
    const { view } = setup({ engaged: true });
    expect(view.container.querySelector('.tqw-game__window')?.getAttribute('data-engaged')).toBe('true');
    const leave = screen.getByRole('button', { name: /Leave/ });
    expect(leave.getAttribute('aria-keyshortcuts')).toBe('Escape');
    expect(leave.textContent).toContain('Leave');
    expect(leave.textContent).toContain('Esc');
    expect(screen.getByText('The Quiet Works · Corridor').className).toContain('tqw-game__location');
    expect(screen.queryByRole('button', { name: LANDING.enter })).toBeNull();
    expect(screen.queryByText(GAME_WINDOW_COPY.enterLine)).toBeNull();
  });

  it('hides the key hint from assistive technology: the shortcut is announced by aria-keyshortcuts', () => {
    setup({ engaged: true });
    expect(screen.getByRole('button', { name: 'Leave' })).toBeTruthy();
  });

  it('hands scrolling back when Leave is pressed', () => {
    const { onLeave, onEnter } = setup({ engaged: true });
    fireEvent.click(screen.getByRole('button', { name: /Leave/ }));
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('says the touch mode is walking', () => {
    setup({ engaged: true });
    expect(screen.getByText(GAME_WINDOW_COPY.modeEngaged)).toBeTruthy();
    expect(screen.queryByText(GAME_WINDOW_COPY.modeResting)).toBeNull();
  });

  it('offers "Return to the corridor" inside a room, engaged or resting', () => {
    const onReturn = vi.fn();
    setup({ engaged: true, onReturn });
    fireEvent.click(screen.getByRole('button', { name: 'Return to the corridor' }));
    expect(onReturn).toHaveBeenCalledTimes(1);
    cleanup();
    setup({ engaged: true });
    expect(screen.queryByRole('button', { name: 'Return to the corridor' })).toBeNull();
    cleanup();
    setup({ engaged: false, onReturn });
    fireEvent.click(screen.getByRole('button', { name: 'Return to the corridor' }));
    expect(onReturn).toHaveBeenCalledTimes(2);
    cleanup();
    setup({ engaged: false });
    expect(screen.queryByRole('button', { name: 'Return to the corridor' })).toBeNull();
  });
});

describe('GameWindow: the controls appear as the smoke clears', () => {
  it('keeps the chrome off until the last fifth of the run, then reveals it in proportion', () => {
    const { view, progress } = setup({}, 0.5);
    const window = view.container.querySelector('.tqw-game__window') as HTMLElement;
    expect(window.getAttribute('data-chrome')).toBe('off');
    act(() => progress.set(0.8));
    expect(window.getAttribute('data-chrome')).toBe('off');
    act(() => progress.set(0.9));
    expect(window.getAttribute('data-chrome')).toBe('on');
    expect(window.style.getPropertyValue('--tqw-chrome-o')).toBe('0.500');
    act(() => progress.set(1));
    expect(window.style.getPropertyValue('--tqw-chrome-o')).toBe('1.000');
    act(() => progress.set(0.3));
    expect(window.getAttribute('data-chrome')).toBe('off');
    expect(window.style.getPropertyValue('--tqw-chrome-o')).toBe('0.000');
  });

  it('is already on when the page arrives at the window (a deep link)', () => {
    const { view } = setup({}, 1);
    expect(view.container.querySelector('.tqw-game__window')?.getAttribute('data-chrome')).toBe('on');
  });
});

describe('GameWindow: focus follows the state', () => {
  it('moves focus to Leave when engaged and back to Enter when released, if focus was in the window', () => {
    const { view, props } = setup();
    screen.getByRole('button', { name: LANDING.enter }).focus();
    view.rerender(<GameWindow {...props} engaged />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Leave/ }));
    view.rerender(<GameWindow {...props} engaged={false} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: LANDING.enter }));
  });

  it('never takes focus from somewhere else on the page', () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    const { view, props } = setup();
    outside.focus();
    view.rerender(<GameWindow {...props} engaged />);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});

describe('GameWindow: tools', () => {
  it('opens the menu, naming it as a dialog trigger', () => {
    const { onOpenMenu } = setup();
    const menu = screen.getByRole('button', { name: 'Menu' });
    expect(menu.getAttribute('aria-haspopup')).toBe('dialog');
    fireEvent.click(menu);
    expect(onOpenMenu).toHaveBeenCalledTimes(1);
  });

  it('shows a sound control once audio is on, pressed meaning sound is on', () => {
    const onToggle = vi.fn();
    setup({ sound: { muted: false, onToggle } });
    const sound = screen.getByRole('button', { name: 'Sound' });
    expect(sound.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(sound);
    expect(onToggle).toHaveBeenCalledTimes(1);
    cleanup();
    setup();
    expect(screen.queryByRole('button', { name: 'Sound' })).toBeNull();
  });

  it('renders the veil it is given above the world', () => {
    const { view } = setup({ veil: <div data-testid="veil" /> });
    const world = view.container.querySelector('.tqw-game__world') as HTMLElement;
    const veil = screen.getByTestId('veil');
    expect(world.compareDocumentPosition(veil) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('GameWindow: Fullscreen', () => {
  it('leaves the control out where the browser cannot do fullscreen', () => {
    setup();
    expect(screen.queryByRole('button', { name: GAME_WINDOW_COPY.fullscreen })).toBeNull();
  });

  it('takes the game window itself into fullscreen, so the world, chrome and veil all go with it', () => {
    const fs = stubFullscreen();
    const { view } = setup();
    fireEvent.click(screen.getByRole('button', { name: GAME_WINDOW_COPY.fullscreen }));
    expect(fs.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(fs.requestFullscreen.mock.calls[0]?.[0]).toBe(view.container.querySelector('.tqw-game__window'));
  });

  it('says "Exit fullscreen" while active and reports the change', () => {
    stubFullscreen();
    const { onFullscreenChange, view } = setup();
    fireEvent.click(screen.getByRole('button', { name: GAME_WINDOW_COPY.fullscreen }));
    expect(onFullscreenChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('button', { name: GAME_WINDOW_COPY.exitFullscreen })).toBeTruthy();
    expect(screen.queryByRole('button', { name: GAME_WINDOW_COPY.fullscreen })).toBeNull();
    expect(view.container.querySelector('.tqw-game__window')?.getAttribute('data-fullscreen')).toBe('true');
  });

  it('exits from its own control, and reports it', () => {
    const fs = stubFullscreen();
    const { onFullscreenChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: GAME_WINDOW_COPY.fullscreen }));
    fireEvent.click(screen.getByRole('button', { name: GAME_WINDOW_COPY.exitFullscreen }));
    expect(fs.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(onFullscreenChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: GAME_WINDOW_COPY.fullscreen })).toBeTruthy();
  });

  it('hears the browser\'s own exit (Escape, a system gesture) too: that releases the window', () => {
    const fs = stubFullscreen();
    const { onFullscreenChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: GAME_WINDOW_COPY.fullscreen }));
    act(() => fs.browserExit());
    expect(onFullscreenChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: GAME_WINDOW_COPY.fullscreen })).toBeTruthy();
    expect(fs.exitFullscreen).not.toHaveBeenCalled();
  });

  it('ignores another element\'s fullscreen: only the game window counts', () => {
    stubFullscreen();
    const { onFullscreenChange } = setup();
    const other = document.createElement('video');
    document.body.append(other);
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => other });
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(onFullscreenChange).toHaveBeenLastCalledWith(false);
    other.remove();
  });
});

describe('GameWindow: text mode', () => {
  it('is plain reading order: the section and its children, with no window, chrome, Enter or Fullscreen', () => {
    stubFullscreen();
    const { view } = setup({ text: true });
    const section = screen.getByRole('region', { name: GAME_WINDOW_COPY.label });
    expect(section.id).toBe('game');
    expect(within(section).getByTestId('world')).toBeTruthy();
    expect(view.container.querySelector('.tqw-game__window')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(section.className).toContain('tqw-game--text');
  });
});
