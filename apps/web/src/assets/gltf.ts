// Decoding a GLB with no network. The site's policy is `connect-src 'none'`: no fetch and no XHR,
// even to its own origin. GLTFLoader.load fetches, so models arrive as bytes and go through
// `parse`; and GLTFLoader's default image path (ImageBitmapLoader) fetches the embedded image
// through a blob: URL, so a plugin replaces it with TextureLoader, which loads through an <img>
// (allowed by `img-src 'self' data: blob:`). No Draco, meshopt or KTX2: their decoders need
// WebAssembly, which the policy does not allow either.
import { TextureLoader } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTFLoaderPlugin, GLTFParser } from 'three/addons/loaders/GLTFLoader.js';
import type { Group } from 'three';

/** Makes the parser load embedded images through an <img> element, never through fetch. */
export function imageElementTextures(parser: GLTFParser): GLTFLoaderPlugin {
  return {
    name: 'TQW_image_element_textures',
    beforeRoot() {
      const loader = new TextureLoader(parser.options.manager);
      loader.setCrossOrigin(parser.options.crossOrigin);
      parser.textureLoader = loader;
      return null;
    },
  };
}

export function createGlbLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  loader.register(imageElementTextures);
  return loader;
}

/** Bytes of the base64 payload of a data: URL (what a `?inline` import yields). */
export function bytesFromDataUrl(dataUrl: string): ArrayBuffer {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma < 0) throw new Error('expected a data: URL');
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function decodeGlb(buffer: ArrayBuffer): Promise<Group> {
  const gltf = await createGlbLoader().parseAsync(buffer, '');
  return gltf.scene;
}
