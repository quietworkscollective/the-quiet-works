/**
 * Shrinks a Blender-exported glTF binary into the file the site ships, with glTF-Transform's API
 * (the root dev dependency; resolved through the CLI package so nothing new is installed):
 *
 *   dedup, prune, weld -> quantise normals and texture coordinates -> textures to WebP.
 *
 * Positions stay 32-bit float on purpose. Quantising them rewrites each node's translation to the
 * mesh centre, which would move the pivot of every drawer, lid and dial off its hinge. No Draco, no
 * meshopt and no KTX2: their decoders are WebAssembly and the site's security policy allows none.
 */
import { realpathSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const cliDir = realpathSync(join(REPO, 'node_modules', '@gltf-transform', 'cli'));
const need = createRequire(join(cliDir, 'package.json'));

const { NodeIO } = need('@gltf-transform/core');
const { ALL_EXTENSIONS, KHRMeshQuantization } = need('@gltf-transform/extensions');
const { dedup, prune, weld, quantize, textureCompress } = need('@gltf-transform/functions');
const sharp = need('sharp');

export interface OptimiseOptions {
  /** WebP quality for base colour, packed occlusion-roughness-metallic and normal maps. */
  quality?: { color?: number; orm?: number; normal?: number };
  /** Quantize positions for stage sets whose moving nodes have authored, centred pivots. */
  quantizePosition?: number;
  copyright?: string;
}

export async function optimise(input: string, output: string, options: OptimiseOptions = {}): Promise<void> {
  const q = { color: 88, orm: 90, normal: 94, ...options.quality };
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.readBinary(new Uint8Array(readFileSync(input)));
  await doc.transform(dedup(), prune(), weld());
  const positionPattern = options.quantizePosition === undefined ? '' : '|POSITION';
  await doc.transform(quantize({
    pattern: new RegExp('^(NORMAL|TANGENT|TEXCOORD_0' + positionPattern + ')$'),
    ...(options.quantizePosition === undefined ? {} : { quantizePosition: options.quantizePosition }),
    quantizeNormal: 10,
    quantizeTexcoord: 14,
  }));
  // glTF-Transform only declares KHR_mesh_quantization when positions are quantised, but 16-bit
  // normals are not legal glTF without it.
  const quantised = doc
    .getRoot()
    .listMeshes()
    .flatMap((mesh: any) => mesh.listPrimitives())
    .some((prim: any) => ['NORMAL', 'POSITION'].some(name => prim.getAttribute(name)?.getComponentType() === 5122));
  if (quantised) doc.createExtension(KHRMeshQuantization).setRequired(true);
  const webp = (slots: RegExp, quality: number, nearLossless = false): any =>
    textureCompress({ encoder: sharp, targetFormat: 'webp', slots, quality, nearLossless, effort: 100 });
  await doc.transform(
    webp(/^baseColor/, q.color),
    webp(/^(metallicRoughness|occlusion)/, q.orm),
    webp(/^normal/, q.normal, true),
  );
  if (options.copyright) doc.getRoot().getAsset().copyright = options.copyright;
  writeFileSync(output, await io.writeBinary(doc));
}

/** A render still to a compact WebP preview, `width` pixels wide. */
export async function pngToWebp(input: string, output: string, width = 1000, quality = 82): Promise<void> {
  await sharp(input).resize({ width, withoutEnlargement: true }).webp({ quality, effort: 6 }).toFile(output);
}
