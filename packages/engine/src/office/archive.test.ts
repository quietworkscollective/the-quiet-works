import { afterEach, describe, expect, it, vi } from 'vitest';
import * as sealedApi from '../sealed/index.ts';
import sealed from '../sealed/certification-office.sealed.json';
import { createOfficeArchive } from './archive.ts';
import { createOfficeStore } from './objects.ts';

afterEach(() => vi.restoreAllMocks());
const file = () => sealedApi.parseSealedFile(sealed);
function token() {
  const store = createOfficeStore();
  store.inspect('drawer');
  return store.getState().discoveries['office-01'] ?? '';
}

describe('Office visit archive', () => {
  it('does not derive keys before discovery and publishes stable empty snapshots', () => {
    const opener = vi.spyOn(sealedApi, 'openSealed');
    const archive = createOfficeArchive(file());
    expect(archive.getState()).toEqual({});
    expect(archive.getState()).toBe(archive.getState());
    expect(opener).not.toHaveBeenCalled();
  });

  it('coalesces concurrent opens and retains the same opened item for the visit', async () => {
    const opener = vi.spyOn(sealedApi, 'openSealed');
    const archive = createOfficeArchive(file());
    const initial = archive.getState();
    const listener = vi.fn();
    const off = archive.subscribe(listener);
    const first = archive.open('office-01', token());
    const second = archive.open('office-01', token());
    expect(second).toBe(first);
    const opened = await first;
    expect(opened?.digest).toBe(sealed.items['office-01'].digest);
    expect(archive.getState()).not.toBe(initial);
    expect(archive.getState()['office-01']).toBe(opened);
    expect(await archive.open('office-01', token())).toBe(opened);
    expect(await archive.open('office-01', 'invalid-after-open')).toBe(opened);
    expect(opener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    const store = createOfficeStore(); store.inspect('lamp');
    await archive.open('office-05', store.getState().discoveries['office-05'] ?? '');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(createOfficeArchive(file()).getState()).toEqual({});
  });

  it('caches a failed token without concealing a later valid discovery', async () => {
    const opener = vi.spyOn(sealedApi, 'openSealed');
    const archive = createOfficeArchive(file());
    const listener = vi.fn(); archive.subscribe(listener);
    expect(await archive.open('office-01', 'invalid')).toBeNull();
    expect(await archive.open('office-01', 'invalid')).toBeNull();
    expect(opener).toHaveBeenCalledTimes(1);
    expect(archive.getState()).toEqual({});
    expect(listener).not.toHaveBeenCalled();
    expect((await archive.open('office-01', token()))?.digest).toBe(sealed.items['office-01'].digest);
    expect(opener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('computes the displayed digest from the opened item', async () => {
    const changed = file();
    const entry = changed.items['office-01'];
    if (!entry) throw new Error('missing fixture entry');
    const archive = createOfficeArchive({ ...changed, items: { ...changed.items, 'office-01': { ...entry, digest: '0'.repeat(64) } } });
    expect((await archive.open('office-01', token()))?.digest).toBe(sealed.items['office-01'].digest);
  });
});
