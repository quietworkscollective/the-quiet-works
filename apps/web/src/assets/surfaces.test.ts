import { MeshPhysicalMaterial, MeshStandardMaterial, SRGBColorSpace, Texture } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSurface } from './catalogue.ts';
import { type DomStub, installDomStub } from './domStub.ts';
import { liveSurfaceIds, surface, tileRepeat } from './surfaces.ts';

const ID = 'plaster-clean';
let stub: DomStub;
let disposed: Texture[];

beforeEach(() => {
  stub = installDomStub({ bitmaps: true });
  disposed = [];
  const original = Texture.prototype.dispose;
  vi.spyOn(Texture.prototype, 'dispose').mockImplementation(function (this: Texture) {
    disposed.push(this);
    return original.call(this);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  stub.restore();
});

describe('surface materials', () => {
  it('returns a plain MeshStandardMaterial at once and attaches the maps when decoded', async () => {
    const handle = surface(ID, { repeat: [3, 2] });
    expect(handle.material).toBeInstanceOf(MeshStandardMaterial);
    expect(handle.material.map).toBeNull();
    await handle.ready;
    const { material } = handle;
    expect(material.map?.colorSpace).toBe(SRGBColorSpace);
    expect(material.normalMap?.colorSpace).not.toBe(SRGBColorSpace);
    expect(material.roughnessMap).toBe(material.aoMap);
    expect(material.roughnessMap?.colorSpace).not.toBe(SRGBColorSpace);
    for (const map of [material.map, material.normalMap, material.roughnessMap]) {
      expect(map?.repeat.toArray()).toEqual([3, 2]);
      expect(map?.wrapS).toBe(1000); // RepeatWrapping
    }
    expect(stub.fetchCalls).toEqual([]);
    handle.release();
  });

  it('switches to MeshPhysicalMaterial when physical parameters are given', async () => {
    const handle = surface(ID, { physical: { clearcoat: 0.4 } });
    expect(handle.material).toBeInstanceOf(MeshPhysicalMaterial);
    expect((handle.material as MeshPhysicalMaterial).clearcoat).toBe(0.4);
    await handle.ready;
    handle.release();
  });

  it('applies the tint and the roughness multiplier', async () => {
    const handle = surface(ID, { colour: 0x808080, roughness: 0.5 });
    expect(handle.material.color.getHex()).toBe(new MeshStandardMaterial({ color: 0x808080 }).color.getHex());
    expect(handle.material.roughness).toBe(0.5);
    await handle.ready;
    handle.release();
  });

  it('computes repeats from the real-world tile size', () => {
    const tile = getSurface(ID).tileMetres;
    expect(tileRepeat(ID, tile * 3, tile)).toEqual([3, 1]);
  });
});

describe('shared images and disposal', () => {
  it('decodes the set once for any number of materials, each with its own repeat on a shared image', async () => {
    const a = surface(ID, { repeat: 1 });
    const b = surface(ID, { repeat: 5 });
    await Promise.all([a.ready, b.ready]);
    expect(stub.images.length).toBe(3);
    expect(a.material.map?.source).toBe(b.material.map?.source);
    expect(a.material.map).not.toBe(b.material.map);
    expect(a.material.map?.repeat.x).toBe(1);
    expect(b.material.map?.repeat.x).toBe(5);
    a.release();
    b.release();
  });

  it('keeps the shared images until the last material is released, then disposes every texture', async () => {
    const a = surface(ID);
    const b = surface(ID);
    await Promise.all([a.ready, b.ready]);
    a.release();
    // Only a's own three clones so far; the shared set (and b's clones) are still in use.
    expect(disposed.length).toBe(3);
    expect(liveSurfaceIds()).toEqual([ID]);
    b.release();
    await Promise.resolve();
    await Promise.resolve();
    // a's clones, b's clones, and the three shared textures.
    expect(disposed.length).toBe(9);
    expect(new Set(disposed).size).toBe(9);
    expect(liveSurfaceIds()).toEqual([]);
  });

  it('releasing twice does nothing more', async () => {
    const handle = surface(ID);
    await handle.ready;
    handle.release();
    handle.release();
    await Promise.resolve();
    await Promise.resolve();
    expect(disposed.length).toBe(6);
  });

  it('attaches nothing and leaks nothing when released before the maps arrive', async () => {
    const handle = surface(ID);
    handle.release();
    await handle.ready;
    await Promise.resolve();
    await Promise.resolve();
    expect(handle.material.map).toBeNull();
    expect(liveSurfaceIds()).toEqual([]);
    // The three shared textures were created, so the last release disposes them.
    expect(disposed.length).toBe(3);
  });
});
