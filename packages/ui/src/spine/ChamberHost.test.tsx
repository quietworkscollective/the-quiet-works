import { act, cleanup, render, waitFor } from '@testing-library/react';
import { ChamberHost } from './ChamberHost.tsx';

function setup(over: { hold?: boolean; inert?: boolean; seam?: boolean; fallbackMs?: number; content?: boolean } = {}) {
  const onReady = vi.fn();
  let ready: () => void = () => undefined;
  let content = over.content ?? true;
  const props = { hold: over.hold ?? true, inert: over.inert ?? false, fallbackMs: over.fallbackMs };
  const contents = () => (
    <ChamberHost chamber="certification-office" {...props} seam={over.seam ?? true} onReady={onReady}>
      {(markReady) => {
        ready = markReady;
        return content ? <div className="tqw-app"><p>the room</p></div> : null;
      }}
    </ChamberHost>
  );
  const view = render(contents());
  const setSeam = (seam: boolean) => view.rerender(
    <ChamberHost chamber="certification-office" {...props} seam={seam} onReady={onReady}>
      {(markReady) => {
        ready = markReady;
        return content ? <div className="tqw-app"><p>the room</p></div> : null;
      }}
    </ChamberHost>,
  );
  const setContent = (next: boolean) => {
    content = next;
    view.rerender(contents());
  };
  const maybeHost = () => view.container.querySelector('.tqw-chamber-host') as HTMLElement | null;
  const host = () => {
    const element = maybeHost();
    if (!element) throw new Error('the chamber host is not mounted');
    return element;
  };
  const veil = () => view.container.querySelector('.tqw-seam-veil') as HTMLElement | null;
  const staging = () => view.container.querySelector('.tqw-chamber-preload') as HTMLElement | null;
  return { onReady, host, maybeHost, staging, veil, ready: () => ready(), setSeam, setContent, view };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ChamberHost: nothing half-built is ever shown', () => {
  it('is invisible and out of reach until the chamber says it is ready', () => {
    const { host } = setup();
    expect(host().getAttribute('data-ready')).toBe('false');
    expect(host().hasAttribute('inert')).toBe(true);
    expect(host().getAttribute('data-chamber')).toBe('certification-office');
  });

  it('holds a coal veil over the doorway for as long as it is not ready', () => {
    const { veil } = setup();
    expect(veil()?.getAttribute('data-held')).toBe('true');
    expect(veil()?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps the room staged and out of the host slot until the seam', () => {
    const { host, maybeHost, staging, veil, ready, setSeam, onReady } = setup({ seam: false });
    expect(maybeHost()).toBeNull();
    expect(staging()?.getAttribute('data-ready')).toBe('false');
    expect(staging()?.getAttribute('aria-hidden')).toBe('true');
    expect(staging()?.hasAttribute('inert')).toBe(true);
    expect(veil()).toBeNull();
    expect(onReady).not.toHaveBeenCalled();
    act(() => ready());
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(staging()?.getAttribute('data-ready')).toBe('true');
    expect(staging()?.hasAttribute('inert')).toBe(true);
    act(() => setSeam(true));
    expect(staging()).toBeNull();
    expect(host().getAttribute('data-seam')).toBe('true');
    expect(host().getAttribute('data-ready')).toBe('true');
    expect(host().hasAttribute('inert')).toBe(false);
    expect(veil()?.getAttribute('data-held')).toBe('false');
  });

  it('keeps an unresolved lazy room in a hidden host shell until its content loads', async () => {
    const { host, staging, setContent } = setup({ seam: false, content: false });
    expect(host().getAttribute('data-ready')).toBe('false');
    expect(host().getAttribute('data-seam')).toBe('false');
    expect(host().getAttribute('aria-hidden')).toBe('true');
    expect(host().hasAttribute('inert')).toBe(true);
    vi.useRealTimers();
    act(() => setContent(true));
    await waitFor(() => expect(staging()).not.toBeNull());
  });

  it('reveals the room, and lets the veil go, the moment the chamber reports ready', () => {
    const { host, veil, ready, onReady } = setup();
    act(() => ready());
    expect(host().getAttribute('data-ready')).toBe('true');
    expect(host().hasAttribute('inert')).toBe(false);
    expect(veil()?.getAttribute('data-held')).toBe('false');
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('tells the shell each time the chamber says it is ready, but reveals once', () => {
    const { host, ready, onReady } = setup();
    act(() => ready());
    act(() => ready());
    expect(onReady).toHaveBeenCalledTimes(2);
    expect(host().getAttribute('data-ready')).toBe('true');
  });

  it('stays out of reach when the shell says so, even once the room is ready', () => {
    const { host, ready } = setup({ inert: true });
    act(() => ready());
    expect(host().getAttribute('data-ready')).toBe('true');
    expect(host().hasAttribute('inert')).toBe(true);
  });

  it('gives the chamber a callback to call when it is ready, and renders what it makes', () => {
    const { host } = setup();
    expect(host().textContent).toBe('the room');
  });

  it('never reveals a room that has not reported, however long it takes, until the fallback', () => {
    const { host, onReady } = setup({ fallbackMs: 5000 });
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(host().getAttribute('data-ready')).toBe('false');
    expect(onReady).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(host().getAttribute('data-ready')).toBe('true');
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('does not run the fallback once the chamber has reported', () => {
    const { ready, onReady } = setup({ fallbackMs: 5000 });
    act(() => ready());
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});

describe('ChamberHost: text mode', () => {
  it('has no half-built room to hide and no veil: the host is simply there', () => {
    const { host, veil } = setup({ hold: false });
    expect(veil()).toBeNull();
    expect(host().getAttribute('data-ready')).toBe('true');
    expect(host().hasAttribute('inert')).toBe(false);
  });

  it('does not wait for the fallback either', () => {
    const { onReady } = setup({ hold: false, fallbackMs: 1000 });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onReady).not.toHaveBeenCalled();
  });
});
