// Scanned PBR surface sets as configured materials. Maps load through <img> (TextureLoader) from
// imported asset URLs, never through fetch. One decoded set per surface id is shared by every
// material made from it; repeat is per material, on texture clones that share the same image, so
// two materials at different scales upload the picture once.
import {
  Color,
  type ColorRepresentation,
  MeshPhysicalMaterial,
  type MeshPhysicalMaterialParameters,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
} from 'three';
import { getSurface, surfaceLoaders } from './catalogue.ts';

export interface SurfaceOptions {
  /** How many times the set tiles across the mapped UV range, along u and v. Default 1. */
  readonly repeat?: number | readonly [number, number];
  /** A tint multiplied into the albedo (a grade towards a palette colour). Default white. */
  readonly colour?: ColorRepresentation;
  /** Multiplier on the scanned roughness. Default 1. */
  readonly roughness?: number;
  readonly normalScale?: number;
  /** Default 8; the renderer clamps it to what the GPU supports. */
  readonly anisotropy?: number;
  /** Extra MeshPhysicalMaterial parameters (clearcoat for enamel, sheen for felt): switches the class. */
  readonly physical?: Pick<MeshPhysicalMaterialParameters, 'clearcoat' | 'clearcoatRoughness' | 'sheen' | 'sheenRoughness' | 'sheenColor' | 'ior' | 'specularIntensity'>;
}

export interface SurfaceHandle {
  readonly material: MeshStandardMaterial;
  /** Resolves when the maps are decoded and attached. Rendering before then shows the flat colour. */
  readonly ready: Promise<void>;
  /** Disposes the material and its texture clones; the last release frees the shared images. */
  release(): void;
}

interface SharedMaps {
  albedo: Texture;
  normal?: Texture;
  orm?: Texture;
}

interface SharedEntry {
  refs: number;
  ready: Promise<SharedMaps>;
}

const shared = new Map<string, SharedEntry>();

/** Surface ids that currently hold decoded images (for tests and leak checks). */
export function liveSurfaceIds(): string[] {
  return [...shared.keys()];
}

function loadTexture(loader: TextureLoader, url: string): Promise<Texture> {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

async function loadShared(id: string): Promise<SharedMaps> {
  const loaders = surfaceLoaders(id);
  const [albedoUrl, normalUrl, ormUrl] = await Promise.all([loaders.albedo(), loaders.normal?.(), loaders.orm?.()]);
  const loader = new TextureLoader();
  const [albedo, normal, orm] = await Promise.all([
    loadTexture(loader, albedoUrl),
    normalUrl ? loadTexture(loader, normalUrl) : undefined,
    ormUrl ? loadTexture(loader, ormUrl) : undefined,
  ]);
  albedo.colorSpace = SRGBColorSpace; // normal and orm stay in the default, linear space
  return { albedo, ...(normal ? { normal } : {}), ...(orm ? { orm } : {}) };
}

function disposeShared(maps: SharedMaps): void {
  for (const texture of [maps.albedo, maps.normal, maps.orm]) texture?.dispose();
}

function acquireShared(id: string): SharedEntry {
  let entry = shared.get(id);
  if (!entry) {
    entry = { refs: 0, ready: loadShared(id) };
    shared.set(id, entry);
  }
  entry.refs += 1;
  return entry;
}

function releaseShared(id: string, entry: SharedEntry): void {
  entry.refs -= 1;
  if (entry.refs > 0) return;
  if (shared.get(id) === entry) shared.delete(id);
  entry.ready.then(disposeShared, () => undefined);
}

/** How many repeats cover `widthMetres` by `heightMetres` at the surface's real-world tile size. */
export function tileRepeat(id: string, widthMetres: number, heightMetres: number): [number, number] {
  const { tileMetres } = getSurface(id);
  return [widthMetres / tileMetres, heightMetres / tileMetres];
}

function repeatOf(options: SurfaceOptions): [number, number] {
  const repeat = options.repeat ?? 1;
  return typeof repeat === 'number' ? [repeat, repeat] : [repeat[0], repeat[1]];
}

function configured(texture: Texture, repeat: [number, number], anisotropy: number): Texture {
  const clone = texture.clone();
  clone.wrapS = RepeatWrapping;
  clone.wrapT = RepeatWrapping;
  clone.repeat.set(repeat[0], repeat[1]);
  clone.anisotropy = anisotropy;
  clone.needsUpdate = true;
  return clone;
}

/**
 * A material for a surface id, returned at once; its maps attach when decoded (`ready`). Plain
 * MeshStandardMaterial, or MeshPhysicalMaterial when `physical` is given: both renderers accept
 * either, and there are no custom shaders.
 */
export function surface(id: string, options: SurfaceOptions = {}): SurfaceHandle {
  const entry = getSurface(id);
  const sharedEntry = acquireShared(id);
  const repeat = repeatOf(options);
  const anisotropy = options.anisotropy ?? 8;
  const common = {
    color: new Color(options.colour ?? 0xffffff),
    roughness: options.roughness ?? 1,
    metalness: entry.metalness ?? 0,
    name: `surface:${id}`,
  };
  const material = options.physical ? new MeshPhysicalMaterial({ ...common, ...options.physical }) : new MeshStandardMaterial(common);
  const clones: Texture[] = [];
  let released = false;

  const ready = sharedEntry.ready.then((maps) => {
    if (released) return;
    const attach = (texture: Texture) => {
      const clone = configured(texture, repeat, anisotropy);
      clones.push(clone);
      return clone;
    };
    material.map = attach(maps.albedo);
    if (maps.normal) {
      material.normalMap = attach(maps.normal);
      const scale = options.normalScale ?? entry.normalScale ?? 1;
      material.normalScale.set(scale, scale);
    }
    if (maps.orm) {
      const orm = attach(maps.orm);
      material.roughnessMap = orm;
      material.aoMap = orm;
      if ((entry.metalness ?? 0) > 0) material.metalnessMap = orm;
    }
    material.needsUpdate = true;
  });

  return {
    material,
    ready,
    release() {
      if (released) return;
      released = true;
      for (const clone of clones) clone.dispose();
      clones.length = 0;
      material.dispose();
      releaseShared(id, sharedEntry);
    },
  };
}
