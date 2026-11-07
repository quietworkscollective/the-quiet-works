import { EXCHANGE_VIEWS, type ExchangeViewId } from '../stage.ts';
import { PLATE_OPEN_RADIANS } from './pose.ts';

/**
 * The export gate for lettering in the scene. Each lettered face is a printed quad; this reads the
 * shipped binary and works out, for the view that shows the face, which way its print runs on screen.
 */
export interface LetteredFace {
  readonly node: string;
  readonly view: ExchangeViewId;
  /** The plate's inner face reads only in the open pose. */
  readonly plate: 'shut' | 'open' | null;
}

export const LETTERED_FACES: readonly LetteredFace[] = [
  { node: 'exchange_board_title_face', view: 'wide', plate: null },
  { node: 'line_card_03', view: 'jacks', plate: null },
  { node: 'operator_plate_outer', view: 'kneehole', plate: 'shut' },
  { node: 'operator_plate_inner', view: 'kneehole', plate: 'open' },
];

type Vector = readonly [number, number, number];
type Quaternion = readonly [number, number, number, number];

interface Accessor { bufferView: number; byteOffset?: number; count: number; componentType: number; normalized?: boolean; type: string }
interface BufferView { byteOffset?: number; byteStride?: number }
export interface GltfNode {
  name?: string;
  mesh?: number;
  children?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}
export interface Gltf {
  nodes: GltfNode[];
  meshes: { primitives: { attributes: Record<string, number> }[] }[];
  accessors: Accessor[];
  bufferViews: BufferView[];
}
export interface GlbDocument { json: Gltf; bin: DataView }

export function readGlbDocument(bytes: Uint8Array): GlbDocument {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as Gltf;
  const binStart = 20 + jsonLength + 8;
  return { json, bin: new DataView(bytes.buffer, bytes.byteOffset + binStart, bytes.byteLength - binStart) };
}

const COMPONENTS = new Map([['VEC2', 2], ['VEC3', 3]]);
const WIDTHS = new Map([[5120, 1], [5121, 1], [5122, 2], [5123, 2], [5126, 4]]);

export function readAccessor({ json, bin }: GlbDocument, index: number): number[][] {
  const accessor = json.accessors[index];
  const bufferView = accessor ? json.bufferViews[accessor.bufferView] : undefined;
  const components = COMPONENTS.get(accessor?.type ?? '');
  const width = WIDTHS.get(accessor?.componentType ?? 0);
  if (!accessor || !bufferView || !components || !width) throw new Error(`Accessor ${String(index)} cannot be read`);
  const stride = bufferView.byteStride ?? components * width;
  const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const read = (at: number): number => {
    switch (accessor.componentType) {
      case 5126: return bin.getFloat32(at, true);
      case 5123: return accessor.normalized ? bin.getUint16(at, true) / 65535 : bin.getUint16(at, true);
      case 5121: return accessor.normalized ? bin.getUint8(at) / 255 : bin.getUint8(at);
      case 5122: return accessor.normalized ? Math.max(bin.getInt16(at, true) / 32767, -1) : bin.getInt16(at, true);
      default: return accessor.normalized ? Math.max(bin.getInt8(at) / 127, -1) : bin.getInt8(at);
    }
  };
  return Array.from({ length: accessor.count }, (_, row) =>
    Array.from({ length: components }, (__, column) => read(start + row * stride + column * width)));
}

function rotate(q: Quaternion, v: Vector): Vector {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx];
}

function parents(json: Gltf): Map<number, number> {
  const map = new Map<number, number>();
  json.nodes.forEach((node, index) => node.children?.forEach(child => map.set(child, index)));
  return map;
}

function triple(values: readonly number[] | undefined, fallback: number): Vector {
  return [values?.[0] ?? fallback, values?.[1] ?? fallback, values?.[2] ?? fallback];
}

function toWorld(json: Gltf, nodeIndex: number, point: Vector, swing: ReadonlyMap<string, number>): Vector {
  const above = parents(json);
  let at = point;
  for (let index: number | undefined = nodeIndex; index !== undefined; index = above.get(index)) {
    const node: GltfNode | undefined = json.nodes[index];
    if (!node) break;
    const scale = triple(node.scale, 1);
    at = [at[0] * scale[0], at[1] * scale[1], at[2] * scale[2]];
    const yaw = swing.get(node.name ?? '');
    const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
    at = rotate(yaw === undefined ? [x ?? 0, y ?? 0, z ?? 0, w ?? 1] : [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], at);
    const shift = triple(node.translation, 0);
    at = [at[0] + shift[0], at[1] + shift[1], at[2] + shift[2]];
  }
  return at;
}

const minus = (a: Vector, b: Vector): Vector => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vector, b: Vector): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vector, b: Vector): Vector => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vector): Vector => {
  const length = Math.hypot(...a) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};
const mean = (points: readonly Vector[]): Vector => {
  const total = points.reduce<Vector>((sum, point) => [sum[0] + point[0], sum[1] + point[1], sum[2] + point[2]], [0, 0, 0]);
  return [total[0] / points.length, total[1] / points.length, total[2] / points.length];
};

export interface FaceReading {
  /** Dot of the print's +u axis with the camera's right: positive reads left to right. */
  readonly screenRight: number;
  /** Dot of the printed side's normal with the way back to the camera: positive faces the visitor. */
  readonly facing: number;
}

interface Corner { readonly u: number; readonly v: number; readonly at: Vector }

/** The printed corners are the vertices with their own texture coordinate; sides and back share one stock texel. */
function printedCorners(document: GlbDocument, face: LetteredFace): Corner[] {
  const { json } = document;
  const nodeIndex = json.nodes.findIndex(node => node.name === face.node);
  const mesh = json.nodes[nodeIndex]?.mesh;
  const attributes = mesh === undefined ? undefined : json.meshes[mesh]?.primitives[0]?.attributes;
  const position = attributes?.['POSITION'];
  const texcoord = attributes?.['TEXCOORD_0'];
  if (position === undefined || texcoord === undefined) throw new Error(`Lettered node has no printed mesh: ${face.node}`);
  const swing = new Map(face.plate === 'open' ? [['operator_plate_pivot', PLATE_OPEN_RADIANS]] : []);
  const coordinates = readAccessor(document, texcoord);
  const counts = new Map<string, number>();
  for (const uv of coordinates) counts.set(uv.join(), (counts.get(uv.join()) ?? 0) + 1);
  return readAccessor(document, position).flatMap((point, index) => {
    const uv = coordinates[index] ?? [];
    if ((counts.get(uv.join()) ?? 0) >= 4) return [];
    return [{ u: uv[0] ?? 0, v: uv[1] ?? 0, at: toWorld(json, nodeIndex, triple(point, 0), swing) }];
  });
}

export function readFace(document: GlbDocument, face: LetteredFace): FaceReading {
  const corners = printedCorners(document, face);
  const middleU = (Math.min(...corners.map(corner => corner.u)) + Math.max(...corners.map(corner => corner.u))) / 2;
  const middleV = (Math.min(...corners.map(corner => corner.v)) + Math.max(...corners.map(corner => corner.v))) / 2;
  const side = (test: (corner: Corner) => boolean) => mean(corners.filter(test).map(corner => corner.at));
  const uAxis = unit(minus(side(corner => corner.u > middleU), side(corner => corner.u < middleU)));
  // glTF texture space runs downward, so the print's up is toward smaller v.
  const upAxis = unit(minus(side(corner => corner.v < middleV), side(corner => corner.v > middleV)));

  const view = EXCHANGE_VIEWS[face.view];
  const forward = unit(minus(view.target, view.position));
  const right = unit(cross(forward, [0, 1, 0]));
  return {
    screenRight: dot(uAxis, right),
    facing: dot(unit(cross(uAxis, upAxis)), unit(minus(view.position, mean(corners.map(corner => corner.at))))),
  };
}
