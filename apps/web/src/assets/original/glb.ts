/**
 * A small glTF binary reader for measuring the shipped props: triangle count, texture bytes, named nodes and
 * world-space size. It reads the vertex data itself rather than trusting accessor bounds, and it uses only
 * erasable TypeScript so the Node build script can run it directly.
 */

export interface GlbStats {
  /** Triangles drawn when the whole scene is rendered once (a mesh used by two nodes counts twice). */
  triangles: number;
  /** Size of the file. */
  fileBytes: number;
  /** Encoded bytes of every embedded image. */
  textureBytes: number;
  /** MIME type of every embedded image. */
  imageTypes: string[];
  nodeNames: string[];
  /** Names of mesh nodes whose material has a non-zero emissive factor (a lamp's glow, lit by the runtime). */
  emissiveNodeNames: string[];
  /** World-space axis-aligned size in metres, in glTF axes (x across, y up, z toward the viewer). */
  size: { x: number; y: number; z: number };
  /** World-space minimum corner, to check the floor-centre origin. */
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
  extensionsUsed: string[];
  extensionsRequired: string[];
  /** Number of mesh nodes (one draw call each, as long as they share a material). */
  meshNodes: number;
  generator: string | undefined;
  copyright: string | undefined;
}

interface Accessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  normalized?: boolean;
}

interface BufferView {
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
}

interface Primitive {
  attributes: Record<string, number>;
  indices?: number;
  mode?: number;
}

interface GltfNode {
  name?: string;
  mesh?: number;
  children?: number[];
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}

interface GltfMaterial {
  emissiveFactor?: number[];
}

interface Gltf {
  asset?: { generator?: string; copyright?: string };
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: GltfNode[];
  meshes?: { primitives: (Primitive & { material?: number })[] }[];
  materials?: GltfMaterial[];
  accessors?: Accessor[];
  bufferViews?: BufferView[];
  images?: { bufferView?: number; mimeType?: string; uri?: string }[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
}

const COMPONENT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

type Mat4 = number[];

function identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** Column-major 4x4 product a * b. */
function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + r] ?? 0) * (b[c * 4 + k] ?? 0);
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

function localMatrix(node: GltfNode): Mat4 {
  if (node.matrix) return node.matrix.slice();
  const [tx = 0, ty = 0, tz = 0] = node.translation ?? [];
  const [qx = 0, qy = 0, qz = 0, qw = 1] = node.rotation ?? [];
  const [sx = 1, sy = 1, sz = 1] = node.scale ?? [];
  const xx = qx * qx, yy = qy * qy, zz = qz * qz;
  const xy = qx * qy, xz = qx * qz, yz = qy * qz;
  const wx = qw * qx, wy = qw * qy, wz = qw * qz;
  return [
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function readChunks(bytes: Uint8Array): { json: Gltf; bin: Uint8Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('not a glTF binary (bad magic)');
  if (view.getUint32(4, true) !== 2) throw new Error('unsupported glTF binary version');
  if (view.getUint32(8, true) !== bytes.byteLength) throw new Error('glTF binary length does not match the file size');
  let offset = 12;
  let json: Gltf | undefined;
  let bin: Uint8Array = new Uint8Array(0);
  while (offset + 8 <= bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body)) as Gltf;
    else if (type === 0x004e4942) bin = body;
    offset += 8 + length;
  }
  if (!json) throw new Error('glTF binary has no JSON chunk');
  return { json, bin };
}

/** Decode a float or integer accessor into a flat array (normalised integers are scaled to [-1, 1] or [0, 1]). */
function readAccessor(gltf: Gltf, bin: Uint8Array, index: number): { data: number[]; components: number } {
  const acc = gltf.accessors?.[index];
  if (!acc) throw new Error(`missing accessor ${index}`);
  const components = TYPE_COMPONENTS[acc.type];
  const size = COMPONENT_BYTES[acc.componentType];
  if (components === undefined || size === undefined) throw new Error(`unsupported accessor ${index}`);
  const out = new Array<number>(acc.count * components).fill(0);
  if (acc.bufferView === undefined) return { data: out, components };
  const bv = gltf.bufferViews?.[acc.bufferView];
  if (!bv) throw new Error(`missing buffer view ${acc.bufferView}`);
  const stride = bv.byteStride ?? components * size;
  const base = bin.byteOffset + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const view = new DataView(bin.buffer, 0, bin.buffer.byteLength);
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < components; c++) {
      const at = base + i * stride + c * size;
      let v: number;
      switch (acc.componentType) {
        case 5126: v = view.getFloat32(at, true); break;
        case 5125: v = view.getUint32(at, true); break;
        case 5123: v = view.getUint16(at, true); if (acc.normalized) v /= 65535; break;
        case 5122: v = view.getInt16(at, true); if (acc.normalized) v = Math.max(v / 32767, -1); break;
        case 5121: v = view.getUint8(at); if (acc.normalized) v /= 255; break;
        default: v = view.getInt8(at); if (acc.normalized) v = Math.max(v / 127, -1); break;
      }
      out[i * components + c] = v;
    }
  }
  return { data: out, components };
}

export function readGlb(bytes: Uint8Array): GlbStats {
  const { json, bin } = readChunks(bytes);
  const nodes = json.nodes ?? [];
  const meshes = json.meshes ?? [];
  const sceneIndex = json.scene ?? 0;
  const roots = json.scenes?.[sceneIndex]?.nodes ?? [];

  let triangles = 0;
  let meshNodes = 0;
  const emissiveNodeNames: string[] = [];
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };

  const visit = (nodeIndex: number, parent: Mat4, depth: number): void => {
    if (depth > 64) throw new Error('node hierarchy is too deep or cyclic');
    const node = nodes[nodeIndex];
    if (!node) throw new Error(`missing node ${nodeIndex}`);
    const world = multiply(parent, localMatrix(node));
    const [m0 = 0, m1 = 0, m2 = 0, , m4 = 0, m5 = 0, m6 = 0, , m8 = 0, m9 = 0, m10 = 0, , m12 = 0, m13 = 0, m14 = 0] = world;
    if (node.mesh !== undefined) {
      meshNodes += 1;
      const mesh = meshes[node.mesh];
      if (!mesh) throw new Error(`missing mesh ${node.mesh}`);
      for (const prim of mesh.primitives) {
        const emissive = prim.material !== undefined ? json.materials?.[prim.material]?.emissiveFactor : undefined;
        if (emissive?.some((c) => c > 0) && node.name !== undefined && !emissiveNodeNames.includes(node.name)) emissiveNodeNames.push(node.name);
        const mode = prim.mode ?? 4;
        if (mode !== 4) throw new Error('only triangle lists are supported');
        const position = prim.attributes['POSITION'];
        if (position === undefined) throw new Error('primitive has no POSITION');
        const pos = readAccessor(json, bin, position);
        triangles += prim.indices !== undefined
          ? (json.accessors?.[prim.indices]?.count ?? 0) / 3
          : pos.data.length / 9;
        for (let i = 0; i < pos.data.length; i += 3) {
          const x = pos.data[i] ?? 0, y = pos.data[i + 1] ?? 0, z = pos.data[i + 2] ?? 0;
          const wx = m0 * x + m4 * y + m8 * z + m12;
          const wy = m1 * x + m5 * y + m9 * z + m13;
          const wz = m2 * x + m6 * y + m10 * z + m14;
          min.x = Math.min(min.x, wx); max.x = Math.max(max.x, wx);
          min.y = Math.min(min.y, wy); max.y = Math.max(max.y, wy);
          min.z = Math.min(min.z, wz); max.z = Math.max(max.z, wz);
        }
      }
    }
    for (const child of node.children ?? []) visit(child, world, depth + 1);
  };
  for (const root of roots) visit(root, identity(), 0);

  let textureBytes = 0;
  const imageTypes: string[] = [];
  for (const image of json.images ?? []) {
    if (image.bufferView === undefined) throw new Error('images must be embedded in the binary');
    textureBytes += json.bufferViews?.[image.bufferView]?.byteLength ?? 0;
    imageTypes.push(image.mimeType ?? 'unknown');
  }

  return {
    triangles,
    fileBytes: bytes.byteLength,
    textureBytes,
    imageTypes,
    nodeNames: nodes.map((n) => n.name ?? ''),
    emissiveNodeNames,
    size: { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z },
    min,
    max,
    extensionsUsed: json.extensionsUsed ?? [],
    extensionsRequired: json.extensionsRequired ?? [],
    meshNodes,
    generator: json.asset?.generator,
    copyright: json.asset?.copyright,
  };
}
