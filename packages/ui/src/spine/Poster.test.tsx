import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { Poster } from './Poster.tsx';

const LANDSCAPE = '/poster-hero-1440x900.webp';
const PORTRAIT = '/poster-hero-412x915.webp';

function setup(ready = false) {
  const onGone = vi.fn();
  const props = { landscape: LANDSCAPE, portrait: PORTRAIT, onGone };
  const view = render(<Poster {...props} ready={ready} />);
  return { onGone, props, view, picture: view.container.querySelector('picture') as HTMLElement };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Poster', () => {
  it('is an image of the hero view, fetched at once and at high priority', () => {
    const { picture } = setup();
    const img = picture.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(LANDSCAPE);
    expect(img.getAttribute('loading')).toBe('eager');
    expect(img.getAttribute('decoding')).toBe('async');
    expect(img.getAttribute('fetchpriority')).toBe('high');
  });

  it('is decoration: no alt text, hidden from assistive technology, not draggable', () => {
    const { picture } = setup();
    expect(picture.getAttribute('aria-hidden')).toBe('true');
    const img = picture.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('draggable')).toBe('false');
  });

  it('offers the portrait still to a portrait screen and the landscape one otherwise', () => {
    const { picture } = setup();
    const source = picture.querySelector('source') as HTMLSourceElement;
    expect(source.getAttribute('media')).toBe('(orientation: portrait)');
    expect(source.getAttribute('srcset')).toBe(PORTRAIT);
    expect(source.getAttribute('type')).toBe('image/webp');
  });

  it('stays opaque while the scene has not drawn, and starts dissolving when it has', () => {
    const { picture, view, props } = setup(false);
    expect(picture.getAttribute('data-ready')).toBe('false');
    view.rerender(<Poster {...props} ready />);
    expect(picture.getAttribute('data-ready')).toBe('true');
  });

  it('preserves the completed handoff for a delayed observer', () => {
    const { picture, onGone } = setup(true);
    fireEvent.transitionEnd(picture, { propertyName: 'opacity' });
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(onGone).not.toHaveBeenCalled();
    expect(picture.getAttribute('data-ready')).toBe('true');
  });

  it('removes by the ready deadline even if the transition ends late', () => {
    const { picture, onGone } = setup(true);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onGone).not.toHaveBeenCalled();
    fireEvent.transitionEnd(picture, { propertyName: 'opacity' });
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(onGone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it('commits removal in the deadline task without waiting for a later render', () => {
    function Host() {
      const [gone, setGone] = useState(false);
      return gone ? null : <Poster landscape={LANDSCAPE} portrait={PORTRAIT} ready onGone={() => setGone(true)} />;
    }
    const { container } = render(<Host />);
    act(() => {
      vi.advanceTimersByTime(3500);
      // Check before act drains batched work: the deadline must remove the actual node.
      expect(container.querySelector('picture')).toBeNull();
    });
  });

  it('asks to be removed at a fixed deadline from readiness, and only once', () => {
    const { picture, onGone } = setup(true);
    expect(onGone).not.toHaveBeenCalled();
    fireEvent.transitionEnd(picture, { propertyName: 'opacity' });
    fireEvent.transitionEnd(picture, { propertyName: 'opacity' });
    act(() => {
      vi.advanceTimersByTime(3499);
    });
    expect(onGone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it('keeps the transition removal when the parent supplies a new callback', () => {
    const firstGone = vi.fn();
    const latestGone = vi.fn();
    const props = { landscape: LANDSCAPE, portrait: PORTRAIT, ready: true, onGone: firstGone };
    const view = render(<Poster {...props} />);
    const picture = view.container.querySelector('picture') as HTMLElement;
    fireEvent.transitionEnd(picture, { propertyName: 'opacity' });
    view.rerender(<Poster {...props} onGone={latestGone} />);
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(firstGone).not.toHaveBeenCalled();
    expect(latestGone).toHaveBeenCalledTimes(1);
  });

  it('ignores the end of any other transition, and of its child\'s', () => {
    const { picture, onGone } = setup(true);
    fireEvent.transitionEnd(picture, { propertyName: 'transform' });
    fireEvent.transitionEnd(picture.querySelector('img') as HTMLElement, { propertyName: 'opacity' });
    expect(onGone).not.toHaveBeenCalled();
  });

  it('goes anyway if the browser never reports the end (a hidden tab)', () => {
    const { onGone } = setup(true);
    act(() => {
      vi.advanceTimersByTime(3499);
    });
    expect(onGone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it('never goes before the scene is ready, however long it takes', () => {
    const { onGone } = setup(false);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onGone).not.toHaveBeenCalled();
  });
});
