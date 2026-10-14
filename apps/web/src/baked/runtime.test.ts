import { expect, it, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { BoxGeometry, Int16BufferAttribute, Mesh, MeshStandardMaterial, Scene, SRGBColorSpace, LinearFilter, Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TextureLoader } from 'three';
import { digest, meshId, type BakeManifest } from './contract.ts';
import { bindBake, decodeGeometry } from './runtime.ts';

it('disposes every created GPU resource and restores originals on unmount', async () => {
  const scene = new Scene();
  const original = new Mesh(new BoxGeometry(1,1,40), new MeshStandardMaterial());
  scene.add(original); scene.updateMatrixWorld(true);
  const id = await meshId(original,original.geometry);
  const imported = new Scene();
  const geometry = original.geometry.clone();
  geometry.setAttribute('uv1',geometry.getAttribute('uv').clone());
  const position = geometry.getAttribute('position');
  geometry.setAttribute('position', new Int16BufferAttribute(Array.from({length:position.count*3},(_,i)=>Math.round(position.getComponent(Math.floor(i/3),i%3)/20*32767)),3,true));
  const material = new MeshStandardMaterial();
  const baked = new Mesh(geometry,material); baked.userData['bakeId']=id;
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
  replacement.geometry.computeBoundingBox();
  expect(replacement.geometry.boundingBox!.max.z).toBeCloseTo(20,3);
  binding.dispose(); binding.dispose();
  expect(scene.children).toEqual([original]); expect(original.visible).toBe(true);
  for (const spy of [geometryDispose,materialDispose,textureDispose,clonedGeometryDispose,clonedMaterialDispose]) expect(spy).toHaveBeenCalledTimes(1);
  parser.mockRestore(); loader.mockRestore(); original.geometry.dispose(); original.material.dispose();
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
