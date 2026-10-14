import { type Material, type Mesh, type Object3D, type Texture } from 'three';

function isTexture(value: unknown): value is Texture {
  return typeof value === 'object' && value !== null && (value as Texture).isTexture === true;
}

/** Every texture a material references, in any slot (map, normalMap, aoMap, clearcoatMap, ...). */
export function texturesOf(material: Material): Texture[] {
  const found = new Set<Texture>();
  for (const value of Object.values(material)) if (isTexture(value)) found.add(value);
  return [...found];
}

export interface Resources {
  readonly geometries: Set<{ dispose(): void }>;
  readonly materials: Set<Material>;
  readonly textures: Set<Texture>;
}

/** The GPU-backed objects reachable from `root`: shared between clones, so counted once. */
export function collectResources(root: Object3D): Resources {
  const geometries = new Set<{ dispose(): void }>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
      for (const texture of texturesOf(material)) textures.add(texture);
    }
  });
  return { geometries, materials, textures };
}

/** Releases every GPU handle under `root`. Call it once, when the last user is gone. */
export function disposeResources(root: Object3D): void {
  const { geometries, materials, textures } = collectResources(root);
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  // ImageBitmap-backed textures hold decoded pixels outside the GPU; drop them too.
  for (const texture of textures) {
    const image = texture.image as { close?: () => void } | undefined;
    if (image && typeof image.close === 'function') image.close();
  }
}
