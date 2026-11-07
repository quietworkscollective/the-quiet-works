import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Accessor { bufferView: number; byteOffset?: number; count: number; componentType: number; normalized?: boolean }
interface BufferView { byteOffset?: number; byteStride?: number }
interface Gltf {
  nodes: { name?: string; mesh?: number }[];
  meshes: { primitives: { attributes: Record<string, number> }[] }[];
  accessors: Accessor[];
  bufferViews: BufferView[];
}

function readModel(): { json: Gltf; bin: DataView } {
  const file = readFileSync(new URL('./assets/tomorrow-engine.glb', import.meta.url));
  const jsonLength = file.readUInt32LE(12);
  const json = JSON.parse(file.toString('utf8', 20, 20 + jsonLength)) as Gltf;
  const binStart = 20 + jsonLength + 8;
  return { json, bin: new DataView(file.buffer, file.byteOffset + binStart, file.length - binStart) };
}

function positionsX(json: Gltf, bin: DataView, accessorIndex: number): number[] {
  const accessor = json.accessors[accessorIndex]!;
  const view = json.bufferViews[accessor.bufferView]!;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? 12;
  return Array.from({ length: accessor.count }, (_, index) => bin.getFloat32(start + index * stride, true));
}

function texcoordsU(json: Gltf, bin: DataView, accessorIndex: number): number[] {
  const accessor = json.accessors[accessorIndex]!;
  const view = json.bufferViews[accessor.bufferView]!;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const width = accessor.componentType === 5126 ? 8 : 4;
  const stride = view.byteStride ?? width;
  return Array.from({ length: accessor.count }, (_, index) => {
    const at = start + index * stride;
    return accessor.componentType === 5126 ? bin.getFloat32(at, true) : bin.getUint16(at, true) / 65535;
  });
}

describe('Tomorrow Engine lettering', () => {
  it('reads the date numerals left to right from the visitor side of the room', () => {
    const { json, bin } = readModel();
    const node = json.nodes.find((entry) => entry.name === 'Date_Numeral_Quad');
    expect(node?.mesh).toBeTypeOf('number');
    const { POSITION, TEXCOORD_0 } = json.meshes[node!.mesh!]!.primitives[0]!.attributes;
    const x = positionsX(json, bin, POSITION!);
    const u = texcoordsU(json, bin, TEXCOORD_0!);
    // Station cameras look along +Z, so model -X is the right of the visitor's screen.
    const screenLeft = u.filter((_, index) => x[index]! > 0);
    const screenRight = u.filter((_, index) => x[index]! < 0);
    expect(Math.max(...screenLeft)).toBeLessThan(Math.min(...screenRight));
  });
});
