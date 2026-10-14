// Joins the project's own modelled props (original.json, built from scripts/blender/props) to the
// shared asset catalogue, so `useModel('banker-lamp')` works exactly like `useModel('office-desk-metal')`.
//
// Each file is a lazily imported module whose bytes arrive as a data: URL (`?url&inline`), the same
// no-fetch path the licensed library uses: nothing here touches the network, and a model is decoded
// by `loadModel` through GLTFLoader.parse with the image-element plugin (see ../gltf.ts).
//
// Importing this module registers the source once. ../index.ts imports it, so any space that
// imports the catalogue sees these ids.
import type { AssetLoader, ModelEntry } from '../types.ts';
import { registerAssetSource } from '../catalogue.ts';
import manifest from './original.json';

/** The fields of original.json this module reads. */
interface ManifestEntry {
  readonly id: string;
  readonly title: string;
  readonly tier: 'small' | 'hero';
  readonly triangles: number;
  readonly textureBytes: number;
  readonly textureMemoryBytes: number;
  readonly compressedBytes: number;
  readonly drawCalls: number;
  readonly dimensions: { readonly x: number; readonly y: number; readonly z: number };
}

/**
 * Where each prop is meant to be used, in the library's vocabulary (`office`, `corridor`, `period-1910`,
 * `period-1971`, `sport`). Deliberately without `lazy-office` and `initial-corridor`: those tags define
 * the byte budgets of the Office's lazy set and the corridor's first download, and a space decides for
 * itself which of these props it loads.
 */
export const ORIGINAL_TAGS: Readonly<Record<string, readonly string[]>> = {
  'trophy-cup-tall': ['corridor', 'sport', 'period-1910'],
  'trophy-cup-squat': ['corridor', 'sport', 'period-1910'],
  'trophy-shield': ['corridor', 'sport', 'period-1910'],
  'trophy-plinth-small': ['corridor', 'sport', 'period-1910'],
  'trophy-plinth-empty': ['corridor', 'sport', 'period-1910'],
  'service-bell': ['office', 'period-1971'],
  'column-radiator-6': ['office', 'corridor', 'period-1910'],
  'column-radiator-10': ['office', 'corridor', 'period-1910'],
  'filing-cabinet-4': ['office', 'period-1971'],
  'cricket-bat': ['corridor', 'sport', 'period-1910'],
  'cricket-stumps': ['corridor', 'sport', 'period-1910'],
  'cricket-ball': ['corridor', 'sport', 'period-1910'],
  scorebook: ['corridor', 'sport', 'period-1910'],
  'stamp-rack': ['office', 'period-1971'],
  'banker-lamp': ['office', 'period-1910', 'period-1971'],
  'book-row-60': ['office', 'corridor', 'period-1910'],
  'book-row-90': ['office', 'corridor', 'period-1910'],
  'book-stack': ['office', 'corridor', 'period-1910'],
  'book-open': ['office', 'corridor', 'period-1910'],
  'desk-globe': ['office', 'period-1910'],
  'ledger-a': ['office', 'period-1910', 'period-1971'],
  'ledger-b': ['office', 'period-1910', 'period-1971'],
  'ledger-c': ['office', 'period-1910', 'period-1971'],
  'box-file-a': ['office', 'period-1971'],
  'box-file-b': ['office', 'period-1971'],
  'rotary-telephone': ['office', 'period-1971'],
  typewriter: ['office', 'period-1971'],
};

/**
 * Slots the catalogue keeps open for "original work" that these props fill. Three match an id exactly
 * (`rotary-telephone`, `typewriter`, `cricket-bat`); the others are asked for by a looser name than the
 * ids here, so they are named explicitly: a four-drawer cabinet, two column radiators, two loving cups.
 */
export const FILLED_SLOTS: readonly string[] = ['rotary-telephone', 'typewriter', 'filing-cabinet', 'radiator-cast-iron', 'trophy-cup', 'cricket-bat'];

const props = manifest.props as readonly ManifestEntry[];

export const ORIGINAL_ENTRIES: readonly ModelEntry[] = props.map((prop) => ({
  id: prop.id,
  kind: 'model',
  title: prop.title,
  origin: 'original',
  licence: 'CC-BY-4.0',
  tags: ORIGINAL_TAGS[prop.id] ?? [],
  // The library calls its small tier `prop`; the manifest says `small`.
  tier: prop.tier === 'hero' ? 'hero' : 'prop',
  dimensions: [prop.dimensions.x, prop.dimensions.y, prop.dimensions.z],
  triangles: prop.triangles,
  drawCalls: prop.drawCalls,
  textureBytes: prop.textureBytes,
  textureMemoryBytes: prop.textureMemoryBytes,
  compressedBytes: prop.compressedBytes,
}));

// Each file is its own lazily loaded chunk holding the bytes as a data: URL (`?url&inline`, as in the
// library's generated registry); nothing loads until a loader is called. The list is written out, not
// globbed, so a missing file fails the build and a stale file list cannot hide behind a cache.
const FILES: Readonly<Record<string, AssetLoader>> = {
  'trophy-cup-tall': async () => (await import('./trophy-cup-tall.glb?url&inline')).default,
  'trophy-cup-squat': async () => (await import('./trophy-cup-squat.glb?url&inline')).default,
  'trophy-shield': async () => (await import('./trophy-shield.glb?url&inline')).default,
  'trophy-plinth-small': async () => (await import('./trophy-plinth-small.glb?url&inline')).default,
  'trophy-plinth-empty': async () => (await import('./trophy-plinth-empty.glb?url&inline')).default,
  'service-bell': async () => (await import('./service-bell.glb?url&inline')).default,
  'column-radiator-6': async () => (await import('./column-radiator-6.glb?url&inline')).default,
  'column-radiator-10': async () => (await import('./column-radiator-10.glb?url&inline')).default,
  'filing-cabinet-4': async () => (await import('./filing-cabinet-4.glb?url&inline')).default,
  'cricket-bat': async () => (await import('./cricket-bat.glb?url&inline')).default,
  'cricket-stumps': async () => (await import('./cricket-stumps.glb?url&inline')).default,
  'cricket-ball': async () => (await import('./cricket-ball.glb?url&inline')).default,
  scorebook: async () => (await import('./scorebook.glb?url&inline')).default,
  'stamp-rack': async () => (await import('./stamp-rack.glb?url&inline')).default,
  'banker-lamp': async () => (await import('./banker-lamp.glb?url&inline')).default,
  'book-row-60': async () => (await import('./book-row-60.glb?url&inline')).default,
  'book-row-90': async () => (await import('./book-row-90.glb?url&inline')).default,
  'book-stack': async () => (await import('./book-stack.glb?url&inline')).default,
  'book-open': async () => (await import('./book-open.glb?url&inline')).default,
  'desk-globe': async () => (await import('./desk-globe.glb?url&inline')).default,
  'ledger-a': async () => (await import('./ledger-a.glb?url&inline')).default,
  'ledger-b': async () => (await import('./ledger-b.glb?url&inline')).default,
  'ledger-c': async () => (await import('./ledger-c.glb?url&inline')).default,
  'box-file-a': async () => (await import('./box-file-a.glb?url&inline')).default,
  'box-file-b': async () => (await import('./box-file-b.glb?url&inline')).default,
  'rotary-telephone': async () => (await import('./rotary-telephone.glb?url&inline')).default,
  typewriter: async () => (await import('./typewriter.glb?url&inline')).default,
};

const missing = (id: string): AssetLoader => () => Promise.reject(new Error(`original prop "${id}" has no loader`));

export const ORIGINAL_LOADERS: Readonly<Record<string, AssetLoader>> = Object.fromEntries(props.map((prop) => [prop.id, FILES[prop.id] ?? missing(prop.id)]));

registerAssetSource({ entries: ORIGINAL_ENTRIES, modelLoaders: ORIGINAL_LOADERS, satisfies: FILLED_SLOTS });
