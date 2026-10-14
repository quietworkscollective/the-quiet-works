import { expect, it, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { BoxGeometry, Float32BufferAttribute, Int16BufferAttribute, Mesh, MeshStandardMaterial, Scene, SRGBColorSpace, LinearFilter, Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TextureLoader } from 'three';
import { digest, meshId, type BakeManifest } from './contract.ts';
import { bindBake, decodeGeometry, type BakeAssets } from './runtime.ts';

it('disposes every created GPU resource and restores originals on unmount', async () => {
  const scene = new Scene();
  const original = new Mesh(new BoxGeometry(1,1,40), new MeshStandardMaterial());
  scene.add(original); scene.updateMatrixWorld(true);
  const id = await meshId(original,original.geometry);
  const imported = new Scene();
  const geometry = original.geometry.clone();
  geometry.setAttribute('uv1',geometry.getAttribute('uv').clone());
  const position = geometry.getAttribute('position');
  geometry.setAttribute('uv',new Float32BufferAttribute(Array.from({length:position.count*2},(_,i)=>i%2===0?0.5:0.25),2));
  geometry.setAttribute('position', new Int16BufferAttribute(Array.from({length:position.count*3},(_,i)=>Math.round(position.getComponent(Math.floor(i/3),i%3)/20*32767)),3,true));
  const material = new MeshStandardMaterial();
  const baked = new Mesh(geometry,material); baked.userData['bakeId']=id;
  baked.userData['tqwUv0Range']=[-2,6,10,14];
  baked.scale.setScalar(20);
  imported.add(baked);
  const texture = new Texture<HTMLImageElement>();
  const geometryDispose = vi.spyOn(geometry,'dispose');
  const materialDispose = vi.spyOn(material,'dispose');
  const textureDispose = vi.spyOn(texture,'dispose');
  const parser = vi.spyOn(GLTFLoader.prototype,'parseAsync').mockResolvedValue({ scene: imported } as never);
  const loader = vi.spyOn(TextureLoader.prototype,'loadAsync').mockResolvedValue(texture);
  const manifest: BakeManifest = { version:1,space:'office',hash:await digest(JSON.stringify({meshes:[id],lights:[]})),meshes:[id],lights:[],atlases:[{file:'test',width:16,height:16,scale:2,encoding:'srgb-scale',bytes:1}] };
  const binding = await bindBake(scene,{manifest,geometry:inlineGLB(),images:['test']});
  const replacement = scene.children.find(o=>o!==original) as Mesh;
  const clonedGeometryDispose = vi.spyOn(replacement.geometry,'dispose');
  const clonedMaterialDispose = vi.spyOn(replacement.material as MeshStandardMaterial,'dispose');
  expect(original.visible).toBe(false);
  expect(texture.colorSpace).toBe(SRGBColorSpace);
  expect(texture.generateMipmaps).toBe(false);
  expect(texture.minFilter).toBe(LinearFilter);
  expect(replacement.geometry.hasAttribute('uv1')).toBe(true);
  expect(replacement.geometry.getAttribute('uv').getX(0)).toBeCloseTo(2,6);
  expect(replacement.geometry.getAttribute('uv').getY(0)).toBeCloseTo(11,6);
  expect(baked.userData['tqwUv0Range']).toBeUndefined();
  replacement.geometry.computeBoundingBox();
  expect(replacement.geometry.boundingBox!.max.z).toBeCloseTo(20,3);
  binding.dispose(); binding.dispose();
  expect(scene.children).toEqual([original]); expect(original.visible).toBe(true);
  for (const spy of [geometryDispose,materialDispose,textureDispose,clonedGeometryDispose,clonedMaterialDispose]) expect(spy).toHaveBeenCalledTimes(1);
  parser.mockRestore(); loader.mockRestore(); original.geometry.dispose(); original.material.dispose();
});

it('binds the base scene while only manifest-listed lazy meshes are still absent', async () => {
  const scene = new Scene();
  const original = new Mesh(new BoxGeometry(1, 1, 4), new MeshStandardMaterial());
  scene.add(original);
  scene.updateMatrixWorld(true);
  const id = await meshId(original, original.geometry);
  const lazyId = 'f'.repeat(64);
  const manifest: BakeManifest = {
    version: 1,
    space: 'office',
    hash: await digest(JSON.stringify({ meshes: [id, lazyId].sort(), lights: [] })),
    meshes: [id, lazyId].sort(),
    lazyMeshes: [lazyId],
    lights: [],
    atlases: [{ file: 'test', width: 16, height: 16, scale: 1, encoding: 'srgb-scale', bytes: 1 }],
  };
  const imported = new Scene();
  const bakedGeometry = original.geometry.clone();
  bakedGeometry.setAttribute('uv1', bakedGeometry.getAttribute('uv').clone());
  const baked = new Mesh(bakedGeometry, new MeshStandardMaterial());
  baked.userData['bakeId'] = id;
  imported.add(baked);
  const parser = vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValue({ scene: imported } as never);
  const texture = new Texture<HTMLImageElement>();
  const loader = vi.spyOn(TextureLoader.prototype, 'loadAsync').mockResolvedValue(texture);
  const binding = await bindBake(scene, { manifest, geometry: inlineGLB(), images: ['test'] }, () => false, { allowLazyMissing: true });
  expect(original.visible).toBe(false);
  binding.dispose();
  expect(original.visible).toBe(true);
  await expect(bindBake(scene, { manifest, geometry: inlineGLB(), images: ['test'] })).rejects.toThrow('Stale bake');
  parser.mockRestore();
  loader.mockRestore();
  original.geometry.dispose();
  original.material.dispose();
});

it('does not import lazy baked geometry until the complete receiver set is mounted', async () => {
  const scene = new Scene();
  const baseOriginal = new Mesh(new BoxGeometry(1, 1, 4), new MeshStandardMaterial());
  scene.add(baseOriginal);
  scene.updateMatrixWorld(true);
  const baseId = await meshId(baseOriginal, baseOriginal.geometry);
  const lazyOriginal = new Mesh(new BoxGeometry(1, 2, 4), new MeshStandardMaterial());
  scene.add(lazyOriginal);
  scene.updateMatrixWorld(true);
  const lazyId = await meshId(lazyOriginal, lazyOriginal.geometry);
  lazyOriginal.removeFromParent();
  scene.updateMatrixWorld(true);
  const ids = [baseId, lazyId].sort();
  const manifest: BakeManifest = {
    version: 1,
    space: 'office',
    hash: await digest(JSON.stringify({ meshes: ids, lights: [] })),
    meshes: ids,
    lazyMeshes: [lazyId],
    lights: [],
    atlases: [{ file: 'test', width: 16, height: 16, scale: 1, encoding: 'srgb-scale', bytes: 1 }],
  };
  const bakedScene = (id: string, geometry: BoxGeometry) => {
    const imported = new Scene();
    const mesh = new Mesh(geometry, new MeshStandardMaterial());
    mesh.geometry.setAttribute('uv1', mesh.geometry.getAttribute('uv').clone());
    mesh.userData['bakeId'] = id;
    imported.add(mesh);
    return { scene: imported } as never;
  };
  const parser = vi.spyOn(GLTFLoader.prototype, 'parseAsync')
    .mockResolvedValueOnce(bakedScene(baseId, new BoxGeometry(1, 1, 4)))
    .mockResolvedValueOnce(bakedScene(baseId, new BoxGeometry(1, 1, 4)))
    .mockResolvedValueOnce(bakedScene(lazyId, new BoxGeometry(1, 2, 4)));
  const lazyGeometry = vi.fn(async () => [inlineGLB()]);
  const loader = vi.spyOn(TextureLoader.prototype, 'loadAsync').mockImplementation(async () => new Texture<HTMLImageElement>());
  const assets = { manifest, geometry: [inlineGLB()], loadLazyGeometry: lazyGeometry, images: ['test'] } as BakeAssets;

  const partial = await bindBake(scene, assets, () => false, { allowLazyMissing: true });
  expect(lazyGeometry).not.toHaveBeenCalled();
  expect(parser).toHaveBeenCalledTimes(1);
  expect(baseOriginal.visible).toBe(false);
  partial.dispose();
  expect(baseOriginal.visible).toBe(true);

  scene.add(lazyOriginal);
  scene.updateMatrixWorld(true);
  const complete = await bindBake(scene, assets);
  expect(lazyGeometry).toHaveBeenCalledTimes(1);
  expect(parser).toHaveBeenCalledTimes(3);
  expect(baseOriginal.visible).toBe(false);
  expect(lazyOriginal.visible).toBe(false);
  complete.dispose();

  parser.mockRestore();
  loader.mockRestore();
  baseOriginal.geometry.dispose();
  (baseOriginal.material as MeshStandardMaterial).dispose();
  lazyOriginal.geometry.dispose();
  (lazyOriginal.material as MeshStandardMaterial).dispose();
});

function inlineGLB(document: object = { asset: { version: '2.0' } }): string {
  const json = Buffer.from(JSON.stringify(document));
  const length = json.length + (4 - json.length % 4) % 4;
  const buffer = Buffer.alloc(28 + length);
  buffer.writeUInt32LE(0x46546c67,0); buffer.writeUInt32LE(2,4); buffer.writeUInt32LE(buffer.length,8);
  buffer.writeUInt32LE(length,12); buffer.writeUInt32LE(0x4e4f534a,16);
  buffer.fill(32,20,20+length); json.copy(buffer,20);
  buffer.writeUInt32LE(0x004e4942,24+length);
  return 'data:model/gltf-binary;base64,' + buffer.toString('base64');
}

it('rejects external image/buffer loads and decoder extensions before parsing', async () => {
  await expect(decodeGeometry(inlineGLB())).resolves.toBeInstanceOf(ArrayBuffer);
  const compressed='data:application/gzip;base64,'+gzipSync(Buffer.from(inlineGLB().split(',')[1]!, 'base64')).toString('base64');
  await expect(decodeGeometry(compressed)).resolves.toBeInstanceOf(ArrayBuffer);
  for (const document of [{buffers:[{uri:'scene.bin'}]},{images:[{uri:'map.png'}]},{extensionsRequired:['KHR_draco_mesh_compression']}]) {
    await expect(decodeGeometry(inlineGLB(document))).rejects.toThrow('external resources');
  }
});
