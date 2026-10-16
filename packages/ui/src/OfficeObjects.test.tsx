import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { webcrypto } from 'node:crypto';
import sealed from '../../engine/src/sealed/certification-office.sealed.json';
import { parseSealedFile } from '../../engine/src/sealed/index.ts';
import { createOfficeArchive } from '../../engine/src/office/archive.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOfficeStore, type OfficeObjectId, type OfficeItemId } from '../../engine/src/office/objects.ts';
import { OfficeObjects, type OfficeObjectsProps } from './OfficeObjects.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup(overrides: Partial<OfficeObjectsProps> = {}) {
  const store = overrides.store ?? createOfficeStore();
  vi.stubGlobal('crypto', webcrypto);
  const archive = overrides.archive ?? createOfficeArchive(parseSealedFile(sealed));
  const props: OfficeObjectsProps = {
    store, archive, stamps: 0, overloaded: false, stillness: false,
    onInspect: vi.fn((id) => store.inspect(id)), onStampOnce: vi.fn(),
    onExit: vi.fn(), onReadCounterMemo: vi.fn(), ...overrides,
  };
  const view = render(<OfficeObjects {...props} />);
  fireEvent.click(screen.getByText('Things nearby', { selector: 'summary' }));
  // jsdom does not toggle native details on click.
  view.container.querySelector('details')?.setAttribute('open', '');
  const openKnown = () => act(async () => {
    await Promise.all(Object.entries(store.getState().discoveries).map(([id, token]) => archive.open(id as OfficeItemId, token)));
  });
  return { ...view, props, store, archive, openKnown, inspect: async (id: OfficeObjectId) => {
    act(() => { store.inspect(id, props.stamps); });
    await openKnown();
  } };

}

const controls: readonly [OfficeObjectId, string][] = [
  ['press', 'Brass press and form: Inspect press'], ['ink-pad', 'Ink pad: Open ink pad'],
  ['machine', 'Approval machine: Inspect machine'], ['lamp', 'Desk lamp: Turn lamp shade'],
  ['drawer', 'Drawer: Open drawer'], ['tiny-stamp', 'Tiny underside stamp: Inspect underside'],
  ['register', 'Certificate register: Open register'], ['window', 'Employee window: Open speaking flap'],
  ['bell', 'Service bell: Ring service bell'], ['sign', 'Office sign: Turn office sign'],
  ['side-door', 'Side door: Inspect side door'], ['service-panel', 'Rear service panel: Inspect service label'],
  ['chair', 'Clerk’s chair: Inspect chair through glass'], ['stack', 'Infinite stack: Lift paper sample'],
  ['clock', 'Office clock: Read clock hands'], ['conduit', 'Maintenance conduit cover: Open conduit cover'],
  ['routing-tray', 'Routing tray: Read routing slip — The Exchange'], ['coat-hook', 'Coat hook: Lift empty hanger'],
];

describe('Office DOM equivalence', () => {
  it.each(controls)('%s has a named focusable control; focus does not inspect', (id, name) => {
    const { props } = setup();
    const button = screen.getByRole('button', { name });
    button.focus();
    expect(document.activeElement).toBe(button);
    expect(props.onInspect).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(props.onInspect).toHaveBeenCalledExactlyOnceWith(id);
  });

  it('delegates reachability to root without prematurely inspecting a distant object', () => {
    const onInspect = vi.fn();
    const { store } = setup({ onInspect });
    fireEvent.click(screen.getByRole('button', { name: 'Drawer: Open drawer' }));
    expect(onInspect).toHaveBeenCalledExactlyOnceWith('drawer');
    expect(store.getState().response).toBeNull();
    expect(screen.queryByRole('log')).toBeNull();
  });

  it('uses a response log and leaves the singular Memo 001 status and button with root', async () => {
    const { inspect, props } = setup({ overloaded: true, stillness: true });
    await inspect('machine');
    expect(screen.getAllByRole('log')).toHaveLength(1);
    expect(screen.queryAllByRole('status')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Read Memo 001/ })).toBeNull();
    expect(props.onReadCounterMemo).not.toHaveBeenCalled();
  });

  it('opens object memos only on Read, labels fiction, closes and preserves the document', async () => {
    const { inspect, store } = setup();
    await inspect('drawer');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Read /  }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('[data-item-digest]')?.getAttribute('data-item-digest')).toBe(sealed.items['office-01'].digest);
    expect(dialog.textContent).toContain('Fictional institutional document');
    expect(document.activeElement).toBe(dialog.querySelector('h2'));
    fireEvent.click(screen.getByRole('button', { name: 'Close memo' }));
    expect(store.getState().activeMemo).toBeNull();
    expect(store.getState().discoveredMemos).toContain('office-01');
    fireEvent.click(screen.getByRole('button', { name: /^Read /  }));
    fireEvent(screen.getByRole('dialog'), new Event('close'));
    expect(store.getState().activeMemo).toBeNull();
  });

  it('reports the found paper only when its Read action is activated', async () => {
    const onReadMemo = vi.fn();
    const { inspect } = setup({ onReadMemo });
    await inspect('drawer');
    expect(onReadMemo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Read / }));
    expect(onReadMemo).toHaveBeenCalledExactlyOnceWith('office-01');
  });

  it('offers Listen only with the flap open and reveals a labelled authored recording deliberately', async () => {
    const speak = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak });
    const { inspect, store, openKnown } = setup();
    expect(screen.queryByRole('button', { name: 'Listen' })).toBeNull();
    await inspect('window');
    expect(store.getState().listened).toBe(false);
    expect(screen.queryByText(/Fictional authored recording/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Listen' }));
    await openKnown();
    expect(document.querySelector('[data-item-id="office-09"]')?.getAttribute('data-item-digest')).toBe(sealed.items['office-09'].digest);
    expect(screen.getByText('[Quiet whisper at the employee window]')).toBeTruthy();
    await inspect('window');
    expect(screen.queryByRole('button', { name: 'Listen' })).toBeNull();
    expect(screen.getByText(/Fictional authored recording/)).toBeTruthy();
    expect(speak).not.toHaveBeenCalled();
  });

  it.each([
    ['machine', 'office-13'],
    ['routing-tray', 'office-12'],
    ['tiny-stamp', 'office-17'],
  ] as const)('keeps %s explicitly without removing its physical control', async (id, artifact) => {
    const { inspect, store } = setup({ stamps: 2 });
    await inspect(id);
    expect(store.getState().kept).toEqual([]);
    const keep = document.querySelector(`[data-keep-item="${artifact}"]`) as HTMLButtonElement;
    expect(keep).not.toBeNull();
    fireEvent.click(keep);
    expect(store.getState().kept).toEqual([artifact]);
    expect(keep.disabled).toBe(true);
    expect(screen.getByText(/physical copy remains here/)).toBeTruthy();
    expect(screen.getByRole('button', { name: controls.find(([key]) => key === id)?.[1] ?? '' })).toBeTruthy();
  });

  it('gates a machine copy at two stamps and retains copies when the root replays', async () => {
    const { inspect, store, props, openKnown, rerender } = setup({ stamps: 1 });
    await inspect('machine');
    expect(document.querySelector('[data-keep-item="office-13"]')).toBeNull();
    act(() => store.inspect('machine', 2));
    await openKnown();
    rerender(<OfficeObjects {...props} stamps={2} />);
    fireEvent.click(document.querySelector('[data-keep-item="office-13"]') as HTMLButtonElement);
    await inspect('drawer');
    rerender(<OfficeObjects {...props} stamps={0} overloaded={false} stillness={false} />);
    expect(store.getState().kept).toEqual(['office-13']);
    expect(document.querySelector('[data-read-item="office-01"]')).toBeTruthy();
  });

  it('offers ordinary exits throughout and releases only the service route after overload', () => {
    const { props, rerender } = setup();
    const service = screen.getByRole('button', { name: 'Leave through service route' }) as HTMLButtonElement;
    expect(service.disabled).toBe(true);
    fireEvent.click(service);
    expect(props.onExit).not.toHaveBeenCalled();
    for (const [name, route] of [['Leave through entrance', 'entrance'], ['Leave through side door', 'side']] as const) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(props.onExit).toHaveBeenLastCalledWith(route);
    }
    rerender(<OfficeObjects {...props} overloaded />);
    expect(service.disabled).toBe(false);
    fireEvent.click(service);
    expect(props.onExit).toHaveBeenLastCalledWith('service');
  });

  it('does not offer waiting as a route to discovery', () => {
    setup({ overloaded: true });
    expect(screen.queryByRole('button', { name: 'Wait without stamping' })).toBeNull();
    expect(document.querySelector('[data-item-id="office-10"]')).toBeNull();
  });

  it('stamps directly through root and offers re-inking only from the open pad', async () => {
    const { props, inspect, store } = setup();
    await inspect('press');
    fireEvent.click(screen.getByRole('button', { name: 'Stamp once' }));
    expect(props.onStampOnce).toHaveBeenCalledTimes(1);
    await inspect('ink-pad');
    fireEvent.click(screen.getByRole('button', { name: 'Re-ink the pad' }));
    expect(store.getState().freshInk).toBe(true);
    await inspect('ink-pad');
    expect(screen.queryByRole('button', { name: 'Re-ink the pad' })).toBeNull();
  });

  it('names finite secondary actions and keeps sampling optional', async () => {
    const { inspect } = setup();
    await inspect('drawer');
    fireEvent.click(screen.getByRole('button', { name: 'Turn drawer object' }));
    expect(screen.getByRole('button', { name: 'Squeak drawer object' })).toBeTruthy();
    await inspect('tiny-stamp');
    expect(screen.getByRole('button', { name: 'Make sample impression' })).toBeTruthy();
    expect(document.querySelector('[data-keep-item="office-17"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Make sample impression' }));
    expect(screen.queryByRole('button', { name: 'Make sample impression' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Inspect underside' })).toBeTruthy();
  });

  it.each([
    ['drawer', 'office-01', 'Fictional institutional document'],
    ['routing-tray', 'office-02', 'Fictional institutional document'],
    ['register', 'office-03', 'Fictional institutional document'],
    ['chair', 'office-04', 'Fictional personal memo'],
    ['lamp', 'office-05', 'Fictional institutional document'],
  ] as const)('%s exposes the full fictional document only through its named Read action', async (id, itemId, label) => {
    const { inspect } = setup();
    await inspect(id);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(document.querySelector(`[data-read-item="${itemId}"]`) as HTMLButtonElement);
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('[data-item-digest]')?.getAttribute('data-item-digest')).toBe(sealed.items[itemId].digest);
    expect(dialog.textContent).toContain(label);
    const body = dialog.querySelector('.tqw-memo__body')?.textContent ?? '';
    expect(body.split(/\s+/).length).toBeGreaterThanOrEqual(30);
    expect(body.split(/\s+/).length).toBeLessThanOrEqual(70);
  });
});
