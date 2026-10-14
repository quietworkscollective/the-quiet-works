import { describe, expect, it, vi } from 'vitest';
import { createCertificationStore } from '../store.ts';
import { createOfficeStore, OFFICE_OBJECTS, type OfficeObjectId } from './objects.ts';

const authored: readonly [OfficeObjectId, readonly number[]][] = [
  ['press', [-1, 0.95, 4]], ['ink-pad', [-1.8, 0.85, 3.9]], ['machine', [1, 0.68, 4.9]],
  ['lamp', [-1.9, 1.2, 4.3]], ['drawer', [-1.5, 0.62, 3.7]], ['tiny-stamp', [-0.45, 0.75, 4]],
  ['register', [-3.5, 1, 5.9]], ['window', [-2.25, 1.55, 8]], ['bell', [0.9, 1.4, 4.9]],
  ['sign', [3.65, 1.55, 1.8]], ['side-door', [4.2, 1.12, 1.8]], ['service-panel', [3.2, 1.15, 6.7]],
  ['chair', [-2.25, 0.5, 8.8]], ['stack', [-3.1, 1.1, 7]], ['clock', [0, 2.5, 8]],
  ['conduit', [3.7, 1.05, 5.4]], ['routing-tray', [-2.7, 0.95, 5.8]], ['coat-hook', [-3.8, 1.55, 2]],
];

describe('Office object contracts', () => {
  it('contains exactly the eighteen design identities in order', () => {
    expect(OFFICE_OBJECTS.map(({ id }) => id)).toEqual(authored.map(([id]) => id));
  });

  it.each(authored)('%s has its authored position, usable label and material caption', (id, position) => {
    const spec = OFFICE_OBJECTS.find((object) => object.id === id);
    expect(spec).toBeDefined();
    expect(spec?.position).toEqual(position);
    expect(spec?.name.trim()).toBeTruthy();
    expect(spec?.action.trim()).toBeTruthy();
    expect(spec?.caption).toMatch(/^\[[^[\]]+\]$/);
    expect(['rubber', 'paper', 'metal', 'wood', 'cloth', 'bell']).toContain(spec?.soundKind);
  });

  it.each(authored)('%s has a first response and bounded repeat behavior after extensive play', (id) => {
    const store = createOfficeStore();
    const first = store.inspect(id);
    expect(first.id).toBe(id);
    expect(first.text.trim()).toBeTruthy();
    const responses = new Set([first.text]);
    for (let i = 0; i < 100; i += 1) responses.add(store.inspect(id).text);
    expect(responses.size).toBeLessThanOrEqual(4);
    expect(store.getState().uses[id]).toBeLessThanOrEqual(4);
    expect(store.getState().variants[id]).toBeLessThan(3);
  });


  it.each([
    ['drawer', 'turns once'], ['tiny-stamp', 'One sample impression'],
  ] as const)('%s offers its one material surprise once and then stays playable', (id, surprise) => {
    const store = createOfficeStore();
    const responses = Array.from({ length: 12 }, () => store.inspect(id).text);
    expect(responses.filter((text) => text.includes(surprise))).toHaveLength(1);
    expect(responses.at(-1)).toBe(OFFICE_OBJECTS.find(object => object.id === id)?.repeats.at(-1));
    expect(store.getState().toggles[id]).toBe(true);
  });

  it('requires deliberate listening through an open flap and retains the readable discovery', () => {
    const store = createOfficeStore();
    expect(store.listen()).toBeNull();
    store.inspect('window');
    expect(store.getState().listened).toBe(false);
    expect(store.listen()?.caption).toBe('[Quiet whisper at the employee window]');
    store.inspect('window');
    const closed = store.getState();
    expect(store.listen()).toBeNull();
    expect(store.getState()).toBe(closed);
    expect(store.getState().listened).toBe(true);
  });

  it('discovers documents without opening them and reads only deliberate discovered selections', () => {
    const store = createOfficeStore();
    store.readMemo('office-01');
    expect(store.getState().activeMemo).toBeNull();
    store.inspect('drawer');
    expect(store.getState().discoveredMemos).toContain('office-01');
    expect(store.getState().activeMemo).toBeNull();
    store.readMemo('office-01');
    expect(store.getState().activeMemo).toBe('office-01');
    store.readMemo(null);
    expect(store.getState().activeMemo).toBeNull();
    store.inspect('drawer');
    expect(store.getState().discoveredMemos).toEqual(['office-01']);
  });

  it('keeps explicit copies once while retaining physical specimens and readable documents', () => {
    const store = createOfficeStore();
    store.keep('office-17');
    store.keep('office-12');
    expect(store.getState().kept).toEqual([]);
    store.inspect('tiny-stamp');
    store.inspect('routing-tray');
    store.inspect('machine', 2);
    for (const artifact of ['office-17', 'office-12', 'office-13'] as const) {
      store.keep(artifact);
      store.keep(artifact);
    }
    expect(store.getState().kept).toEqual(['office-17', 'office-12', 'office-13']);
    expect(store.inspect('tiny-stamp').text).toBe(OFFICE_OBJECTS.find(object => object.id === 'tiny-stamp')?.repeats[0]);
    store.readMemo('office-02');
    expect(store.getState().activeMemo).toBe('office-02');
    expect(OFFICE_OBJECTS).toHaveLength(18);
  });

  it('preserves discoveries and kept copies across an actual apparatus replay', () => {
    const office = createOfficeStore();
    const apparatus = createCertificationStore();
    office.inspect('drawer');
    office.inspect('tiny-stamp');
    office.keep('office-17');
    office.inspect('window');
    office.listen();
    office.readMemo('office-01');
    const discovered = office.getState();
    apparatus.dispatch({ type: 'PRESS' });
    apparatus.dispatch({ type: 'RELEASE' });
    apparatus.dispatch({ type: 'RESET' });
    expect(apparatus.getState().stamps).toBe(0);
    expect(office.getState()).toBe(discovered);
    expect(createOfficeStore().getState().kept).toEqual([]);
  });

  it('re-inks only an open pad and consumes fresh ink without affecting discoveries', () => {
    const store = createOfficeStore();
    store.reink();
    expect(store.getState().freshInk).toBe(false);
    store.inspect('ink-pad');
    store.reink();
    expect(store.getState().freshInk).toBe(true);
    store.inspect('ink-pad');
    expect(store.getState().freshInk).toBe(true);
    store.useInk();
    expect(store.getState().freshInk).toBe(false);
    expect(store.getState().uses['ink-pad']).toBe(2);
  });

  it('publishes stable snapshots, notifies after changes and releases subscriptions', () => {
    const store = createOfficeStore();
    const before = store.getState();
    const listener = vi.fn(() => expect(store.getState()).not.toBe(before));
    const unsubscribe = store.subscribe(listener);
    store.inspect('lamp');
    expect(before.uses.lamp).toBe(0);
    expect(listener).toHaveBeenCalledTimes(1);
    store.readMemo(null);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.inspect('lamp');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
