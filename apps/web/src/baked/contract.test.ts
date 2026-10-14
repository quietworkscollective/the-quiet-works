import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Matrix4, Mesh, MeshLambertMaterial, MeshStandardMaterial, PointLight, Scene, Texture, RepeatWrapping, SRGBColorSpace } from 'three';
import { analyticIntensity, assertFresh, digest, geometrySignature, isStatic, materialSignature, meshId, pointPower, spotPower, transformGeometry } from './contract.ts';
import { sceneLights } from './lights.ts';
import { usesLightmaps } from './runtime.ts';

describe('baked lighting contract', () => {
  it('matches reordered triangles and detects a moved corner', () => {
    const geometry = new BoxGeometry();
    const reversed = geometry.clone();
    const indices = Array.from(geometry.index!.array);
    const triangles = Array.from({ length: indices.length / 3 }, (_,i)=>indices.slice(i*3,i*3+3)).reverse().flat();
    reversed.setIndex(triangles);
    expect(geometrySignature(reversed)).toBe(geometrySignature(geometry));
    const flipped = geometry.clone();
    const winding = Array.from(geometry.index!.array);
    [winding[0],winding[1]] = [winding[1]!,winding[0]!];
    flipped.setIndex(winding);
    expect(geometrySignature(flipped)).not.toBe(geometrySignature(geometry));
    flipped.dispose();
    reversed.getAttribute('position').setX(0,4);
    expect(geometrySignature(reversed)).not.toBe(geometrySignature(geometry));
    geometry.dispose(); reversed.dispose();
  });
  it('restores positions and winding after mirrored affine round trips', () => {
    const original = new BoxGeometry();
    const transformed = original.clone();
    const matrix = new Matrix4().makeScale(-1.7,2.9,1.9);
    transformGeometry(transformed,matrix);
    expect(transformed.index!.getX(1)).toBe(original.index!.getX(2));
    transformGeometry(transformed,matrix.clone().invert());
    expect(geometrySignature(transformed)).toBe(geometrySignature(original));
    original.dispose(); transformed.dispose();
  });
  it('rejects a stale wall and accepts a freshly recorded fingerprint', async () => {
    const mesh = new Mesh(new BoxGeometry(),new MeshStandardMaterial());
    mesh.updateMatrixWorld(true);
    const before = await meshId(mesh, mesh.geometry);
    mesh.geometry.getAttribute('position').setX(0,2);
    const after = await meshId(mesh, mesh.geometry);
    expect(()=>assertFresh(before,after)).toThrow('Stale bake');
    expect(()=>assertFresh(after,after)).not.toThrow();
    expect(await digest('lights=10')).not.toBe(await digest('lights=11'));
    mesh.geometry.dispose(); mesh.material.dispose();
  });
  it('invalidates reflectance when texture transforms or sampling change', async () => {
    const texture = new Texture();
    const material = new MeshStandardMaterial({ map: texture });
    const baseline = await materialSignature(material);
    const changes = [
      () => texture.repeat.set(14,14),
      () => texture.offset.set(.2,.3),
      () => { texture.rotation = .3; },
      () => { texture.wrapS = RepeatWrapping; },
      () => { texture.colorSpace = SRGBColorSpace; },
      () => { texture.channel = 1; },
      () => { texture.flipY = false; },
    ];
    for (const change of changes) {
      const previous = await materialSignature(material);
      change();
      expect(await materialSignature(material)).not.toBe(previous);
    }
    expect(await materialSignature(material)).not.toBe(baseline);
    texture.dispose(); material.dispose();
  });
  it('fingerprints canvas textures from their source inputs, not rasterized pixels', async () => {
    const texture = new Texture();
    texture.image = {
      get width() { throw new Error('Rendered width must not enter a fingerprint'); },
      get height() { throw new Error('Rendered height must not enter a fingerprint'); },
    };
    const material = new MeshStandardMaterial({ map: texture });
    const createElement = vi.fn(() => ({
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: vi.fn(),
        getImageData: () => ({ data: new Uint8ClampedArray([10, 20, 30, 255]) }),
      }),
    }));
    vi.stubGlobal('document', { createElement });
    try {
      const first = await materialSignature(material, 'source-input-a');
      const second = await materialSignature(material, 'source-input-b');
      expect(first).not.toBe(second);
      expect(createElement).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      texture.dispose();
      material.dispose();
    }
  });
  it('converts physical intensity to full sphere radiant power', () => {
    expect(pointPower(10)).toBeCloseTo(125.663706,5);
    expect(pointPower(0)).toBe(0);
    expect(spotPower(10)).toBeCloseTo(31.4159265,5);
    expect(analyticIntensity(13,.55)).toBeCloseTo(3.656014,5);
  });
  it('excludes directly tagged moving lights from runtime freshness', () => {
    const scene = new Scene();
    const light = new PointLight();
    light.userData['bake'] = 'dynamic';
    scene.add(light);
    expect(sceneLights(scene,'office')).toEqual([]);
    expect(sceneLights(scene,'office',true)).toHaveLength(1);
  });
  it('enables lightmaps on the lite and full tiers', () => {
    expect(usesLightmaps('lite')).toBe(true);
    expect(usesLightmaps('full')).toBe(true);
  });
  it('accepts lightmap-capable Lambert and Standard receivers', () => {
    const standard = new Mesh(new BoxGeometry(),new MeshStandardMaterial());
    const lambert = new Mesh(new BoxGeometry(),new MeshLambertMaterial());
    expect(isStatic(standard)).toBe(true);
    expect(isStatic(lambert)).toBe(true);
    standard.geometry.dispose(); (standard.material as MeshStandardMaterial).dispose();
    lambert.geometry.dispose(); (lambert.material as MeshLambertMaterial).dispose();
  });
  it('excludes descendants of dynamic ancestors', () => {
    const scene = new Scene();
    const mesh = new Mesh(new BoxGeometry(),new MeshStandardMaterial());
    scene.add(mesh);
    expect(isStatic(mesh)).toBe(true);
    scene.userData['bake'] = 'dynamic';
    expect(isStatic(mesh)).toBe(false);
    mesh.geometry.dispose(); mesh.material.dispose();
  });
});
