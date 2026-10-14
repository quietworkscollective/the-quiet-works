import { act, cleanup, render, screen } from '@testing-library/react';
import { createMemoryDiscoveryStore } from './testHelpers.ts';
import { useDiscoveries, useSessionDiscoveries } from './useDiscoveries.ts';
import type { DiscoveryStore } from '@tqw/engine';

const OFFICE = 'certification-office';

function Probe({ store, onRebaseline }: { store: DiscoveryStore; onRebaseline?: (fn: () => void) => void }) {
  const state = useDiscoveries(store);
  const session = useSessionDiscoveries(store);
  onRebaseline?.(session.rebaseline);
  return (
    <p>
      <span data-testid="total">{Object.values(state.found).flat().length}</span>
      <span data-testid="session">{session.count}</span>
    </p>
  );
}

afterEach(() => cleanup());

describe('useDiscoveries', () => {
  it('re-renders when the store changes', () => {
    const store = createMemoryDiscoveryStore();
    render(<Probe store={store} />);
    expect(screen.getByTestId('total').textContent).toBe('0');
    act(() => store.record(OFFICE, { id: 'memo-1', kind: 'memo' }));
    expect(screen.getByTestId('total').textContent).toBe('1');
  });
});

describe('useSessionDiscoveries', () => {
  it('does not count what the device already remembered when the page loaded', () => {
    const store = createMemoryDiscoveryStore({ version: 1, found: { [OFFICE]: [{ id: 'memo-1', kind: 'memo' }] }, recognitions: [] });
    render(<Probe store={store} />);
    expect(screen.getByTestId('total').textContent).toBe('1');
    expect(screen.getByTestId('session').textContent).toBe('0');
  });

  it('counts each new finding once, however often it is recorded', () => {
    const store = createMemoryDiscoveryStore({ version: 1, found: { [OFFICE]: [{ id: 'memo-1', kind: 'memo' }] }, recognitions: [] });
    render(<Probe store={store} />);
    act(() => {
      store.record(OFFICE, { id: 'memo-2', kind: 'memo' });
      store.record(OFFICE, { id: 'memo-2', kind: 'memo' });
      store.record(OFFICE, { id: 'secret-1', kind: 'secret' });
    });
    expect(screen.getByTestId('session').textContent).toBe('2');
  });

  it('makes whatever is there the new starting point when asked (after an import or a forget)', () => {
    const store = createMemoryDiscoveryStore();
    let rebaseline: () => void = () => undefined;
    render(<Probe store={store} onRebaseline={(fn) => (rebaseline = fn)} />);
    act(() => store.record(OFFICE, { id: 'memo-1', kind: 'memo' }));
    expect(screen.getByTestId('session').textContent).toBe('1');
    act(() => {
      store.importText(JSON.stringify({ version: 1, found: { [OFFICE]: [{ id: 'memo-1', kind: 'memo' }, { id: 'memo-9', kind: 'memo' }] }, recognitions: [] }));
      rebaseline();
    });
    expect(screen.getByTestId('total').textContent).toBe('2');
    expect(screen.getByTestId('session').textContent).toBe('0');
  });

  it('counts nothing after a forget once rebaselined, and counts again from there', () => {
    const store = createMemoryDiscoveryStore();
    let rebaseline: () => void = () => undefined;
    render(<Probe store={store} onRebaseline={(fn) => (rebaseline = fn)} />);
    act(() => store.record(OFFICE, { id: 'memo-1', kind: 'memo' }));
    act(() => {
      store.forget();
      rebaseline();
    });
    expect(screen.getByTestId('session').textContent).toBe('0');
    act(() => store.record(OFFICE, { id: 'memo-1', kind: 'memo' }));
    expect(screen.getByTestId('session').textContent).toBe('1');
  });
});
