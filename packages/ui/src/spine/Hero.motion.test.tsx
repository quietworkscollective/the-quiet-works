import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { fakeProgress } from './testHelpers.ts';
import type { HeroProps } from './types.ts';

/**
 * The hero's motion, one fresh module per test: the arrival plays once per page load, so the
 * module's memory of it has to be reset between tests.
 */
type HeroComponent = typeof import('./Hero.tsx').Hero;

const KEYFRAMES = [
  [0, 0],
  [0.2, 0.15],
  [0.55, 0.85],
  [0.65, 1],
  [0.8, 1],
  [1, 0],
] as const;

let Hero: HeroComponent;

function setup(over: Partial<HeroProps> = {}) {
  const progress = fakeProgress(0);
  const props: HeroProps = { menu: null, details: [], onScrollCue: vi.fn(), onEnter: vi.fn(), progress, keyframes: KEYFRAMES, ...over };
  const view = render(<Hero {...props} />);
  const root = view.container.querySelector('.tqw-hero') as HTMLElement;
  return { progress, view, props, root, lockup: root.querySelector('.tqw-hero__lockup') as HTMLElement, word: root.querySelector('.tqw-hero__word') as HTMLElement };
}

function stubFonts(status: 'loaded' | 'loading', ready: Promise<unknown> = Promise.resolve()) {
  Object.defineProperty(document, 'fonts', { configurable: true, value: { status, ready } });
}

beforeEach(async () => {
  vi.resetModules();
  ({ Hero } = await import('./Hero.tsx'));
  stubFonts('loaded');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'fonts');
});

describe('the lockup\'s markup', () => {
  it('reads "UNHELD" whole to assistive technology: one text node, with every letter and .space hidden', () => {
    const { word } = setup();
    expect(screen.getByRole('heading', { level: 1, name: 'UNHELD' })).toBeTruthy();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.querySelector('.tqw-visually-hidden')?.textContent).toBe('UNHELD');
    expect(word.getAttribute('aria-hidden')).toBe('true');
    expect(heading.querySelector('.tqw-hero__space')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('sets the word in six letters, U N H E L D, in three nested layers each', () => {
    const { word } = setup();
    const letters = [...word.querySelectorAll('.tqw-hero__letter')];
    expect(letters.map((letter) => letter.textContent)).toEqual(['U', 'N', 'H', 'E', 'L', 'D']);
    for (const letter of letters) {
      expect(letter.querySelector('.tqw-hero__arrive .tqw-hero__glyph')).not.toBeNull();
    }
  });

  it('gives each letter its own motion numbers', () => {
    const { word } = setup();
    const letters = [...word.querySelectorAll<HTMLElement>('.tqw-hero__letter')];
    expect(letters.map((l) => l.style.getPropertyValue('--bp'))).toEqual(['11s', '13s', '9.5s', '12s', '10s', '12.5s']);
    expect(letters.map((l) => l.style.getPropertyValue('--i'))).toEqual(['0', '1', '2', '3', '4', '5']);
  });
});

describe('the arrival: once per load, after the fonts are ready', () => {
  it('waits while the fonts are loading, and then begins', async () => {
    let release: () => void = () => undefined;
    stubFonts('loading', new Promise<void>((resolve) => (release = resolve)));
    const { root } = setup();
    expect(root.dataset['arrive']).toBe('wait');
    await act(async () => {
      release();
      await Promise.resolve();
    });
    expect(root.dataset['arrive']).toBe('run');
  });

  it('begins at once when the fonts are already loaded', () => {
    const { root } = setup();
    expect(root.dataset['arrive']).toBe('run');
  });

  it('measures half of UN\'s width so HELD can start centred, and writes it for the stylesheet', () => {
    const { word } = setup();
    expect(word.style.getPropertyValue('--tqw-lead')).toBe('0px');
  });

  it('begins anyway if the fonts never say they are ready', () => {
    vi.useFakeTimers();
    stubFonts('loading', new Promise(() => undefined));
    const { root } = setup();
    expect(root.dataset['arrive']).toBe('wait');
    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(root.dataset['arrive']).toBe('wait');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(root.dataset['arrive']).toBe('run');
  });

  it('plays once per page load: a hero that mounts again is simply at rest', () => {
    const first = setup();
    expect(first.root.dataset['arrive']).toBe('run');
    cleanup();
    const second = setup();
    expect(second.root.dataset['arrive']).toBe('done');
  });

  it('plays in development too, where React runs every effect twice', () => {
    const view = render(
      <StrictMode>
        <Hero menu={null} details={[]} onScrollCue={vi.fn()} onEnter={vi.fn()} progress={fakeProgress(0)} keyframes={KEYFRAMES} />
      </StrictMode>,
    );
    expect((view.container.querySelector('.tqw-hero') as HTMLElement).dataset['arrive']).toBe('run');
  });
});

describe('reduced motion and text mode: none of it', () => {
  it.each([
    ['reduced motion', { reducedMotion: true }],
    ['text mode', { text: true }],
  ] as const)('%s: the lockup is still and complete, with nothing to wait for', (_name, over) => {
    const { root } = setup(over);
    expect(root.dataset['motion']).toBe('still');
    expect(root.dataset['arrive']).toBe('done');
  });

  it('writes nothing for the scroll', () => {
    const { progress, root } = setup({ reducedMotion: true });
    act(() => progress.set(0.15));
    expect(root.style.getPropertyValue('--tqw-rel')).toBe('');
    expect(root.style.getPropertyValue('--tqw-fade')).toBe('');
  });

  it('does not gather when touched: there is no breath to halve', () => {
    const { lockup } = setup({ reducedMotion: true });
    fireEvent.pointerEnter(lockup, { pointerType: 'mouse' });
    expect(lockup.dataset['held']).toBeUndefined();
  });

  it('is live otherwise', () => {
    expect(setup().root.dataset['motion']).toBe('live');
  });
});

describe('letting the word go into the smoke', () => {
  it('writes how far the word is released and how visible it still is, on every scroll', () => {
    const { progress, root } = setup();
    expect(root.style.getPropertyValue('--tqw-rel')).toBe('0.0000');
    expect(root.style.getPropertyValue('--tqw-fade')).toBe('1.0000');
    act(() => progress.set(0.1));
    expect(Number(root.style.getPropertyValue('--tqw-rel'))).toBeCloseTo(0.5, 3);
    act(() => progress.set(0.2));
    expect(root.style.getPropertyValue('--tqw-rel')).toBe('1.0000');
    expect(Number(root.style.getPropertyValue('--tqw-fade'))).toBeCloseTo(1 - 0.15 / 0.6, 3);
  });

  it('is gone with the smoke, and comes back as the visitor scrolls back', () => {
    const { progress, root } = setup();
    act(() => progress.set(0.55));
    expect(root.style.getPropertyValue('--tqw-fade')).toBe('0.0000');
    act(() => progress.set(0));
    expect(root.style.getPropertyValue('--tqw-rel')).toBe('0.0000');
    expect(root.style.getPropertyValue('--tqw-fade')).toBe('1.0000');
  });

  it('starts from where the page is, not from the top', () => {
    const progress = fakeProgress(0.2);
    const { root } = setup({ progress });
    expect(root.style.getPropertyValue('--tqw-rel')).toBe('1.0000');
  });

  it('leaves its custom properties behind when it goes away', () => {
    const { view, root } = setup();
    view.unmount();
    expect(root.style.getPropertyValue('--tqw-rel')).toBe('');
    expect(root.style.getPropertyValue('--tqw-fade')).toBe('');
  });

  it('is only the scroll: with no progress source it writes nothing', () => {
    const { root } = setup({ progress: undefined });
    expect(root.style.getPropertyValue('--tqw-rel')).toBe('');
  });
});

describe('the gather: touched, the letters hold for a moment', () => {
  it('halves the breath for 1.5 s on a mouse, then lets go', () => {
    vi.useFakeTimers();
    const { lockup } = setup();
    fireEvent.pointerEnter(lockup, { pointerType: 'mouse' });
    expect(lockup.dataset['held']).toBe('true');
    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(lockup.dataset['held']).toBe('true');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(lockup.dataset['held']).toBe('false');
  });

  it('starts the 1.5 s again if the pointer comes back', () => {
    vi.useFakeTimers();
    const { lockup } = setup();
    fireEvent.pointerEnter(lockup, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.pointerEnter(lockup, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(lockup.dataset['held']).toBe('true');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(lockup.dataset['held']).toBe('false');
  });

  it('gathers on focus too', () => {
    const { lockup } = setup();
    fireEvent.focus(lockup);
    expect(lockup.dataset['held']).toBe('true');
  });

  it('is for a mouse, not a finger: a touch does not gather it', () => {
    const { lockup } = setup();
    fireEvent.pointerEnter(lockup, { pointerType: 'touch' });
    expect(lockup.dataset['held']).toBeUndefined();
  });

  it('is not a control: no role, no tabindex, no handler that takes a click', () => {
    const { lockup } = setup();
    expect(lockup.getAttribute('role')).toBeNull();
    expect(lockup.getAttribute('tabindex')).toBeNull();
  });
});

describe('off screen: nothing animates', () => {
  type Callback = (entries: Array<{ isIntersecting: boolean }>) => void;
  let observed: { callback: Callback; disconnected: boolean } | null;

  beforeEach(() => {
    observed = null;
    const FakeObserver = vi.fn(function observer(callback: Callback) {
      const instance = {
        callback,
        disconnected: false,
        observe() {},
        disconnect() {
          instance.disconnected = true;
        },
      };
      observed = instance;
      return instance;
    });
    vi.stubGlobal('IntersectionObserver', FakeObserver);
  });

  it('marks the hero hidden when it leaves the screen, so the stylesheet pauses every animation, and visible when it returns', () => {
    const { root } = setup();
    act(() => observed?.callback([{ isIntersecting: false }]));
    expect(root.dataset['visible']).toBe('false');
    act(() => observed?.callback([{ isIntersecting: true }]));
    expect(root.dataset['visible']).toBe('true');
  });

  it('stops watching when it goes away', () => {
    const { view } = setup();
    view.unmount();
    expect(observed?.disconnected).toBe(true);
  });

  it('does not watch at all when the lockup is still', () => {
    setup({ reducedMotion: true });
    expect(observed).toBeNull();
  });
});
