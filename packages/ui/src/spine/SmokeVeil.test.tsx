import { act, cleanup, render, screen } from '@testing-library/react';
import { GAME_WINDOW_COPY } from '@tqw/engine';
import { SmokeVeil } from './SmokeVeil.tsx';
import { fakeProgress } from './testHelpers.ts';
import type { SmokeVeilProps } from './types.ts';

vi.mock('./smokeNoise.ts', () => ({ smokeTextureUrl: vi.fn(() => Promise.resolve('blob:smoke-test')) }));

/** The shell's veil keyframes (SITE_SCROLL.veil), restated so this file does not depend on apps/web. */
const KEYFRAMES = [
  [0, 0],
  [0.2, 0.15],
  [0.55, 0.85],
  [0.65, 1],
  [0.8, 1],
  [1, 0],
] as const;

function setup(over: Partial<SmokeVeilProps> = {}, start = 0) {
  const progress = fakeProgress(start);
  const props: SmokeVeilProps = { progress, keyframes: KEYFRAMES, reducedMotion: false, ready: true, loadingDelayMs: 300, ...over };
  const view = render(<SmokeVeil {...props} />);
  const root = view.container.querySelector('.tqw-veil') as HTMLElement;
  return { progress, props, view, root };
}

beforeEach(() => {
  vi.useFakeTimers();
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SmokeVeil: coverage follows the scroll', () => {
  it('writes the coverage for the starting progress: clear at the top', () => {
    const { root } = setup({}, 0);
    expect(root.dataset['coverage']).toBe('0.000');
    expect(root.style.getPropertyValue('--tqw-veil')).toBe('0.0000');
  });

  it('interpolates the shell\'s keyframes as progress moves, in both directions', () => {
    const { root, progress } = setup();
    act(() => progress.set(0.2));
    expect(root.dataset['coverage']).toBe('0.150');
    act(() => progress.set(0.375));
    expect(root.dataset['coverage']).toBe('0.500');
    act(() => progress.set(0.65));
    expect(root.dataset['coverage']).toBe('1.000');
    act(() => progress.set(0.9));
    expect(root.dataset['coverage']).toBe('0.500');
    act(() => progress.set(0));
    expect(root.dataset['coverage']).toBe('0.000');
  });

  it('is fully clear again at the game window, so the world is seen', () => {
    const { root, progress } = setup();
    act(() => progress.set(1));
    expect(root.dataset['coverage']).toBe('0.000');
  });

  it('is a decorative layer: its parts are hidden from assistive technology', () => {
    const { root } = setup();
    for (const part of root.querySelectorAll('.tqw-veil__backing, .tqw-veil__layer')) expect(part.getAttribute('aria-hidden')).toBe('true');
  });

  it('stops listening to the scroll when it goes away', () => {
    const { progress, view, root } = setup();
    view.unmount();
    act(() => progress.set(0.4));
    expect(root.dataset['coverage']).toBe('0.000');
  });
});

describe('SmokeVeil: the texture', () => {
  it('draws the one texture once, as a custom property the two layers share', async () => {
    const { root } = setup();
    await act(async () => {
      await Promise.resolve();
    });
    expect(root.dataset['textured']).toBe('true');
    expect(root.style.getPropertyValue('--tqw-smoke')).toBe('url("blob:smoke-test")');
    expect(root.querySelectorAll('.tqw-veil__layer')).toHaveLength(2);
  });

  it('revokes the texture it made when it goes away', async () => {
    const { view } = setup();
    await act(async () => {
      await Promise.resolve();
    });
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:smoke-test');
  });

  it('makes no texture under reduced motion, and says so', async () => {
    const { root } = setup({ reducedMotion: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(root.dataset['reduced']).toBe('true');
    expect(root.dataset['textured']).toBeUndefined();
    expect(root.style.getPropertyValue('--tqw-smoke')).toBe('');
  });
});

describe('SmokeVeil: "Loading" only when the game is late', () => {
  it('stays silent while the veil is thin, however long the game takes', () => {
    setup({ ready: false }, 0.3);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('does not appear until loadingDelayMs after the veil is full', () => {
    setup({ ready: false }, 0.7);
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(screen.queryByRole('status')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('status').textContent).toBe(GAME_WINDOW_COPY.loading);
  });

  it('never flashes when the game is ready by the time the veil is full', () => {
    setup({ ready: true }, 0.7);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('goes as soon as the game is ready, and its timer is cleared', () => {
    const { view, props } = setup({ ready: false }, 0.7);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByRole('status')).toBeTruthy();
    view.rerender(<SmokeVeil {...props} ready />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('starts the wait again if the veil thins and fills a second time', () => {
    const { progress } = setup({ ready: false }, 0.7);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByRole('status')).toBeTruthy();
    act(() => progress.set(0.3));
    expect(screen.queryByRole('status')).toBeNull();
    act(() => progress.set(0.7));
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(screen.queryByRole('status')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
