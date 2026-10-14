import type { LicenceId, Tier } from './policy.ts';

interface BaseEntry {
  readonly id: string;
  readonly title: string;
  /** Third-party files come from scripts/assets; original works are modelled in this project. */
  readonly origin: 'third-party' | 'original';
  readonly licence: LicenceId;
  /** Where it is meant to be used (`office`, `corridor`) and what it is (`period-1910`, `sport`, ...). */
  readonly tags: readonly string[];
  /** Encoded bytes of the textures inside the file (models) or of the three maps (surfaces). */
  readonly textureBytes: number;
  /** GPU memory once decoded, with mipmaps (RGBA8): the figure the 24 and 48 MiB targets are checked against. */
  readonly textureMemoryBytes: number;
  /** What a visitor downloads for it: the size of the shipped file(s). */
  readonly compressedBytes: number;
}

export interface ModelEntry extends BaseEntry {
  readonly kind: 'model';
  readonly tier: Tier;
  /** Width (x), height (y) and depth (z) in metres, measured from the model. Origin: floor-centre. */
  readonly dimensions: readonly [number, number, number];
  readonly triangles: number;
  /** Primitives (one draw call each) in the model. */
  readonly drawCalls: number;
}

export interface SurfaceEntry extends BaseEntry {
  readonly kind: 'surface';
  /** Real-world edge of one texture repeat, in metres. */
  readonly tileMetres: number;
  readonly texelsPerMetre: number;
  readonly maps: { readonly albedo: true; readonly normal: boolean; readonly orm: boolean };
  /** Material defaults for the scan: set by the plan, applied by `surface()`. */
  readonly metalness?: number;
  readonly normalScale?: number;
}

export type CatalogueEntry = ModelEntry | SurfaceEntry;

/** A slot for an asset that cannot be fetched without a human (a login-gated download). */
export interface AssetSlot {
  readonly id: string;
  readonly wanted: string;
  readonly tags: readonly string[];
  readonly status: 'founder-download' | 'original-work';
}

/** A lazily loaded file: resolves to a data: URL (models) or an asset URL (surface maps). */
export type AssetLoader = () => Promise<string>;

export interface SurfaceLoaders {
  readonly albedo: AssetLoader;
  readonly normal?: AssetLoader;
  readonly orm?: AssetLoader;
}
