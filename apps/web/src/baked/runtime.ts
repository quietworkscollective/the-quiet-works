import { sceneLights } from './lights.ts';
import { Float32BufferAttribute, LinearFilter, LinearSRGBColorSpace, SRGBColorSpace, Matrix4, Mesh, Texture, TextureLoader, type BufferGeometry, type Material, type Scene } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assertFresh, digest, isStatic, meshId, sourceGeometry, transformGeometry, type BakeManifest, type BakeMaterial } from './contract.ts';

export interface BakeAssets {
  manifest: BakeManifest;
  /** Geometry required to draw the initial scene. */
  geometry: string | string[];
  /** Deferred receiver geometry, loaded only for the exact full-scene bind. */
  loadLazyGeometry?: () => Promise<string[]>;
  images: string[];
}
export interface BakeBinding { dispose(): void }

export function usesLightmaps(_quality: 'lite' | 'full'): boolean { return true; }

export async function decodeGeometry(data: string): Promise<ArrayBuffer> {
  if (!/^data:(model\/gltf-binary|application\/octet-stream|application\/gzip);base64,/.test(data)) throw new Error('Baked geometry must be inline glTF');
  let buffer = Uint8Array.from(atob(data.slice(data.indexOf(',') + 1)), c => c.charCodeAt(0)).buffer;
  if (data.startsWith('data:application/gzip;')) {
    buffer = await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  const view = new DataView(buffer);
  if (buffer.byteLength < 28 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength) throw new Error('Invalid inline glTF');
  const jsonLength = view.getUint32(12, true);
  const document = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength))) as {
    buffers?: { uri?: string }[]; images?: unknown[]; extensionsRequired?: string[];
  };
  if (document.buffers?.some(b => b.uri !== undefined) || document.images?.length || document.extensionsRequired?.some(e => e !== 'KHR_mesh_quantization')) throw new Error('Baked glTF must not load external resources or decoders');
  return buffer;
}

/** One mount owns all loader-created resources, including completion after cancellation. */
export async function bindBake(
  scene: Scene,
  assets: BakeAssets,
  cancelled: () => boolean = () => false,
  options: { allowLazyMissing?: boolean } = {},
): Promise<BakeBinding> {
  const allowLazyMissing = options.allowLazyMissing ?? false;
  const owned = new Set<BufferGeometry | Material | Texture>();
  const replacements: { original: Mesh; baked: Mesh; visible: boolean }[] = [];
  const dispose = () => {
    for (const { original, baked, visible } of replacements) { baked.removeFromParent(); original.visible = visible; }
    replacements.length = 0;
    for (const resource of owned) resource.dispose();
    owned.clear();
  };
  try {
    scene.updateMatrixWorld(true);
    const originals: Mesh[] = [];
    scene.traverse(o => { if (o instanceof Mesh && isStatic(o)) originals.push(o); });
    const identified = new Map<string, Mesh>();
    for (const mesh of originals) {
      const geometry = sourceGeometry(mesh);
      const id = await meshId(mesh, geometry);
      geometry.dispose();
      if (identified.has(id)) throw new Error('Ambiguous static geometry identity');
      identified.set(id, mesh);
    }
    const expectedIds = [...assets.manifest.meshes].sort();
    const expected = new Set(expectedIds);
    const lazy = new Set(assets.manifest.lazyMeshes ?? []);
    if ([...lazy].some((id) => !expected.has(id))) throw new Error('Bake manifest names an unknown lazy mesh');
    const actualIds = [...identified.keys()].sort();
    const unexpected = actualIds.some((id) => !expected.has(id));
    const missingRequired = expectedIds.some((id) => !identified.has(id) && !(allowLazyMissing && lazy.has(id)));
    if (unexpected || missingRequired) throw new Error('Stale bake: runtime static geometry or lighting changed; run pnpm bake');
    assertFresh(assets.manifest.hash, await digest(JSON.stringify({ meshes: expectedIds, lights: sceneLights(scene, assets.manifest.space) })));
    const geometryFiles = typeof assets.geometry === 'string' ? [assets.geometry] : [...assets.geometry];
    if (!allowLazyMissing && lazy.size > 0) {
      if (!assets.loadLazyGeometry) throw new Error('Missing lazy baked geometry loader');
      geometryFiles.push(...await assets.loadLazyGeometry());
    }
    if (cancelled()) { dispose(); return { dispose }; }
    const loaded: Mesh[] = [];
    for (const data of geometryFiles) {
      const gltf = await new GLTFLoader().parseAsync(await decodeGeometry(data), '');
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse(o => {
        if (!(o instanceof Mesh)) return;
        const uv0Range = o.userData['tqwUv0Range'];
        if (Array.isArray(uv0Range) && uv0Range.length === 4 && uv0Range.every(Number.isFinite)) {
          const uv = o.geometry.getAttribute('uv');
          if (!uv || uv.itemSize !== 2) throw new Error(`Missing packed TEXCOORD_0 on ${o.name || 'baked mesh'}`);
          const [minU, maxU, minV, maxV] = uv0Range as [number, number, number, number];
          const restored = new Float32Array(uv.count * 2);
          for (let i = 0; i < uv.count; i += 1) {
            restored[i * 2] = minU + uv.getX(i) * (maxU - minU);
            restored[i * 2 + 1] = minV + uv.getY(i) * (maxV - minV);
          }
          o.geometry.setAttribute('uv', new Float32BufferAttribute(restored, 2));
          delete o.userData['tqwUv0Range'];
        }
        loaded.push(o);
        owned.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) owned.add(m);
      });
    }
    const textures: Texture[] = [];
    // Sequential ownership means an image error can never orphan an earlier texture.
    for (const [index, url] of assets.images.entries()) {
      const texture = await new TextureLoader().loadAsync(url);
      owned.add(texture);
      texture.colorSpace = assets.manifest.atlases[index]?.encoding === 'srgb-scale' ? SRGBColorSpace : LinearSRGBColorSpace;
      // Broad irradiance needs linear filtering; atlas charts must never merge in coarse mips.
      texture.generateMipmaps = false;
      texture.minFilter = LinearFilter;
      texture.channel = 1;
      texture.flipY = false;
      textures.push(texture);
    }
    if (cancelled()) { dispose(); return { dispose }; }
    const seen = new Set<string>();
    const bakedIds = new Set<string>();
    for (const mesh of loaded) {
      const id = String(mesh.userData['bakeId'] ?? mesh.name.replace(/^bake_/, ''));
      if (!expected.has(id) || bakedIds.has(id)) throw new Error(`Unmatched baked geometry ${id}`);
      bakedIds.add(id);
      const original = identified.get(id);
      if (!original) {
        if (!allowLazyMissing || !lazy.has(id)) throw new Error(`Missing static geometry ${id}`);
        mesh.geometry.dispose();
        owned.delete(mesh.geometry);
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          material.dispose();
          owned.delete(material);
        }
        continue;
      }
      if (seen.has(id) || !original.parent) throw new Error(`Unmatched baked geometry ${id}`);
      seen.add(id);
      const atlas = Number(mesh.userData['atlas'] ?? 0);
      const texture = textures[atlas];
      const meta = assets.manifest.atlases[atlas];
      if (!texture || !meta || !mesh.geometry.hasAttribute('uv1')) throw new Error(`Missing lightmap UV or atlas ${id}`);
      const sourceMaterial = original.material as BakeMaterial;
      const material = sourceMaterial.clone();
      // three.clone does not preserve onBeforeCompile: keep the corridor's existing light/fog path.
      material.onBeforeCompile = sourceMaterial.onBeforeCompile;
      material.customProgramCacheKey = sourceMaterial.customProgramCacheKey;
      owned.add(material);
      material.vertexColors = mesh.geometry.hasAttribute('color');
      material.lightMap = texture;
      material.lightMapIntensity *= meta.scale;
      material.needsUpdate = true;
      const geometry = mesh.geometry.clone();
      owned.add(geometry);
      // Re-imported geometry is authoritative; preserve reflection winding on return to local space.
      transformGeometry(geometry, new Matrix4().copy(original.matrixWorld).invert().multiply(mesh.matrixWorld));
      const baked = new Mesh(geometry, material);
      baked.matrix.copy(original.matrix);
      baked.matrixAutoUpdate = false;
      baked.renderOrder = original.renderOrder;
      replacements.push({ original, baked, visible: original.visible });
    }
    const expectedForBinding = expectedIds.filter(id => !allowLazyMissing || !lazy.has(id));
    if (bakedIds.size !== expectedForBinding.length || expectedForBinding.some(id => !bakedIds.has(id))) throw new Error('Incomplete baked geometry assets');
    if (seen.size !== identified.size) throw new Error('Incomplete baked geometry');
    for (const { original, baked } of replacements) { original.parent?.add(baked); original.visible = false; }
    return { dispose };
  } catch (error) { dispose(); throw error; }
}
