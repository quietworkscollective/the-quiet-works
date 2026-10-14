import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { creditGroups, type ThirdPartyData } from './groupCredits.ts';

const LICENCES = {
  'CC0-1.0': { name: 'CC0 1.0 Universal' },
  'CC-BY-4.0': { name: 'Creative Commons Attribution 4.0 International' },
};

function data(...assets: Array<[title: string, author: string, source: string, licence?: string]>): ThirdPartyData {
  return {
    licences: LICENCES,
    assets: assets.map(([title, author, source, licence]) => ({ title, author, source, licence: licence ?? 'CC0-1.0' })),
  };
}

describe('creditGroups', () => {
  it('groups by the provider the source page belongs to, Poly Haven first and ambientCG second', () => {
    const groups = creditGroups(
      data(
        ['Paper', 'ambientCG', 'https://ambientcg.com/a/Paper002'],
        ['Metal office desk', 'Ulan Cabanilla', 'https://polyhaven.com/a/metal_office_desk'],
        ['Plaster, clean', 'ambientCG', 'https://ambientcg.com/a/Plaster002'],
      ),
    );
    expect(groups.map((group) => group.provider)).toEqual(['Poly Haven', 'ambientCG']);
    expect(groups[0]!.items.map((item) => item.title)).toEqual(['Metal office desk']);
    expect(groups[1]!.items.map((item) => item.title)).toEqual(['Paper', 'Plaster, clean']);
  });

  it('keeps title, author, the licence by its name and the source page, and nothing else', () => {
    const [group] = creditGroups(data(['Metal office desk', 'Ulan Cabanilla', 'https://polyhaven.com/a/metal_office_desk']));
    expect(group!.items).toEqual([
      {
        title: 'Metal office desk',
        author: 'Ulan Cabanilla',
        licence: 'CC0 1.0 Universal',
        source: 'https://polyhaven.com/a/metal_office_desk',
      },
    ]);
  });

  it('sorts each group by title, ignoring case, so adding an asset never reshuffles the rest', () => {
    const [group] = creditGroups(
      data(
        ['chess set', 'Riley Queen', 'https://polyhaven.com/a/chess_set'],
        ['Cash register', 'Joe Seabuhr', 'https://polyhaven.com/a/CashRegister_01'],
        ['anglepoise lamp', 'Yann Kervran', 'https://polyhaven.com/a/desk_lamp_arm_01'],
        ['Basket', 'Kuutti Siitonen', 'https://polyhaven.com/a/wicker_basket_02'],
      ),
    );
    // By letter, not by character code: a lower-case title does not sort after every capital.
    expect(group!.items.map((item) => item.title)).toEqual(['anglepoise lamp', 'Basket', 'Cash register', 'chess set']);
  });

  it('puts a provider it has no name for after the named ones, under its host, rather than dropping it', () => {
    const groups = creditGroups(
      data(
        ['A plant', 'Someone', 'https://www.example-assets.test/a/plant'],
        ['Metal office desk', 'Ulan Cabanilla', 'https://polyhaven.com/a/metal_office_desk'],
      ),
    );
    expect(groups.map((group) => group.provider)).toEqual(['Poly Haven', 'example-assets.test']);
    expect(groups[1]!.items).toHaveLength(1);
  });

  it('names the licence from the licences table, and refuses an asset whose licence is not in it', () => {
    const [group] = creditGroups(data(['Original', 'Someone', 'https://polyhaven.com/a/x', 'CC-BY-4.0']));
    expect(group!.items[0]!.licence).toBe('Creative Commons Attribution 4.0 International');
    expect(() => creditGroups(data(['Mystery', 'Someone', 'https://polyhaven.com/a/y', 'WTFPL']))).toThrow(/WTFPL/);
  });

  it('refuses a source that is not an https page, so nothing but a link to a provider is ever shipped', () => {
    expect(() => creditGroups(data(['Odd', 'Someone', 'http://polyhaven.com/a/x']))).toThrow(/https/);
    expect(() => creditGroups(data(['Odd', 'Someone', 'not a url']))).toThrow();
  });

  it('is empty for no assets', () => {
    expect(creditGroups({ licences: LICENCES, assets: [] })).toEqual([]);
  });
});

describe('the real third-party.json', () => {
  const raw = JSON.parse(readFileSync(new URL('../assets/third-party.json', import.meta.url), 'utf8')) as ThirdPartyData;
  const groups = creditGroups(raw);

  it('credits every asset in it, once', () => {
    expect(groups.reduce((sum, group) => sum + group.items.length, 0)).toBe(raw.assets.length);
    expect(raw.assets.length).toBeGreaterThan(0);
  });

  it('is grouped under Poly Haven and ambientCG', () => {
    expect(groups.map((group) => group.provider)).toEqual(['Poly Haven', 'ambientCG']);
  });

  it('carries no URL but the page each asset came from: nothing of the download sources is shipped', () => {
    const shipped = JSON.stringify(groups);
    expect(shipped).not.toContain('dl.polyhaven');
    expect(shipped).not.toContain('sha256');
    const urls = shipped.match(/https?:\/\/[^"]+/g) ?? [];
    expect(urls.sort()).toEqual(raw.assets.map((asset) => asset.source).sort());
  });
});
