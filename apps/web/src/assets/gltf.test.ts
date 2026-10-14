import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { ImageBitmapLoader, type Mesh, type MeshStandardMaterial, TextureLoader } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { collectResources } from './dispose.ts';
import { type DomStub, FakeImage, installDomStub } from './domStub.ts';
import { bytesFromDataUrl, bytesFromPackedDataUrl, createGlbLoader, decodeGlb, imageElementTextures } from './gltf.ts';
import { loadModel } from './modelStore.ts';

const glb = (): ArrayBuffer => {
  const file = readFileSync(fileURLToPath(new URL('./models/office-desk-metal.glb', import.meta.url)));
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
};

let stub: DomStub | undefined;
afterEach(() => stub?.restore());

describe('GLB decoding with no network', () => {
  it('loads embedded textures through <img>, never ImageBitmapLoader or fetch', async () => {
    // A createImageBitmap exists, so an unconfigured GLTFLoader would pick ImageBitmapLoader (as
    // every current browser does); that loader fetches the image from a blob: URL, which the
    // site's connect-src 'none' forbids.
    stub = installDomStub({ bitmaps: true });
    const scene = await decodeGlb(glb());
    expect(stub.bitmapCalls).toEqual([]);
    expect(stub.fetchCalls).toEqual([]);
    expect(stub.images.length).toBeGreaterThanOrEqual(3);
    const textures = [...collectResources(scene).textures];
    expect(textures.length).toBe(3);
    for (const texture of textures) expect(texture.image).toBeInstanceOf(FakeImage);
    // The material really has its maps (a failed image load would leave them null).
    const meshes: Mesh[] = [];
    scene.traverse((node) => {
      if ((node as Mesh).isMesh) meshes.push(node as Mesh);
    });
    const material = meshes[0]?.material as MeshStandardMaterial;
    expect(material.map).not.toBeNull();
    expect(material.normalMap).not.toBeNull();
    expect(material.roughnessMap).not.toBeNull();
    expect(material.aoMap).toBe(material.roughnessMap);
  });

  it('the plugin swaps the parser\'s texture loader for TextureLoader', () => {
    stub = installDomStub({ bitmaps: true });
    const parser = {
      options: { manager: undefined, crossOrigin: 'anonymous' },
      textureLoader: new ImageBitmapLoader(),
    } as unknown as Parameters<typeof imageElementTextures>[0];
    const plugin = imageElementTextures(parser);
    expect(parser.textureLoader).toBeInstanceOf(ImageBitmapLoader);
    plugin.beforeRoot?.();
    expect(parser.textureLoader).toBeInstanceOf(TextureLoader);
    expect(parser.textureLoader).not.toBeInstanceOf(ImageBitmapLoader);
  });

  it('registers the plugin on every loader it creates', () => {
    stub = installDomStub({ bitmaps: true });
    const callbacks = (createGlbLoader() as unknown as { pluginCallbacks: unknown[] }).pluginCallbacks;
    expect(callbacks).toContain(imageElementTextures);
  });

  it('loads a catalogue model through its lazily imported module', async () => {
    stub = installDomStub({ bitmaps: true });
    const handle = await loadModel('office-desk-metal');
    expect(stub.fetchCalls).toEqual([]);
    expect(stub.bitmapCalls).toEqual([]);
    let meshes = 0;
    handle.object.traverse((node) => {
      if ((node as Mesh).isMesh) meshes += 1;
    });
    expect(meshes).toBe(9);
    handle.release();
  });
});

describe('data URLs', () => {
  it('decodes the base64 payload to the exact bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    const url = `data:model/gltf-binary;base64,${Buffer.from(bytes).toString('base64')}`;
    expect(new Uint8Array(bytesFromDataUrl(url))).toEqual(bytes);
  });

  it('unpacks a gzip data URL in memory without fetching a model', async () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    const url = `data:application/gzip;base64,${gzipSync(bytes).toString('base64')}`;
    expect(new Uint8Array(await bytesFromPackedDataUrl(url))).toEqual(bytes);
  });

  it('rejects anything that is not a data: URL, so a fetched path can never slip through', () => {
    expect(() => bytesFromDataUrl('/assets/office-desk-metal-abc123.glb')).toThrow(/data: URL/);
  });
});
