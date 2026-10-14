// The asset catalogue: what exists, how big it really is, where it may be used, and under which
// licence. The numbers are measured from the shipped files by scripts/assets/build.mjs and checked
// against them by catalogue.test.ts.
//
// More than one manifest can feed it. The third-party library registers itself below; another
// source (for example the project's own modelled work) calls `registerAssetSource` with its entries
// and loaders at module load, and every lookup, budget and loader then sees it.
import { CATALOGUE_DATA } from './catalogue.data.ts';
import { MODEL_LOADERS, SURFACE_LOADERS } from './registry.generated.ts';
import type { AssetLoader, AssetSlot, CatalogueEntry, ModelEntry, SurfaceEntry, SurfaceLoaders } from './types.ts';

export interface AssetSource {
  readonly entries: readonly CatalogueEntry[];
  readonly modelLoaders?: Readonly<Record<string, AssetLoader>>;
  readonly surfaceLoaders?: Readonly<Record<string, SurfaceLoaders>>;
  readonly slots?: readonly AssetSlot[];
}

const sources: AssetSource[] = [];

/** Adds a manifest source. An id that already exists is an error: ids are immutable. */
export function registerAssetSource(source: AssetSource): void {
  const known = new Set(allEntries().map((entry) => entry.id));
  for (const entry of source.entries) {
    if (known.has(entry.id)) throw new Error(`asset id "${entry.id}" is already in the catalogue`);
    known.add(entry.id);
  }
  sources.push(source);
}

registerAssetSource({ entries: CATALOGUE_DATA, modelLoaders: MODEL_LOADERS, surfaceLoaders: SURFACE_LOADERS });

/**
 * Assets that need a human before they can exist: a download behind a login, or a piece still to
 * be modelled. Each keeps its id so a space can plan around it; `getEntry` returns nothing for it
 * until the file lands and the id moves into a source.
 */
export const SLOTS: readonly AssetSlot[] = [
  { id: 'rotary-telephone', wanted: 'Desk rotary telephone, 1960s to 70s', tags: ['office', 'period-1971'], status: 'original-work' },
  { id: 'typewriter', wanted: 'Manual or electric office typewriter', tags: ['office', 'period-1971'], status: 'original-work' },
  { id: 'filing-cabinet', wanted: 'Steel filing cabinet, three or four drawers', tags: ['office', 'period-1971'], status: 'original-work' },
  { id: 'radiator-cast-iron', wanted: 'Column radiator', tags: ['office', 'corridor', 'period-1910'], status: 'original-work' },
  { id: 'coat-stand', wanted: 'Bentwood or brass coat stand', tags: ['office', 'corridor', 'period-1910'], status: 'founder-download' },
  { id: 'umbrella-stand', wanted: 'Umbrella stand', tags: ['corridor', 'period-1910'], status: 'founder-download' },
  { id: 'trophy-cup', wanted: 'Engraved trophy cup', tags: ['corridor', 'sport', 'period-1910'], status: 'original-work' },
  { id: 'cricket-bat', wanted: 'Cricket bat', tags: ['corridor', 'sport', 'period-1910'], status: 'original-work' },
  { id: 'bicycle-wheel', wanted: 'Spoked bicycle wheel', tags: ['corridor', 'sport'], status: 'founder-download' },
  { id: 'fire-bucket', wanted: 'Period fire bucket or extinguisher', tags: ['corridor', 'period-1910'], status: 'founder-download' },
];

export function allEntries(): readonly CatalogueEntry[] {
  return sources.flatMap((source) => source.entries);
}

export function getEntry(id: string): CatalogueEntry | undefined {
  return allEntries().find((entry) => entry.id === id);
}

export function getModel(id: string): ModelEntry {
  const entry = getEntry(id);
  if (!entry || entry.kind !== 'model') throw new Error(`no model "${id}" in the asset catalogue`);
  return entry;
}

export function getSurface(id: string): SurfaceEntry {
  const entry = getEntry(id);
  if (!entry || entry.kind !== 'surface') throw new Error(`no surface "${id}" in the asset catalogue`);
  return entry;
}

export function entriesWithTag(tag: string): readonly CatalogueEntry[] {
  return allEntries().filter((entry) => entry.tags.includes(tag));
}

/** Slots still open: one closes the moment an entry with its id joins a source. */
export function allSlots(): readonly AssetSlot[] {
  const have = new Set(allEntries().map((entry) => entry.id));
  return [...SLOTS, ...sources.flatMap((source) => source.slots ?? [])].filter((slot) => !have.has(slot.id));
}

export function modelLoader(id: string): AssetLoader {
  for (const source of sources) {
    const loader = source.modelLoaders?.[id];
    if (loader) return loader;
  }
  throw new Error(`no loader for model "${id}"`);
}

export function surfaceLoaders(id: string): SurfaceLoaders {
  for (const source of sources) {
    const loaders = source.surfaceLoaders?.[id];
    if (loaders) return loaders;
  }
  throw new Error(`no loader for surface "${id}"`);
}

export interface Budget {
  readonly triangles: number;
  readonly drawCalls: number;
  /** Decoded texture memory with mipmaps, in bytes (RGBA8). Shared textures are counted once per id. */
  readonly textureMemoryBytes: number;
  /** Bytes a visitor downloads for these ids. */
  readonly downloadBytes: number;
  /** Ids that are not in the catalogue, so a plan that names them is visibly incomplete. */
  readonly missing: readonly string[];
}

/**
 * Sums what a space would cost if it drew `ids`, so it can check its plan before building. List an
 * id once per instance: geometry cost (triangles, draw calls) repeats per instance, while the
 * download and the texture memory are counted once per id, as clones share them.
 */
export function budget(ids: readonly string[]): Budget {
  let triangles = 0;
  let drawCalls = 0;
  let textureMemoryBytes = 0;
  let downloadBytes = 0;
  const missing = new Set<string>();
  const seen = new Set<string>();
  for (const id of ids) {
    const entry = getEntry(id);
    if (!entry) {
      missing.add(id);
      continue;
    }
    if (!seen.has(id)) {
      seen.add(id);
      textureMemoryBytes += entry.textureMemoryBytes;
      downloadBytes += entry.compressedBytes;
    }
    if (entry.kind === 'model') {
      triangles += entry.triangles;
      drawCalls += entry.drawCalls;
    }
  }
  return { triangles, drawCalls, textureMemoryBytes, downloadBytes, missing: [...missing] };
}
