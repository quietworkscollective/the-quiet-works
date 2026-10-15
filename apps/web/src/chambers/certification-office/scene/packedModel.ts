import { bytesFromPackedDataUrl } from '../../../assets/gltf.ts';

/** Reuse the native room decoder while the catalogue still accepts ordinary inline GLB URLs. */
export async function unpackOfficeModel(packed: string): Promise<string> {
  const bytes = new Uint8Array(await bytesFromPackedDataUrl(packed));
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  }
  return `data:model/gltf-binary;base64,${btoa(chunks.join(''))}`;
}
