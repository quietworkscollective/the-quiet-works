/**
 * What the Credits page shows of apps/web/src/assets/third-party.json: for each third-party model
 * and surface, its title, its author, its licence by name, and the page it came from, grouped by the
 * provider that page belongs to.
 *
 * The build reduces the JSON to this (see `thirdPartyCredits` in vite.config.ts), so the site ships
 * a few kilobytes of credits and never the download addresses, checksums or processing notes the
 * data file keeps for the audit. The result is plain data for plain anchors: nothing is fetched.
 */

export interface ThirdPartyAsset {
  title: string;
  author: string;
  /** The asset's own page at its provider. */
  source: string;
  /** A key of `ThirdPartyData.licences`. */
  licence: string;
}

export interface ThirdPartyData {
  licences: Record<string, { name: string }>;
  assets: readonly ThirdPartyAsset[];
}

export interface CreditItem {
  title: string;
  author: string;
  /** The licence's full name. */
  licence: string;
  source: string;
}

export interface CreditGroup {
  provider: string;
  items: CreditItem[];
}

/** The providers there are names for, in the order the page lists them. Any other host follows, by host. */
const PROVIDERS: ReadonlyArray<readonly [host: string, name: string]> = [
  ['polyhaven.com', 'Poly Haven'],
  ['ambientcg.com', 'ambientCG'],
];

function hostOf(source: string): string {
  const url = new URL(source);
  if (url.protocol !== 'https:') throw new Error(`a credit's source must be an https page, got ${source}`);
  return url.hostname.replace(/^www\./, '');
}

export function creditGroups(data: ThirdPartyData): CreditGroup[] {
  const byHost = new Map<string, CreditItem[]>();
  for (const asset of data.assets) {
    const licence = data.licences[asset.licence];
    if (!licence) throw new Error(`"${asset.title}" names the licence ${asset.licence}, which the licences table does not define`);
    const host = hostOf(asset.source);
    const items = byHost.get(host) ?? [];
    items.push({ title: asset.title, author: asset.author, licence: licence.name, source: asset.source });
    byHost.set(host, items);
  }
  const named = PROVIDERS.map(([host]) => host);
  const hosts = [...byHost.keys()].sort((a, b) => {
    const ia = named.indexOf(a);
    const ib = named.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
    return a.localeCompare(b);
  });
  return hosts.map((host) => ({
    provider: PROVIDERS.find(([known]) => known === host)?.[1] ?? host,
    items: (byHost.get(host) ?? []).sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' })),
  }));
}
