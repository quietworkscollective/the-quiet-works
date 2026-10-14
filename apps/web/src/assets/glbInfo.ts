// An independent reader for the shipped GLB files, used by the tests to re-measure every number the
// catalogue states (triangles, size in metres, texture bytes) from the bytes themselves, without the
// glTF-Transform code that produced them. It reads only what the pipeline writes: one embedded
// binary buffer, indexed or non-indexed triangle lists, quantised or float attributes, WebP images.

interface Accessor {
  bufferView: number;
  byteOffset?: number;
  componentType: number;
  normalized?: boolean;
  count: number;
  type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT4';
}

interface Primitive {
  attributes: Record<string, number>;
  indices?: number;
  mode?: number;
}

interface NodeDef {
  mesh?: number;
  children?: number[];
  matrix?: number[];
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
}

interface Gltf {
  asset: { copyright?: string };
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  scene?: number;
  scenes: { nodes: number[] }[];
  nodes: NodeDef[];
  meshes: { primitives: Primitive[] }[];
  accessors: Accessor[];
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  images?: { bufferView?: number; mimeType?: string; uri?: string }[];
  textures?: { source?: number; extensions?: Record<string, { source: number }> }[];
}

export interface GlbInfo {
  readonly json: Gltf;
  readonly triangles: number;
  readonly drawCalls: number;
  /** Axis-aligned bounds of the whole scene, from the vertex data, in metres. */
  readonly min: [number, number, number];
  readonly max: [number, number, number];
  /** Encoded bytes of every embedded image, each counted once. */
  readonly textureBytes: number;
  readonly images: { width: number; height: number; bytes: number; mimeType: string }[];
}

const COMPONENT = { 5120: [1, false], 5121: [1, false], 5122: [2, false], 5123: [2, false], 5125: [4, false], 5126: [4, true] } as const;
const TYPE_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 } as const;

function parseContainer(bytes: Uint8Array): { json: Gltf; bin: Uint8Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB (bad magic)');
  if (view.getUint32(4, true) !== 2) throw new Error('not glTF 2.0');
  let offset = 12;
  let json: Gltf | undefined;
  let bin: Uint8Array | undefined;
  while (offset < bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(data)) as Gltf;
    else if (type === 0x004e4942) bin = data;
    offset += 8 + length; // chunk lengths are already padded to 4 bytes
  }
  if (!json || !bin) throw new Error('GLB is missing its JSON or BIN chunk');
  return { json, bin };
}

function readAccessor(json: Gltf, bin: Uint8Array, index: number): number[][] {
  const accessor = json.accessors[index];
  if (!accessor) throw new Error(`no accessor ${index}`);
  const view = json.bufferViews[accessor.bufferView];
  if (!view) throw new Error(`no bufferView ${accessor.bufferView}`);
  const [size, normalisedByDefault] = COMPONENT[accessor.componentType as keyof typeof COMPONENT];
  const width = TYPE_SIZE[accessor.type];
  const stride = view.byteStride ?? size * width;
  const data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const rows: number[][] = [];
  for (let i = 0; i < accessor.count; i += 1) {
    const row: number[] = [];
    for (let c = 0; c < width; c += 1) {
      const at = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * stride + c * size;
      let value: number;
      switch (accessor.componentType) {
        case 5120: value = data.getInt8(at); break;
        case 5121: value = data.getUint8(at); break;
        case 5122: value = data.getInt16(at, true); break;
        case 5123: value = data.getUint16(at, true); break;
        case 5125: value = data.getUint32(at, true); break;
        default: value = data.getFloat32(at, true);
      }
      if (accessor.normalized && !normalisedByDefault) {
        const max = accessor.componentType === 5120 ? 127 : accessor.componentType === 5122 ? 32767 : accessor.componentType === 5121 ? 255 : 65535;
        value = Math.max(value / max, accessor.componentType === 5121 || accessor.componentType === 5123 ? 0 : -1);
      }
      row.push(value);
    }
    rows.push(row);
  }
  return rows;
}

type Matrix = number[]; // column-major 4x4

function multiply(a: Matrix, b: Matrix): Matrix {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += (a[k * 4 + row] ?? 0) * (b[col * 4 + k] ?? 0);
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

function local(node: NodeDef): Matrix {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

/** Width and height from a WebP file header (VP8, VP8L or VP8X). */
export function webpSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP') throw new Error('not a WebP image');
  const kind = tag(12);
  if (kind === 'VP8X') return { width: 1 + (view.getUint16(24, true) | (view.getUint8(26) << 16)), height: 1 + (view.getUint16(27, true) | (view.getUint8(29) << 16)) };
  if (kind === 'VP8L') {
    const bits = view.getUint32(21, true);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  if (kind === 'VP8 ') return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  throw new Error(`unknown WebP chunk ${kind}`);
}

export function readGlb(bytes: Uint8Array): GlbInfo {
  const { json, bin } = parseContainer(bytes);
  const sceneIndex = json.scene ?? 0;
  const roots = json.scenes[sceneIndex]?.nodes ?? [];
  let triangles = 0;
  let drawCalls = 0;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const identity: Matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  const visit = (nodeIndex: number, parent: Matrix): void => {
    const node = json.nodes[nodeIndex];
    if (!node) throw new Error(`no node ${nodeIndex}`);
    const world = multiply(parent, local(node));
    if (node.mesh !== undefined) {
      const mesh = json.meshes[node.mesh];
      if (!mesh) throw new Error(`no mesh ${node.mesh}`);
      for (const primitive of mesh.primitives) {
        if ((primitive.mode ?? 4) !== 4) throw new Error('only triangle lists are supported');
        drawCalls += 1;
        const positions = readAccessor(json, bin, primitive.attributes.POSITION ?? -1);
        triangles += (primitive.indices === undefined ? positions.length : (json.accessors[primitive.indices]?.count ?? 0)) / 3;
        for (const [px = 0, py = 0, pz = 0] of positions) {
          const x = (world[0] ?? 0) * px + (world[4] ?? 0) * py + (world[8] ?? 0) * pz + (world[12] ?? 0);
          const y = (world[1] ?? 0) * px + (world[5] ?? 0) * py + (world[9] ?? 0) * pz + (world[13] ?? 0);
          const z = (world[2] ?? 0) * px + (world[6] ?? 0) * py + (world[10] ?? 0) * pz + (world[14] ?? 0);
          min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y); min[2] = Math.min(min[2], z);
          max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], y); max[2] = Math.max(max[2], z);
        }
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  for (const root of roots) visit(root, identity);

  const imageIndexes = new Set<number>();
  for (const texture of json.textures ?? []) {
    const source = texture.extensions?.EXT_texture_webp?.source ?? texture.source;
    if (source !== undefined) imageIndexes.add(source);
  }
  const images = [...imageIndexes].map((index) => {
    const image = json.images?.[index];
    const view = image?.bufferView === undefined ? undefined : json.bufferViews[image.bufferView];
    if (!image || !view) throw new Error(`image ${index} is not embedded`);
    const data = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    return { ...webpSize(data), bytes: view.byteLength, mimeType: image.mimeType ?? '' };
  });
  return { json, triangles, drawCalls, min, max, textureBytes: images.reduce((sum, i) => sum + i.bytes, 0), images };
}
