import { describe, expect, it } from 'vitest';
import sealed from '../sealed/certification-office.sealed.json';
import { digestItem, openSealed, parseSealedFile } from '../sealed/index.ts';
import { createOfficeStore, type OfficeObjectId } from './objects.ts';

const cases = [
  ['office-01', 'drawer'], ['office-02', 'routing-tray'], ['office-03', 'register'],
  ['office-04', 'chair'], ['office-05', 'lamp'], ['office-06', 'drawer'],
  ['office-07', 'tiny-stamp'], ['office-08', 'register'], ['office-09', 'listen'],
  ['office-10', 'pause'], ['office-11', 'reink'], ['office-12', 'routing-tray'],
  ['office-13', 'machine'], ['office-14', 'sign'], ['office-15', 'bell'],
  ['office-16', 'routing-tray'], ['office-17', 'tiny-stamp'], ['office-18', 'clock'],
] as const;

function discovered(action: string) {
  const store = createOfficeStore();
  if (action === 'listen') { store.inspect('window'); store.listen(); }
  else if (action === 'pause') store.pause();
  else if (action === 'reink') { store.inspect('ink-pad'); store.reink(); }
  else store.inspect(action as OfficeObjectId, 2);
  return store;
}

describe('Office discovery tokens', () => {
  it('covers every committed item exactly once', () => {
    expect(cases.map(([id]) => id)).toEqual(Object.keys(sealed.items));
  });
  it.each(cases)('%s is opened by its deliberate discovery token', async (id, action) => {
    const state = discovered(action).getState();
    const token = state.discoveries[id];
    expect(token).toEqual(expect.any(String));
    const item = await openSealed(parseSealedFile(sealed), id, token ?? '');
    expect(item).not.toBeNull();
    expect(item && await digestItem(item)).toBe(sealed.items[id].digest);
  });
});

it('keeps listening, ink and machine discoveries behind their actual actions', () => {
  const store = createOfficeStore();
  expect(store.getState().discoveries).toEqual({});
  store.inspect('window');
  expect(store.getState().discoveries['office-09']).toBeUndefined();
  expect(store.getState().discoveries['office-12']).toBeUndefined();
  store.inspect('ink-pad');
  expect(store.getState().discoveries['office-11']).toBeUndefined();
  store.inspect('machine', 1);
  expect(store.getState().discoveries['office-13']).toBeUndefined();
  store.keep('office-13');
  expect(store.getState().kept).toEqual([]);
  store.inspect('machine', 2);
  expect(store.getState().discoveries['office-13']).toEqual(expect.any(String));
  store.keep('office-13');
  expect(store.getState().kept).toEqual(['office-13']);
});
